"""
Run the sn-gamestate baseline on each clip referenced by the benchmark
manifest, extract pitch-meter player positions for the manifest's frames,
and write them to a single text CSV.

Resumable: clips already in the output CSV are skipped on re-run.
Per-clip tracklab outputs (pklz, ~100 MB) are deleted after extraction
unless --keep-pklz is passed.

Defaults read manifest.csv next to this script and write to
baseline_preds.csv next to this script. Data is read from
./data/SoccerNetGS by default; the path to your local sn-gamestate
clone must be supplied via --sn-gamestate-dir.
"""
from __future__ import annotations

import argparse
import csv
import io
import shutil
import subprocess
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_MANIFEST = ROOT / "manifest.csv"
DEFAULT_SOCCERNET_DIR = ROOT / "data" / "SoccerNetGS"
DEFAULT_OUT = ROOT / "baseline_preds.csv"
CSV_FIELDS = ["split", "clip", "frame", "x", "y"]


def read_manifest(path: Path) -> dict[tuple[str, str], set[str]]:
    out: dict[tuple[str, str], set[str]] = defaultdict(set)
    with path.open() as f:
        for row in csv.DictReader(f):
            out[(row["split"], row["clip"])].add(row["frame"])
    return out


def clips_already_done(out_path: Path) -> set[tuple[str, str]]:
    if not out_path.exists():
        return set()
    seen: set[tuple[str, str]] = set()
    with out_path.open() as f:
        for row in csv.DictReader(f):
            seen.add((row["split"], row["clip"]))
    return seen


def clip_data_present(soccernet_dir: Path, split: str, clip: str) -> bool:
    p = soccernet_dir / split / clip
    img1 = p / "img1"
    return (
        (p / "Labels-GameState.json").exists()
        and img1.exists()
        and any(img1.iterdir())
    )


def run_tracklab(sn_gamestate_dir: Path, soccernet_dir: Path,
                 split: str, clip: str, run_dir: Path) -> Path:
    cmd = [
        "uv", "run", "tracklab",
        "-cn", "soccernet",
        f"data_dir={soccernet_dir.parent.absolute()}",
        f"dataset.dataset_path={soccernet_dir.absolute()}",
        f"dataset.eval_set={split}",
        f'dataset.vids_dict.{split}=["{clip}"]',
        "eval_tracking=False",
        f"hydra.run.dir={run_dir.absolute()}",
    ]
    print(f"  $ (cwd={sn_gamestate_dir}) {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=sn_gamestate_dir)
    if res.returncode != 0:
        raise RuntimeError(f"tracklab exited with code {res.returncode}")
    pklz = run_dir / "states" / "sn-gamestate.pklz"
    if not pklz.exists():
        raise RuntimeError(f"pklz not produced at expected path: {pklz}")
    return pklz


def extract_preds(pklz: Path, frames: set[str]) -> dict[str, list[tuple[float, float]]]:
    """{frame_filename: [(x, y), ...]}, omitting frames with zero preds."""
    import pandas as pd

    with zipfile.ZipFile(pklz) as z:
        names = z.namelist()
        det_name = next(n for n in names if n.endswith(".pkl") and not n.endswith("_image.pkl"))
        img_name = next(n for n in names if n.endswith("_image.pkl"))
        with z.open(det_name) as f:
            detections = pd.read_pickle(io.BytesIO(f.read()))
        with z.open(img_name) as f:
            images = pd.read_pickle(io.BytesIO(f.read()))

    out: dict[str, list[tuple[float, float]]] = {}
    for frame in sorted(frames):
        matches = images[images["file_path"].astype(str).str.endswith(frame)]
        if matches.empty:
            print(f"    WARNING: frame {frame} not found in pklz")
            continue
        iid = matches.index[0]
        rows = detections[detections["image_id"] == iid]
        if "role" in rows.columns:
            rows = rows[rows["role"].isin(["player", "goalkeeper"])]
        preds: list[tuple[float, float]] = []
        for bp in rows["bbox_pitch"]:
            if isinstance(bp, dict) and "x_bottom_middle" in bp:
                preds.append((float(bp["x_bottom_middle"]), float(bp["y_bottom_middle"])))
        if preds:
            out[frame] = preds
    return out


def append_csv(out_path: Path, split: str, clip: str,
               frame_to_preds: dict[str, list[tuple[float, float]]]):
    new_file = not out_path.exists()
    with out_path.open("a", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(CSV_FIELDS)
        for frame, preds in sorted(frame_to_preds.items()):
            for x, y in preds:
                w.writerow([split, clip, frame, f"{x:.6f}", f"{y:.6f}"])


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--soccernet-dir", type=Path, default=DEFAULT_SOCCERNET_DIR)
    ap.add_argument("--sn-gamestate-dir", type=Path, required=True,
                    help="Path to your local sn-gamestate clone")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--run-dir-root", type=Path, default=None,
                    help="Where per-clip tracklab outputs go "
                         "(default: <sn-gamestate-dir>/outputs/manifest_run)")
    ap.add_argument("--keep-pklz", action="store_true",
                    help="Keep per-clip tracklab outputs after extraction")
    args = ap.parse_args()

    if not args.sn_gamestate_dir.exists():
        sys.exit(f"--sn-gamestate-dir does not exist: {args.sn_gamestate_dir}")

    needed = read_manifest(args.manifest)
    done = clips_already_done(args.out)
    todo = [(s, c, frames) for (s, c), frames in sorted(needed.items()) if (s, c) not in done]
    total_frames = sum(len(v) for v in needed.values())
    print(f"manifest: {args.manifest}")
    print(f"  clips: {len(needed)}  frames: {total_frames}")
    print(f"already done: {len(done)} clips")
    print(f"to process:   {len(todo)} clips\n")

    run_dir_root = args.run_dir_root or (args.sn_gamestate_dir / "outputs" / "manifest_run")
    failed: list[str] = []

    for i, (split, clip, frames) in enumerate(todo, 1):
        tag = f"{split}/{clip}"
        print(f"[{i}/{len(todo)}] {tag}  ({len(frames)} frames)")
        if not clip_data_present(args.soccernet_dir, split, clip):
            print(f"  ERROR: clip data missing at {args.soccernet_dir/split/clip}. "
                  f"Run download_data.py first.")
            failed.append(tag)
            continue
        run_dir = run_dir_root / f"{split}_{clip}"
        try:
            pklz = run_tracklab(args.sn_gamestate_dir, args.soccernet_dir,
                                split, clip, run_dir)
            frame_to_preds = extract_preds(pklz, frames)
            append_csv(args.out, split, clip, frame_to_preds)
            n_with_preds = len(frame_to_preds)
            n_total_preds = sum(len(v) for v in frame_to_preds.values())
            print(f"  -> {n_total_preds} preds across {n_with_preds}/{len(frames)} frames")
        except Exception as e:
            print(f"  FAILED: {e}")
            failed.append(tag)
            continue
        finally:
            if not args.keep_pklz and run_dir.exists():
                shutil.rmtree(run_dir, ignore_errors=True)

    print(f"\ndone. processed={len(todo) - len(failed)}  failed={len(failed)}  output={args.out}")
    if failed:
        print("failed clips:")
        for f in failed:
            print(f"  {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
