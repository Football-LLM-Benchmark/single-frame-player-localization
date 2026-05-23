"""
Score a predictions CSV against SoccerNetGS ground truth over the manifest.

The predictions CSV must have the schema `split,clip,frame,x,y` (the same
schema produced by run_baseline.py and the LLM inference harness). For each
(split, clip, frame) in the manifest, loads ground-truth pitch-meter
positions from data/SoccerNetGS/{split}/{clip}/Labels-GameState.json,
gathers predictions for that frame (empty list if absent from the CSV),
and computes per-frame GOSPA(c=30, p=1, alpha=2). Reports the headline:
mean of GOSPA / max(n_gt, 1) over the manifest.

Defaults read manifest.csv and data/SoccerNetGS/ next to this script.
The --preds path is required.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

from scoring import score_frame

ROOT = Path(__file__).resolve().parent
DEFAULT_MANIFEST = ROOT / "manifest.csv"
DEFAULT_SOCCERNET_DIR = ROOT / "data" / "SoccerNetGS"


def read_manifest(path: Path) -> list[tuple[str, str, str, str]]:
    with path.open() as f:
        return [
            (r["split"], r["clip"], r["frame"], r["direction"])
            for r in csv.DictReader(f)
        ]


def read_preds(path: Path) -> dict[tuple[str, str, str], list[tuple[float, float]]]:
    preds: dict[tuple[str, str, str], list[tuple[float, float]]] = defaultdict(list)
    with path.open() as f:
        for r in csv.DictReader(f):
            preds[(r["split"], r["clip"], r["frame"])].append(
                (float(r["x"]), float(r["y"]))
            )
    return preds


def load_gt(labels_path: Path, frame_file: str) -> list[tuple[float, float]]:
    with labels_path.open(encoding="utf-8") as f:
        data = json.load(f)
    imgs = [im for im in data["images"] if im["file_name"] == frame_file]
    if not imgs:
        raise RuntimeError(f"frame {frame_file} not in {labels_path}")
    image_id = imgs[0]["image_id"]
    gt: list[tuple[float, float]] = []
    for ann in data["annotations"]:
        if ann.get("image_id") != image_id:
            continue
        if ann.get("supercategory") != "object":
            continue
        role = ann.get("attributes", {}).get("role")
        if role not in ("player", "goalkeeper"):
            continue
        bp = ann.get("bbox_pitch")
        if not bp:
            continue
        gt.append((bp["x_bottom_middle"], bp["y_bottom_middle"]))
    return gt


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--preds", type=Path, required=True,
                    help="Predictions CSV (schema: split,clip,frame,x,y)")
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--soccernet-dir", type=Path, default=DEFAULT_SOCCERNET_DIR)
    ap.add_argument("--per-frame-out", type=Path, default=None,
                    help="Optional CSV of per-frame results")
    args = ap.parse_args()

    manifest = read_manifest(args.manifest)
    preds = read_preds(args.preds)

    rows: list[dict] = []
    norm_scores: list[float] = []
    for split, clip, frame, direction in manifest:
        labels_path = args.soccernet_dir / split / clip / "Labels-GameState.json"
        if not labels_path.exists():
            print(f"  SKIP (no labels): {split}/{clip}/{frame}")
            continue
        gt = load_gt(labels_path, frame)
        p = preds.get((split, clip, frame), [])
        r = score_frame(p, gt)
        norm_scores.append(r["gospa_normalized"])
        rows.append({
            "split": split, "clip": clip, "frame": frame,
            "n_pred": len(p), "n_gt": len(gt),
            "gospa": r["gospa"],
            "gospa_normalized": r["gospa_normalized"],
            "missed": r["gospa_missed"],
            "false": r["gospa_false"],
            "direction": direction,
        })

    if args.per_frame_out:
        with args.per_frame_out.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"per-frame results -> {args.per_frame_out}")

    n = len(norm_scores)
    mean = sum(norm_scores) / n if n else 0.0
    total_gt = sum(r["n_gt"] for r in rows)
    total_pred = sum(r["n_pred"] for r in rows)
    total_missed = sum(r["missed"] for r in rows)
    total_false = sum(r["false"] for r in rows)
    print(f"frames scored:   {n}")
    print(f"total GT:        {total_gt}")
    print(f"total preds:     {total_pred}")
    print(f"total missed:    {total_missed}")
    print(f"total false:     {total_false}")
    print(f"\nheadline (mean GOSPA / max(n_gt, 1)): {mean:.3f} m  (lower is better)")


if __name__ == "__main__":
    main()
