"""
Run a Bedrock vision LLM over the manifest, writing pitch-meter player
predictions to a per-model CSV with the same schema as run_baseline.py.

For each (split, clip, frame) in the manifest that has not been processed:
  1. Read the image from <soccernet-dir>/<split>/<clip>/img1/<frame>
  2. Send to the chosen model with prompt.md (with retries on call/parse
     failure: --max-attempts, default 5)
  3. On the first attempt that yields a parseable JSON array, save the raw
     output to raw_outputs/<model>/<clip>_<frame>.txt and append predicted
     players to <model>_preds.csv (schema: split,clip,frame,x,y, same as
     baseline_preds.csv)
  4. If all attempts fail, save the last raw response to
     raw_outputs/<model>/<clip>_<frame>.failed.txt and continue. The frame
     will be retried on the next invocation (no .txt marker exists).

Resumable: a frame is "done" iff its <clip>_<frame>.txt exists in
raw_outputs/<model>/. .failed.txt files are inspected, not skipped — re-run
the script to retry them.

Single attempt per frame at the *manifest* level — variance is observed
across the manifest's ~400 frames, not via resampling. The retries here
exist only to force a parseable response, not to average across attempts.
"""
from __future__ import annotations

import argparse
import base64
import csv
import json
import re
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parent
DEFAULT_MANIFEST = ROOT / "manifest.csv"
DEFAULT_SOCCERNET_DIR = ROOT / "data" / "SoccerNetGS"
DEFAULT_PROMPT = ROOT / "prompt.md"
DEFAULT_OUT_DIR = ROOT
REGION = "us-east-1"
MAX_TOKENS = 4096
DEFAULT_MAX_ATTEMPTS = 5

PRED_FIELDS = ["split", "clip", "frame", "x", "y"]

MODELS = [
    {"name": "claude-opus-4-7",    "id": "us.anthropic.claude-opus-4-7",              "api": "converse"},
    {"name": "claude-sonnet-4-6",  "id": "us.anthropic.claude-sonnet-4-6",            "api": "converse"},
    {"name": "nova-pro",           "id": "us.amazon.nova-pro-v1:0",                   "api": "converse"},
    {"name": "llama4-maverick",    "id": "us.meta.llama4-maverick-17b-instruct-v1:0", "api": "converse"},
    {"name": "llama4-scout",       "id": "us.meta.llama4-scout-17b-instruct-v1:0",    "api": "converse"},
    {"name": "pixtral-large",      "id": "us.mistral.pixtral-large-2502-v1:0",        "api": "converse"},
    {"name": "gemma-3-27b",        "id": "google.gemma-3-27b-it",                     "api": "invoke_openai"},
    {"name": "qwen3-vl",           "id": "qwen.qwen3-vl-235b-a22b",                   "api": "converse"},
    {"name": "nemotron-nano",      "id": "nvidia.nemotron-nano-12b-v2",               "api": "converse"},
    {"name": "kimi-k2.5",          "id": "moonshotai.kimi-k2.5",                      "api": "converse"},
]


def call_converse(client, model_id: str, prompt: str, img_bytes: bytes) -> str:
    messages = [{
        "role": "user",
        "content": [
            {"image": {"format": "jpeg", "source": {"bytes": img_bytes}}},
            {"text": prompt},
        ],
    }]
    kwargs = dict(
        modelId=model_id,
        messages=messages,
        inferenceConfig={"maxTokens": MAX_TOKENS, "temperature": 0.0},
    )
    try:
        resp = client.converse(**kwargs)
    except ClientError as e:
        msg = e.response["Error"].get("Message", "")
        # Opus 4.7 rejects temperature outright; retry without it.
        if "temperature" in msg.lower():
            kwargs["inferenceConfig"] = {"maxTokens": MAX_TOKENS}
            resp = client.converse(**kwargs)
        else:
            raise
    parts = resp["output"]["message"]["content"]
    return "".join(p.get("text", "") for p in parts)


