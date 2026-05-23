"""
Download and unpack SoccerNet GameState 2024 data for the clips
referenced in the benchmark manifest.

Idempotent: clean machine downloads everything; partial setup
downloads only what's missing; fully-prepared machine is a no-op.

Defaults (no flags needed) read manifest.csv next to this script and
place data under ./data/SoccerNetGS/.
"""
from __future__ import annotations

import argparse
import csv
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_MANIFEST = ROOT / "manifest.csv"
DEFAULT_SOCCERNET_DIR = ROOT / "data" / "SoccerNetGS"
TASK = "gamestate-2024"


def read_manifest(path: Path) -> dict[str, set[str]]:
    needed: dict[str, set[str]] = defaultdict(set)
    with path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            needed[row["split"]].add(row["clip"])
    return needed


def clip_present(soccernet_dir: Path, split: str, clip: str) -> bool:
    p = soccernet_dir / split / clip
    img1 = p / "img1"
    return (
        (p / "Labels-GameState.json").exists()
        and img1.exists()
        and any(img1.iterdir())
    )


def find_zip(soccernet_dir: Path, split: str):
    """Locate {split}.zip somewhere under soccernet_dir (pylib may
    place it in a task subdir)."""
    if not soccernet_dir.exists():
        return None
    candidates = list(soccernet_dir.rglob(f"{split}.zip"))
    return candidates[0] if candidates else None


def download_split(soccernet_dir: Path, split: str) -> Path:
    existing = find_zip(soccernet_dir, split)
    if existing:
        print(f"[{split}] zip already on disk: {existing}")
        return existing
    try:
        from SoccerNet.Downloader import SoccerNetDownloader
    except ImportError:
        sys.exit("error: 'SoccerNet' package not installed. Run: pip install SoccerNet")
    print(f"[{split}] downloading via SoccerNet pylib (this can take several minutes)...")
    soccernet_dir.mkdir(parents=True, exist_ok=True)
    d = SoccerNetDownloader(LocalDirectory=str(soccernet_dir))
    d.downloadDataTask(task=TASK, split=[split])
    found = find_zip(soccernet_dir, split)
    if not found:
        sys.exit(f"error: {split}.zip not found after download under {soccernet_dir}")
    return found


def extract_clips(zip_path: Path, soccernet_dir: Path, split: str, clips: set[str]):
    target_root = soccernet_dir / split
    target_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        # Detect zip layout: clip dir may live at top level or nested.
        sample = next(iter(clips))
        sample_member = next(
            (n for n in names if (f"/{sample}/" in n) or n.startswith(f"{sample}/")),
            None,
        )
        if not sample_member:
            sys.exit(f"error: clip {sample} not found in {zip_path}")
        idx = sample_member.find(sample)
        prefix = sample_member[:idx]  # e.g. "" or "test/" or "gamestate-2024/test/"

        for clip in sorted(clips):
            if clip_present(soccernet_dir, split, clip):
                print(f"  [{split}/{clip}] already present")
                continue
            cp = f"{prefix}{clip}/"
            members = [n for n in names if n.startswith(cp)]
            if not members:
                print(f"  [{split}/{clip}] NOT IN ZIP")
                continue
            print(f"  [{split}/{clip}] extracting {len(members)} files")
            for m in members:
                rel = m[len(cp):]
                if not rel:
                    continue
                dest = target_root / clip / rel
                if m.endswith("/"):
                    dest.mkdir(parents=True, exist_ok=True)
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(m) as src, dest.open("wb") as out:
                    shutil.copyfileobj(src, out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--soccernet-dir", type=Path, default=DEFAULT_SOCCERNET_DIR)
    ap.add_argument("--keep-zips", action="store_true",
                    help="Keep {split}.zip after extraction (default: delete)")
    args = ap.parse_args()

    needed = read_manifest(args.manifest)
    print(f"manifest: {args.manifest}")
    print(f"soccernet dir: {args.soccernet_dir}")
    for split, clips in sorted(needed.items()):
        print(f"  {split}: {len(clips)} clips referenced")

    for split, clips in sorted(needed.items()):
        missing = {c for c in clips if not clip_present(args.soccernet_dir, split, c)}
        if not missing:
            print(f"\n[{split}] all {len(clips)} clips already present")
            continue
        print(f"\n[{split}] {len(missing)}/{len(clips)} clips missing")
        zip_path = download_split(args.soccernet_dir, split)
        extract_clips(zip_path, args.soccernet_dir, split, missing)
        if not args.keep_zips:
            print(f"[{split}] removing zip: {zip_path}")
            zip_path.unlink()
            # Tidy up empty parent dirs left by SoccerNet pylib
            try:
                zip_path.parent.rmdir()
            except OSError:
                pass

    failed = [
        f"{s}/{c}"
        for s, clips in needed.items()
        for c in sorted(clips)
        if not clip_present(args.soccernet_dir, s, c)
    ]
    if failed:
        print("\nFAILED to prepare:")
        for f in failed:
            print(f"  {f}")
        sys.exit(1)
    total = sum(len(v) for v in needed.values())
    print(f"\nOK — {total} clips ready under {args.soccernet_dir}")


if __name__ == "__main__":
    main()
