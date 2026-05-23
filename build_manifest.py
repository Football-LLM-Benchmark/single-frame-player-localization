"""
Build the 400-frame stratified manifest from SoccerNet-GSR test + valid splits.

Stratification (12 cells, 33 frames each, total 396):
- 3 camera directions (goal-based, from pitch annotations):
    L = a "Goal left ..." line is visible (left goal in frame)
    R = a "Goal right ..." line is visible (right goal in frame)
    M = neither goal in frame (or both — very wide shot, rare)
- 4 in-camera player-count buckets: 0-5, 6-10, 11-15, 16+

Within each cell:
- Spread frames across contributing clips as evenly as possible, with a
  per-clip cap derived from a water-filling allocation. This satisfies
  "frames from as many clips as possible" within each cell.
- Within each (clip, cell), pick frames evenly spaced in time to avoid
  near-identical neighboring frames.

Output: manifest.csv with columns:
    split, clip, frame, n_players, direction, bucket
"""

from __future__ import annotations

import csv
import json
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
DATA_ROOT = ROOT / "data" / "gamestate-2024"
TEST_DIR = DATA_ROOT / "test_peek"
VALID_DIR = DATA_ROOT / "valid"
VALID_ZIP = DATA_ROOT / "valid.zip"
OUT_PATH = ROOT / "manifest.csv"

PER_CELL = 33
DIRECTIONS = ("L", "M", "R")
BUCKETS = ("0-5", "6-10", "11-15", "16+")
TARGET_TOTAL = PER_CELL * len(DIRECTIONS) * len(BUCKETS)  # 396

def line_direction(line_names: list[str]) -> str:
    """Classify a frame's camera direction by which goal is visible.

    L if any "Goal left ..." line is annotated (left goal in frame),
    R if any "Goal right ..." line is annotated (right goal in frame),
    M otherwise (neither goal in frame -- midfield/wide-side; or both
    goals visible, which is a very wide shot and lumped into M).
    """
    has_l = any(n.startswith("Goal left") for n in line_names)
    has_r = any(n.startswith("Goal right") for n in line_names)
    if has_l and not has_r:
        return "L"
    if has_r and not has_l:
        return "R"
    return "M"


def player_bucket(n: int) -> str:
    if n <= 5:
        return "0-5"
    if n <= 10:
        return "6-10"
    if n <= 15:
        return "11-15"
    return "16+"


def iter_label_sources():
    """Yield (split, clip, label_dict) for every clip in test + valid."""
    for clip_dir in sorted(TEST_DIR.iterdir()):
        if not clip_dir.is_dir():
            continue
        with open(clip_dir / "Labels-GameState.json") as f:
            yield ("test", clip_dir.name, json.load(f))

    zf = zipfile.ZipFile(VALID_ZIP)
    valid_clips = sorted({
        n.split("/")[0]
        for n in zf.namelist()
        if "/Labels-GameState.json" in n and n.split("/")[0].startswith("SNGS-")
    })
    for clip in valid_clips:
        label_p = VALID_DIR / clip / "Labels-GameState.json"
        if label_p.exists():
            with open(label_p) as f:
                yield ("valid", clip, json.load(f))
        else:
            with zf.open(f"{clip}/Labels-GameState.json") as f:
                yield ("valid", clip, json.load(f))


def index_frames():
    """
    Build cell -> {clip_key -> [(frame_filename, n_players, frame_idx)]}.
    clip_key = (split, clip_name). frame_idx is the int index for sorting
    by time so we can pick evenly-spaced frames within a clip.
    """
    cell_to_clip_to_frames: dict[tuple[str, str], dict[tuple[str, str], list]] = defaultdict(lambda: defaultdict(list))

    for split, clip, d in iter_label_sources():
        img_lines: dict[str, list[str]] = {}
        img_n_players: dict[str, int] = defaultdict(int)
        for a in d["annotations"]:
            sc = a.get("supercategory")
            if sc == "object":
                role = a.get("attributes", {}).get("role")
                if role in ("player", "goalkeeper"):
                    img_n_players[a["image_id"]] += 1
            elif sc == "pitch":
                img_lines[a["image_id"]] = list(a.get("lines", {}).keys())

        for img in d["images"]:
            iid = img["image_id"]
            names = img_lines.get(iid)
            if not names:
                continue  # no pitch annotation -> can't classify
            direction = line_direction(names)
            n = img_n_players[iid]
            bucket = player_bucket(n)
            file_name = img["file_name"]
            frame_idx = int(Path(file_name).stem)
            cell_to_clip_to_frames[(direction, bucket)][(split, clip)].append((file_name, n, frame_idx))

    return cell_to_clip_to_frames


