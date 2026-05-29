"""Build sample-frame data + JPGs for the frontend Profiling sample-views section.

For each (split, clip, frame) in SAMPLES below, this script:
  1. Copies the source JPG to frontend/public/data/samples/
  2. Reads ground-truth pitch-meter coords from Labels-GameState.json
  3. Reads each model's predictions from results/*_preds.csv
  4. Emits frontend/public/data/samples.json bundling all of the above

Re-run this whenever the benchmark predictions are refreshed.

Run from repo root:  uv run --no-project build_samples.py
"""
from __future__ import annotations

import csv
import json
import shutil
from collections import defaultdict
from pathlib import Path

# Edit this list to change which frames are showcased on the Profiling page.
SAMPLES = [
    {
        "id": "L-0-5",
        "label": "Image 1",
        "split": "test",
        "clip": "SNGS-136",
        "frame": "000521.jpg",
    },
    {
        "id": "M-11-15",
        "label": "Image 2",
        "split": "test",
        "clip": "SNGS-126",
        "frame": "000336.jpg",
    },
    {
        "id": "R-6-10",
        "label": "Image 3",
        "split": "test",
        "clip": "SNGS-117",
        "frame": "000605.jpg",
    },
]

REPO = Path(__file__).resolve().parent
RESULTS = REPO / "results"
# Images live under test_peek today; fall back to canonical {split} dirs if/when
# the full split is unzipped.
CLIP_ROOTS = [
    REPO / "data" / "gamestate-2024" / "test_peek",
    REPO / "data" / "gamestate-2024" / "test",
    REPO / "data" / "gamestate-2024" / "valid",
]

OUT_DIR = REPO / "frontend" / "public" / "data"
SAMPLES_DIR = OUT_DIR / "samples"
SAMPLES_JSON = OUT_DIR / "samples.json"


def find_clip_dir(clip: str) -> Path:
    for root in CLIP_ROOTS:
        p = root / clip
        if p.exists():
            return p
    raise FileNotFoundError(f"clip dir not found in any of {CLIP_ROOTS}: {clip}")


def load_gt(labels_path: Path, frame_file: str) -> list[dict]:
    data = json.loads(labels_path.read_text(encoding="utf-8"))
    imgs = [im for im in data["images"] if im["file_name"] == frame_file]
    if not imgs:
        raise RuntimeError(f"frame {frame_file} not in {labels_path}")
    image_id = imgs[0]["image_id"]
    out: list[dict] = []
    for ann in data["annotations"]:
        if ann.get("image_id") != image_id:
            continue
        if ann.get("supercategory") != "object":
            continue
        if ann.get("attributes", {}).get("role") not in ("player", "goalkeeper"):
            continue
        bp = ann.get("bbox_pitch")
        if not bp:
            continue
        out.append({"x": bp["x_bottom_middle"], "y": bp["y_bottom_middle"]})
    return out


def load_all_preds() -> dict[str, dict[tuple[str, str, str], list[dict]]]:
    """Map model_name -> {(split, clip, frame): [{x, y}, ...]}."""
    out: dict[str, dict[tuple[str, str, str], list[dict]]] = {}
    for path in sorted(RESULTS.glob("*_preds.csv")):
        model = path.stem[: -len("_preds")]
        per_frame: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
        with path.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                key = (r["split"], r["clip"], r["frame"])
                per_frame[key].append({"x": float(r["x"]), "y": float(r["y"])})
        out[model] = per_frame
    return out


def main() -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    all_preds = load_all_preds()

    out_samples = []
    for s in SAMPLES:
        clip_dir = find_clip_dir(s["clip"])
        src_jpg = clip_dir / "img1" / s["frame"]
        if not src_jpg.exists():
            raise FileNotFoundError(f"image not found: {src_jpg}")
        dst_name = f"{s['clip']}-{s['frame']}"
        shutil.copy2(src_jpg, SAMPLES_DIR / dst_name)

        gt = load_gt(clip_dir / "Labels-GameState.json", s["frame"])

        key = (s["split"], s["clip"], s["frame"])
        # Skip models with no predictions on this frame so the dropdown doesn't lie.
        predictions = {
            model: pts
            for model, per_frame in all_preds.items()
            if (pts := per_frame.get(key))
        }

        out_samples.append({
            "id": s["id"],
            "label": s["label"],
            "image": f"data/samples/{dst_name}",
            "groundTruth": gt,
            "predictions": predictions,
        })
        print(f"  {s['id']}: {len(gt)} GT, {len(predictions)} models")

    SAMPLES_JSON.write_text(
        json.dumps({"samples": out_samples}, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {SAMPLES_JSON}")
    print(f"wrote {len(out_samples)} JPGs to {SAMPLES_DIR}")


if __name__ == "__main__":
    main()