def call_invoke_openai(client, model_id: str, prompt: str, img_bytes: bytes) -> str:
    # Gemma 3 27B via Bedrock InvokeModel. The OpenAI-chat schema with an
    # image_url data URI is the only shape that actually gets the image
    # through — Converse, Anthropic-style, Vertex-style all fail.
    b64 = base64.b64encode(img_bytes).decode()
    body = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        }],
        "max_tokens": MAX_TOKENS,
    }
    resp = client.invoke_model(
        modelId=model_id,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    payload = json.loads(resp["body"].read())
    return payload["choices"][0]["message"]["content"]


def call_model(client, model: dict, prompt: str, img_bytes: bytes) -> str:
    if model["api"] == "converse":
        return call_converse(client, model["id"], prompt, img_bytes)
    if model["api"] == "invoke_openai":
        return call_invoke_openai(client, model["id"], prompt, img_bytes)
    raise ValueError(f"unknown api: {model['api']}")


def parse_predictions(text: str) -> list[tuple[float, float]]:
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    m = re.search(r"\[[\s\S]*\]", s)
    if not m:
        raise ValueError("no JSON array found in model output")
    arr = json.loads(m.group(0))
    preds: list[tuple[float, float]] = []
    for e in arr:
        if isinstance(e, dict) and "x" in e and "y" in e:
            preds.append((float(e["x"]), float(e["y"])))
    return preds


def read_manifest(path: Path) -> list[tuple[str, str, str]]:
    with path.open() as f:
        return [(r["split"], r["clip"], r["frame"]) for r in csv.DictReader(f)]


def append_preds(path: Path, split: str, clip: str, frame: str,
                 preds: list[tuple[float, float]]):
    new = not path.exists()
    with path.open("a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(PRED_FIELDS)
        for x, y in preds:
            w.writerow([split, clip, frame, f"{x:.6f}", f"{y:.6f}"])


def attempt_frame(client, model: dict, prompt: str, img_bytes: bytes,
                  max_attempts: int) -> tuple[str | None, list[tuple[float, float]] | None, str]:
    """
    Try up to max_attempts to (call, parse). Returns (raw, preds, status_note).
    On success: (raw, preds, "ok"). On exhaustion: (last_raw_or_None, None, note).
    """
    last_raw: str | None = None
    last_err = "no attempts"
    for attempt in range(1, max_attempts + 1):
        try:
            raw = call_model(client, model, prompt, img_bytes)
        except Exception as e:
            last_err = f"call_failed ({type(e).__name__}): {e}"[:300]
            time.sleep(min(2 ** (attempt - 1), 30))
            continue
        last_raw = raw
        try:
            preds = parse_predictions(raw)
        except (ValueError, json.JSONDecodeError) as e:
            last_err = f"parse_failed ({type(e).__name__}): {e}"[:300]
            continue
        return raw, preds, "ok"
    return last_raw, None, last_err


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    valid_names = [m["name"] for m in MODELS]
    ap.add_argument("--model", required=True, choices=valid_names,
                    metavar="MODEL", help=f"one of: {', '.join(valid_names)}")
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--soccernet-dir", type=Path, default=DEFAULT_SOCCERNET_DIR,
                    help="Root containing <split>/<clip>/img1/<frame>")
    ap.add_argument("--prompt", type=Path, default=DEFAULT_PROMPT)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR,
                    help="Where <model>_preds.csv and raw_outputs/ go")
    ap.add_argument("--region", default=REGION)
    ap.add_argument("--max-attempts", type=int, default=DEFAULT_MAX_ATTEMPTS,
                    help="Max (call+parse) attempts per frame before giving up")
    ap.add_argument("--limit", type=int, default=None,
                    help="Process only the first N un-done frames (smoke testing)")
    args = ap.parse_args()

    model = next(m for m in MODELS if m["name"] == args.model)
    prompt = args.prompt.read_text(encoding="utf-8")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    preds_path = args.out_dir / f"{model['name']}_preds.csv"
    raw_dir = args.out_dir / "raw_outputs" / model["name"]
    raw_dir.mkdir(parents=True, exist_ok=True)

    def is_done(clip: str, frame: str) -> bool:
        return (raw_dir / f"{clip}_{Path(frame).stem}.txt").exists()

    manifest = read_manifest(args.manifest)
    todo = [t for t in manifest if not is_done(t[1], t[2])]
    if args.limit:
        todo = todo[: args.limit]

    print(f"model:        {model['name']} ({model['id']})")
    print(f"manifest:     {args.manifest}  ({len(manifest)} frames)")
    print(f"already done: {len(manifest) - len(todo)} frames")
    print(f"to process:   {len(todo)} frames")
    print(f"preds out:    {preds_path}")
    print(f"raw out:      {raw_dir}\n")
    if not todo:
        return

    client = boto3.client("bedrock-runtime", region_name=args.region)

    n_ok = 0
    failures: list[tuple[str, str, str, str]] = []
    for i, (split, clip, frame) in enumerate(todo, 1):
        tag = f"{split}/{clip}/{frame}"
        img_path = args.soccernet_dir / split / clip / "img1" / frame
        if not img_path.exists():
            note = f"image_missing: {img_path}"
            print(f"[{i}/{len(todo)}] {tag}  {note}")
            failures.append((split, clip, frame, note))
            continue

        img_bytes = img_path.read_bytes()
        t0 = time.time()
        raw, preds, status = attempt_frame(
            client, model, prompt, img_bytes, args.max_attempts
        )
        elapsed = time.time() - t0

        if preds is None:
            # Gave up. Save last raw (if any) for inspection; don't write
            # a .txt marker — frame will be retried next run.
            if raw is not None:
                (raw_dir / f"{clip}_{Path(frame).stem}.failed.txt").write_text(
                    raw, encoding="utf-8"
                )
            print(f"[{i}/{len(todo)}] {tag}  GAVE UP after {args.max_attempts}: {status}")
            failures.append((split, clip, frame, status))
            continue

        # Success — append preds first, then write the raw file. The raw
        # file's presence is the resumability marker, so writing it last
        # means an interrupt mid-frame leaves the frame "not done" and it
        # gets retried (worst case: a few duplicate rows, visible in n_pred,
        # rather than silently missing rows).
        if preds:
            append_preds(preds_path, split, clip, frame, preds)
        (raw_dir / f"{clip}_{Path(frame).stem}.txt").write_text(
            raw, encoding="utf-8"
        )
        print(f"[{i}/{len(todo)}] {tag}  -> {len(preds)} preds  ({elapsed:.1f}s)")
        n_ok += 1

    print(f"\ndone. ok={n_ok}  failed={len(failures)}")
    if failures:
        print("failed frames (re-run script to retry):")
        for split, clip, frame, note in failures:
            print(f"  {split}/{clip}/{frame}  {note}")


if __name__ == "__main__":
    main()
