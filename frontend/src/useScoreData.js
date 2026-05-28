import { useState, useEffect } from 'react'

const BASE = import.meta.env.BASE_URL

const SOURCES = [
  { name: "baseline", url: `${BASE}data/baseline_scores.csv`, isBaseline: true },
  { name: "claude-opus-4-7", url: `${BASE}data/claude-opus-4-7_scores.csv`, isBaseline: false },
  { name: "claude-sonnet-4-6", url: `${BASE}data/claude-sonnet-4-6_scores.csv`, isBaseline: false },
  { name: "nova-pro", url: `${BASE}data/nova-pro_scores.csv`, isBaseline: false },
  { name: "llama4-maverick", url: `${BASE}data/llama4-maverick_scores.csv`, isBaseline: false },
  { name: "llama4-scout", url: `${BASE}data/llama4-scout_scores.csv`, isBaseline: false },
  { name: "pixtral-large", url: `${BASE}data/pixtral-large_scores.csv`, isBaseline: false },
  { name: "gemma-3-27b", url: `${BASE}data/gemma-3-27b_scores.csv`, isBaseline: false },
  { name: "qwen3-vl", url: `${BASE}data/qwen3-vl_scores.csv`, isBaseline: false },
  { name: "nemotron-nano", url: `${BASE}data/nemotron-nano_scores.csv`, isBaseline: false },
  { name: "kimi-k2.5", url: `${BASE}data/kimi-k2.5_scores.csv`, isBaseline: false },
]

function parseScoreCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0].split(",")
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  const out = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",")
    out.push({
      score: parseFloat(cols[idx.gospa_normalized]),
      n_gt: parseInt(cols[idx.n_gt], 10),
      direction: cols[idx.direction],
    })
  }
  return out
}

function playerBucket(n) {
  if (n <= 5) return "0-5"
  if (n <= 10) return "6-10"
  if (n <= 15) return "11-15"
  return "16+"
}

function mean(xs) { let s = 0; for (const x of xs) s += x; return s / xs.length }
function stddev(xs) { const m = mean(xs); let s = 0; for (const x of xs) s += (x - m) ** 2; return Math.sqrt(s / xs.length) }

async function loadOne(src) {
  const r = await fetch(src.url)
  if (!r.ok) throw new Error(`fetch ${src.url}: ${r.status}`)
  const rows = parseScoreCsv(await r.text())
  for (const row of rows) {
    row.bucket = playerBucket(row.n_gt)
    row.jitter = Math.random() - 0.5
  }
  const scores = rows.map(r => r.score)
  return {
    ...src, rows, scores,
    display: src.isBaseline ? "CV baseline" : src.name,
    mean: mean(scores),
    stddev: stddev(scores),
    min: Math.min(...scores),
    max: Math.max(...scores),
  }
}

let _cache = null

export function useScoreData() {
  const [data, setData] = useState(_cache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (_cache) return
    Promise.all(SOURCES.map(loadOne))
      .then(series => {
        series.sort((a, b) => a.mean - b.mean)
        _cache = series
        setData(series)
      })
      .catch(e => setError(e.message))
  }, [])

  return { data, error }
}
