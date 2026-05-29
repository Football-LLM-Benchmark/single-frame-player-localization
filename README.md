# Football Image LLM Benchmark

**Live leaderboard:** https://football-llm-benchmark.github.io/single-frame-player-localization/

A public research benchmark evaluating multimodal LLMs on predicting player
XY pitch coordinates (in meters) from broadcast still frames of professional
football matches. Ground truth comes from the SoccerNet GameState 2024
dataset (test + valid splits combined).

The scored unit is one frame: the model is given an image and must return
the pitch-meter (x, y) of every player visible. Scoring is position-only
via GOSPA(c=30 m, p=1, α=2); the headline leaderboard number is the mean
over the manifest of `GOSPA / max(n_gt, 1)`.

The scored set of frames is fixed in `manifest.csv` (396 frames, stratified
across camera direction × in-camera player count, drawn from 100 distinct
clips).

## Reproducing the results

The flow is the same regardless of what you're benchmarking:

1. Install prerequisites
2. Download the dataset
3. Generate predictions (CV baseline, a single LLM, or many LLMs)
4. Score the predictions

### 1. Prerequisites

Common to all paths:

- Linux machine; Python 3.9+
- `~`50 GB free disk for dataset + intermediate state
- `pip install SoccerNet boto3`

Path-specific extras:

- **CV baseline** — NVIDIA GPU (≥10 GB VRAM; benchmarked on g5.xlarge / A10G),
  plus the upstream sn-gamestate repo cloned and set up per its README so you
  can run `uv run tracklab -cn soccernet …` from inside that clone:
  https://github.com/SoccerNet/sn-gamestate
- **LLM evaluations** — AWS credentials configured for an account that has
  Bedrock model access enabled in `us-east-1` for every model you want to
  evaluate (Bedrock console → Model access).

### 2. Download data

Reads `manifest.csv` and ensures every (split, clip) it references is
unzipped under `data/SoccerNetGS/{split}/SNGS-XXX/`. Idempotent: a
fully-prepared machine is a no-op; a partially-prepared one only
downloads what's missing.

```bash
python download_data.py
```

Flags (all optional):
- `--manifest PATH` — alternate manifest (default: `./manifest.csv`)
- `--soccernet-dir PATH` — where data goes (default: `./data/SoccerNetGS`)
- `--keep-zips` — don't delete `{split}.zip` after extraction

### 3a. Generate predictions — CV baseline

For each unique clip in the manifest, runs sn-gamestate on the full clip,
extracts pitch-meter predictions for the manifest's specific frames in
that clip, and appends them to a single text CSV. Per-clip tracklab
state (`pklz`) is deleted after extraction.

```bash
python run_baseline.py \
    --sn-gamestate-dir /path/to/your/sn-gamestate \
    --out results/baseline_preds.csv
```

Resumable: if interrupted, re-running picks up from the next un-extracted
clip. Approximate wall time on the default 396-frame / 100-clip manifest:
~10 hours on a g5.xlarge.

Other flags:
- `--manifest PATH`, `--soccernet-dir PATH` — same idea as `download_data.py`
- `--run-dir-root PATH` — where per-clip tracklab outputs go
  (default: `<sn-gamestate-dir>/outputs/manifest_run`)
- `--keep-pklz` — don't delete per-clip tracklab state after extraction

### 3b. Generate predictions — single LLM

The LLM harness calls a chosen Bedrock multimodal model on every frame in
the manifest, parses a JSON array of `(x, y)` predictions out of the
response, and appends them to `<model>_preds.csv`. Resumable: a frame is
"done" iff its raw response is on disk under `raw_outputs/<model>/`.

```bash
python run_llm.py --model claude-opus-4-8 --out-dir results/
```

Outputs (under `--out-dir`):
- `<model>_preds.csv` — one row per predicted player (schema:
  `split,clip,frame,x,y`, same as `baseline_preds.csv`)
- `raw_outputs/<model>/<clip>_<frame>.txt` — raw model response per
  successful frame (also serves as the resumability marker)
- `raw_outputs/<model>/<clip>_<frame>.failed.txt` — last raw response for
  frames that exhausted retries (re-run the script to retry)

Flags:
- `--model NAME` (required) — one of: `claude-opus-4-8`, `claude-opus-4-7`,
  `claude-sonnet-4-6`, `nova-pro`, `llama4-maverick`, `llama4-scout`,
  `pixtral-large`, `gemma-3-27b`, `qwen3-vl`, `nemotron-nano`, `kimi-k2.5`
- `--max-attempts N` — retries per frame on call/parse failure (default 5)
- `--manifest`, `--soccernet-dir`, `--prompt`, `--out-dir`, `--region` —
  overrides for the corresponding defaults
- `--limit N` — process only the first N un-done frames (smoke testing)

### 3c. Generate predictions — multiple LLMs

Sequential loop (each model is independent and resumable):

```bash
for m in claude-opus-4-8 claude-opus-4-7 claude-sonnet-4-6 \
         llama4-maverick llama4-scout pixtral-large \
         gemma-3-27b qwen3-vl nemotron-nano kimi-k2.5 nova-pro; do
  echo "=== $m ==="
  python -u run_llm.py --model "$m" --out-dir results/
done
```

You can also run different models in parallel from separate shells — each
model has its own CSV and its own `raw_outputs/<model>/` directory, so
there's no shared mutable state. Don't run the same model twice in
parallel; both processes would race on the same un-done frames and
double-write the CSV.

### 4. Score the predictions

`score_preds.py` works on any CSV with the `split,clip,frame,x,y` schema —
both baseline and LLM outputs qualify:

```bash
python score_preds.py --preds results/claude-opus-4-8_preds.csv
```

Prints aggregate counts and the headline `mean GOSPA / max(n_gt, 1)`.

For per-frame scores (used to build distributions, CDFs, per-bucket plots,
etc.), pass `--per-frame-out`:

```bash
python score_preds.py \
    --preds results/claude-opus-4-8_preds.csv \
    --per-frame-out results/claude-opus-4-8_scores.csv
```

The per-frame CSV schema is
`split,clip,frame,n_pred,n_gt,gospa,gospa_normalized,missed,false`, where
`gospa_normalized = gospa / max(n_gt, 1)` is the per-frame contribution to
the headline.

To score every model in `results/` at once:

```bash
for f in results/*_preds.csv; do
  m=$(basename "$f" _preds.csv)
  echo "=== $m ==="
  python score_preds.py --preds "$f" \
      --per-frame-out "results/${m}_scores.csv"
done
```

## Manifest

`manifest.csv` is the source of truth for which (split, clip, frame) tuples
are scored. The columns are:

```
split,clip,frame,n_players,direction,bucket
```

`build_manifest.py` documents how it was constructed (stratified across
camera direction `{L,M,R}` × in-camera player count buckets
`{0-5, 6-10, 11-15, 16+}`, frames distributed across as many clips as
possible).
