import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Plotly from 'plotly.js-dist-min'
import { useScoreData } from '../useScoreData'

const FILTERS = {
  "all": () => true,
  "0-5": r => r.bucket === "0-5",
  "6-10": r => r.bucket === "6-10",
  "11-15": r => r.bucket === "11-15",
  "16+": r => r.bucket === "16+",
  "L": r => r.direction === "L",
  "M": r => r.direction === "M",
  "R": r => r.direction === "R",
}

const BUCKETS = {
  "claude-opus-4-7": "undisclosed",
  "claude-sonnet-4-6": "undisclosed",
  "nova-pro": "undisclosed",
  "llama4-maverick": "early-fusion",
  "llama4-scout": "early-fusion",
  "pixtral-large": "native-res",
  "qwen3-vl": "native-res",
  "kimi-k2.5": "native-res",
  "gemma-3-27b": "tiled",
  "nemotron-nano": "tiled",
}

const BUCKET_COLORS = {
  "native-res": { bg: "#1f77b4", fg: "#fff" },
  "early-fusion": { bg: "#D62728", fg: "#fff" },
  "tiled": { bg: "#F1C40F", fg: "#000" },
  "undisclosed": { bg: "#888", fg: "#fff" },
  "baseline": { bg: "#222", fg: "#fff" },
}

function bucketOf(s) { return s.isBaseline ? "baseline" : BUCKETS[s.name] }

export default function Profiling() {
  const { data, error } = useScoreData()
  const [filter, setFilter] = useState("all")
  const plotRef = useRef(null)

  useEffect(() => {
    if (!data || !plotRef.current) return
    const N = data.length
    const yOf = s => N - 1 - data.indexOf(s)
    const pred = FILTERS[filter]
    const getRows = s => s.rows.filter(pred)

    const traces = data.map(s => {
      const baseY = yOf(s)
      const rows = getRows(s)
      return {
        type: "scatter", mode: "markers",
        x: rows.map(r => r.score),
        y: rows.map(r => baseY + r.jitter * 0.55),
        marker: { color: "rgba(31,119,180,0.45)", size: 5, line: { width: 0 } },
        hoverinfo: "skip", showlegend: false,
      }
    })

    const meanMarkers = data.map(s => {
      const rows = getRows(s)
      if (!rows.length) return null
      const m = rows.reduce((a, r) => a + r.score, 0) / rows.length
      return { type: "line", xref: "x", yref: "y", x0: m, x1: m, y0: yOf(s) - 0.4, y1: yOf(s) + 0.4, line: { color: "#000", width: 2.5 } }
    }).filter(Boolean)

    const isMobile = window.innerWidth <= 700
    const rowBadges = data.map(s => {
      const c = BUCKET_COLORS[bucketOf(s)]
      return {
        xref: "paper", x: 0, xanchor: "right", xshift: -8,
        yref: "y", y: yOf(s), yanchor: "middle",
        text: s.display, showarrow: false,
        bgcolor: c.bg, bordercolor: c.bg, borderpad: isMobile ? 2 : 3,
        font: { color: c.fg, size: isMobile ? 9 : 11 },
      }
    })

    const overflowMarkers = data.map(s => {
      const scores = getRows(s).map(r => r.score)
      if (!scores.length) return null
      const mx = Math.max(...scores)
      if (mx <= 50) return null
      return {
        xref: "x", x: 50, xanchor: "right", xshift: -6,
        yref: "y", y: yOf(s), yanchor: "middle",
        text: `→ max ${mx.toFixed(2)}`, showarrow: false,
        font: { color: "#c00", size: 11 }, bgcolor: "rgba(255,255,255,0.85)",
      }
    }).filter(Boolean)

    const layout = {
      showlegend: false,
      margin: { l: isMobile ? 120 : 230, r: isMobile ? 10 : 30, t: 16, b: 60 },
      xaxis: { title: { text: "Score", font: { size: 14 } }, zeroline: true, zerolinecolor: "#444", zerolinewidth: 1, gridcolor: "#eee", range: [0, 50] },
      yaxis: { range: [-0.5, N - 0.5], showticklabels: false, zeroline: false, showgrid: false },
      plot_bgcolor: "#fff", paper_bgcolor: "#fff",
      annotations: [...rowBadges, ...overflowMarkers],
      shapes: meanMarkers,
    }

    Plotly.react(plotRef.current, traces, layout, { responsive: true, staticPlot: true })
  }, [data, filter])

  const toggle = (val) => setFilter(f => f === val ? "all" : val)

  return (
    <section>
      <h1>Performance profiling</h1>
      <p className="lede">
        How does the performance of each model vary across <Link to="/methodology#dataset">385 test images</Link>?
      </p>
      <div className="filter-group">
        <span className="filter-label">Visible players:</span>
        <div className="filter-buttons">
          <button className={filter === "0-5" ? "active" : ""} onClick={() => toggle("0-5")}>0–5</button>
          <button className={filter === "6-10" ? "active" : ""} onClick={() => toggle("6-10")}>6–10</button>
          <button className={filter === "11-15" ? "active" : ""} onClick={() => toggle("11-15")}>11–15</button>
          <button className={filter === "16+" ? "active" : ""} onClick={() => toggle("16+")}>16+</button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Camera direction:</span>
        <div className="filter-buttons">
          <button className={filter === "L" ? "active" : ""} onClick={() => toggle("L")}>Left field</button>
          <button className={filter === "M" ? "active" : ""} onClick={() => toggle("M")}>Mid field</button>
          <button className={filter === "R" ? "active" : ""} onClick={() => toggle("R")}>Right field</button>
        </div>
      </div>
      <div id="plot" ref={plotRef} />
      {error && <p>Failed to load data: {error}</p>}
      <p className="plot-notes-label"><strong>Note:</strong></p>
      <ul className="plot-notes">
        <li>Lower score is better</li>
        <li>Vertical black line is the mean</li>
        <li>X-axis clipped at 50 for readability</li>
        <li>Models are color-coded based on the classification as below</li>
      </ul>
      <details className="legend" open>
        <summary><h3>Architecture grouping</h3></summary>
        <p>Models are colored by how their vision pipeline handles broadcast-resolution input.</p>
        <ul>
          <li><span className="swatch" style={{background:"#1f77b4"}} /><b>Native dynamic resolution</b> — full image in one pass at real aspect ratio.</li>
          <li><span className="swatch" style={{background:"#D62728"}} /><b>Early fusion</b> — no separate vision encoder; image patches and text tokens in one transformer.</li>
          <li><span className="swatch" style={{background:"#F1C40F"}} /><b>Tiled / Pan-and-Scan</b> — fixed-square encoder; image sliced into tiles.</li>
          <li><span className="swatch" style={{background:"#888"}} /><b>Closed / undisclosed</b> — proprietary vision pipeline.</li>
          <li><span className="swatch" style={{background:"#222"}} /><b><Link to="/methodology#cv-baseline" style={{textDecoration:"none"}}>CV baseline</Link></b> — classical computer-vision pipeline, not an LLM.</li>
        </ul>
      </details>
    </section>
  )
}