def water_fill_allocate(supplies: list[int], target: int) -> list[int]:
    """
    Allocate `target` items across clips with given `supplies`, as evenly
    as possible. Returns list of allocations same length as supplies.

    Algorithm: sort by supply ascending; repeatedly fill the smallest-supply
    clip's full amount if it's below the per-remaining-clip share, else
    distribute the remainder evenly across the rest.
    """
    n = len(supplies)
    order = sorted(range(n), key=lambda i: supplies[i])
    alloc = [0] * n
    remaining_target = target
    remaining_clips = n

    for idx in order:
        if remaining_clips == 0:
            break
        share = remaining_target // remaining_clips
        leftover = remaining_target - share * remaining_clips
        if supplies[idx] <= share:
            alloc[idx] = supplies[idx]
            remaining_target -= supplies[idx]
        else:
            # Even share for this clip; leftover gets distributed to
            # remaining (higher-supply) clips below via the share update.
            alloc[idx] = share + (1 if leftover > 0 else 0)
            remaining_target -= alloc[idx]
        remaining_clips -= 1

    # If we under-allocated due to integer rounding (shouldn't happen often),
    # add 1 to the highest-supply clips that still have headroom.
    deficit = target - sum(alloc)
    if deficit > 0:
        ranked = sorted(range(n), key=lambda i: -supplies[i])
        for i in ranked:
            if deficit == 0:
                break
            if alloc[i] < supplies[i]:
                alloc[i] += 1
                deficit -= 1

    return alloc


def pick_evenly_spaced(items: list, k: int) -> list:
    """Pick k items from a sorted list with even spacing."""
    if k >= len(items):
        return list(items)
    K = len(items)
    return [items[(i * K) // k] for i in range(k)]


def build_manifest():
    cells = index_frames()

    # Every cell gets exactly PER_CELL frames so that L total == M total ==
    # R total exactly, and every player-count bucket is also exactly equal.
    cell_order = [(d, b) for d in DIRECTIONS for b in BUCKETS]
    cell_targets: dict[tuple[str, str], int] = {cell: PER_CELL for cell in cell_order}

    rows: list[dict] = []

    print(f"Allocating {TARGET_TOTAL} frames across {len(cell_order)} cells ({PER_CELL} each).\n")
    print(f"{'cell':>10s}  {'target':>6s}  {'clips':>5s}  {'pool':>6s}  per-clip allocation")
    print("-" * 90)

    for cell in cell_order:
        target = cell_targets[cell]
        clip_pools = cells.get(cell, {})
        clip_keys = sorted(clip_pools.keys())
        supplies = [len(clip_pools[k]) for k in clip_keys]
        if sum(supplies) < target:
            print(f"WARNING: cell {cell} pool {sum(supplies)} < target {target}, taking all")
            target = sum(supplies)

        alloc = water_fill_allocate(supplies, target)
        per_clip_pretty = ", ".join(
            f"{k[1]}={a}" for k, a in zip(clip_keys, alloc) if a > 0
        )
        cell_label = f"{cell[0]}x{cell[1]}"
        print(f"{cell_label:>10s}  {target:>6d}  {len(clip_keys):>5d}  {sum(supplies):>6d}  {per_clip_pretty}")

        # Pick evenly-spaced frames per clip.
        for (split, clip), n_pick in zip(clip_keys, alloc):
            if n_pick == 0:
                continue
            frames = sorted(clip_pools[(split, clip)], key=lambda x: x[2])  # by frame_idx
            picked = pick_evenly_spaced(frames, n_pick)
            for fname, n_players, _ in picked:
                rows.append({
                    "split": split,
                    "clip": clip,
                    "frame": fname,
                    "n_players": n_players,
                    "direction": cell[0],
                    "bucket": cell[1],
                })

    # Write CSV.
    rows.sort(key=lambda r: (r["direction"], r["bucket"], r["split"], r["clip"], r["frame"]))
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["split", "clip", "frame", "n_players", "direction", "bucket"])
        w.writeheader()
        w.writerows(rows)

    # Summary stats.
    print()
    print(f"Wrote {len(rows)} rows -> {OUT_PATH}")
    by_cell = Counter((r["direction"], r["bucket"]) for r in rows)
    by_dir = Counter(r["direction"] for r in rows)
    by_bucket = Counter(r["bucket"] for r in rows)
    by_split = Counter(r["split"] for r in rows)
    n_unique_clips = len({(r["split"], r["clip"]) for r in rows})
    print(f"unique clips contributing: {n_unique_clips}/107")
    print(f"by direction: {dict(by_dir)}")
    print(f"by bucket:    {dict(by_bucket)}")
    print(f"by split:     {dict(by_split)}")
    print(f"by cell:      {dict(by_cell)}")


if __name__ == "__main__":
    build_manifest()
