"""
Backfill the `direction` column into every *_scores.csv based on manifest.csv.

For each row, looks up (split, clip, frame) in manifest.csv and copies the
direction value (L / M / R) into a new `direction` column written at the end
of the row. Idempotent: files that already have the column are skipped.

Run with `uv run python add_direction_to_scores.py` (this machine routes
Python through uv).
"""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "manifest.csv"
TARGET_DIRS = [ROOT / "baseline_results", ROOT / "llm_results"]


def load_manifest_directions() -> dict[tuple[str, str, str], str]:
    out: dict[tuple[str, str, str], str] = {}
    with MANIFEST.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[(row["split"], row["clip"], row["frame"])] = row["direction"]
    return out


def add_direction_column(path: Path, lookup: dict[tuple[str, str, str], str]) -> str:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    if "direction" in fieldnames:
        return "skip (already has direction)"

    new_fields = fieldnames + ["direction"]
    missing = 0
    for row in rows:
        key = (row["split"], row["clip"], row["frame"])
        d = lookup.get(key)
        if d is None:
            missing += 1
            row["direction"] = ""
        else:
            row["direction"] = d

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=new_fields)
        w.writeheader()
        w.writerows(rows)
    return f"updated ({missing} rows had no manifest match)" if missing else "updated"


def main() -> None:
    lookup = load_manifest_directions()
    print(f"loaded {len(lookup)} manifest rows from {MANIFEST.name}")

    files: list[Path] = []
    for d in TARGET_DIRS:
        if d.exists():
            files.extend(sorted(d.glob("*_scores.csv")))
    if not files:
        print("no *_scores.csv files found under", [str(p) for p in TARGET_DIRS])
        return

    for f in files:
        rel = f.relative_to(ROOT)
        status = add_direction_column(f, lookup)
        print(f"  {rel}: {status}")


if __name__ == "__main__":
    main()
