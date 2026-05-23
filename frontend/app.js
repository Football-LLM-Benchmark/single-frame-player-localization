// Loads per-frame GOSPA-normalized scores for the CV baseline + 10 LLMs and
// renders a horizontal half-violin per model, sorted by mean (best on top).

const SOURCES = [
  { name: "baseline",          url: "../baseline_results/baseline_scores.csv",        isBaseline: true  },
  { name: "claude-opus-4-7",   url: "../llm_results/claude-opus-4-7_scores.csv",      isBaseline: false },
  { name: "claude-sonnet-4-6", url: "../llm_results/claude-sonnet-4-6_scores.csv",    isBaseline: false },
  { name: "nova-pro",          url: "../llm_results/nova-pro_scores.csv",             isBaseline: false },
  { name: "llama4-maverick",   url: "../llm_results/llama4-maverick_scores.csv",      isBaseline: false },
  { name: "llama4-scout",      url: "../llm_results/llama4-scout_scores.csv",         isBaseline: false },
  { name: "pixtral-large",     url: "../llm_results/pixtral-large_scores.csv",        isBaseline: false },
  { name: "gemma-3-27b",       url: "../llm_results/gemma-3-27b_scores.csv",          isBaseline: false },
  { name: "qwen3-vl",          url: "../llm_results/qwen3-vl_scores.csv",             isBaseline: false },
  { name: "nemotron-nano",     url: "../llm_results/nemotron-nano_scores.csv",        isBaseline: false },
  { name: "kimi-k2.5",         url: "../llm_results/kimi-k2.5_scores.csv",            isBaseline: false },
];

function parseScoreCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    out.push({
      score: parseFloat(cols[idx.gospa_normalized]),
      n_gt: parseInt(cols[idx.n_gt], 10),
      direction: cols[idx.direction],
    });
  }
  return out;
}

function playerBucket(n) {
  if (n <= 5) return "0-5";
  if (n <= 10) return "6-10";
  if (n <= 15) return "11-15";
  return "16+";
}

// Filter keys mirror the data attributes on the buttons in index.html.
const FILTERS = {
  "all":    () => true,
  "0-5":    (r) => r.bucket === "0-5",
  "6-10":   (r) => r.bucket === "6-10",
  "11-15":  (r) => r.bucket === "11-15",
  "16+":    (r) => r.bucket === "16+",
  "L":      (r) => r.direction === "L",
  "M":      (r) => r.direction === "M",
  "R":      (r) => r.direction === "R",
};

function mean(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

function stddev(xs) {
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

function quantile(xs, q) {
  const s = xs.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// Per-model parameter counts (billions). For MoE models the display shows
// "active/total"; for dense models it's a single number. Closed models
// (claude-*, nova-pro) are intentionally absent.
const PARAMS = {
  "llama4-maverick": { active: 17,   display: "17B MoE"   },
  "llama4-scout":    { active: 17,   display: "17B MoE"   },
  "pixtral-large":   { active: 124,  display: "124B"      },
  "gemma-3-27b":     { active: 27,   display: "27B"       },
  "qwen3-vl":        { active: 22,   display: "22B MoE"   },
  "nemotron-nano":   { active: 12.6, display: "12.6B"     },
  "kimi-k2.5":       { active: 32,   display: "32B MoE"   },
};

// Vision-pipeline architecture bucket per model. Used to color-code traces
// in both plots; definitions are mirrored in the legend in index.html.
const BUCKETS = {
  "claude-opus-4-7":   "undisclosed",
  "claude-sonnet-4-6": "undisclosed",
  "nova-pro":          "undisclosed",
  "llama4-maverick":   "early-fusion",
  "llama4-scout":      "early-fusion",
  "pixtral-large":     "native-res",
  "qwen3-vl":          "native-res",
  "kimi-k2.5":         "native-res",
  "gemma-3-27b":       "tiled",
  "nemotron-nano":     "tiled",
};

// Bucket badge colors. `bg` is the badge background; `fg` is the text on top
// of it. Yellow needs dark text — everything else is fine on white.
const BUCKET_COLORS = {
  "native-res":   { bg: "#1f77b4", fg: "#fff" }, // blue
  "early-fusion": { bg: "#D62728", fg: "#fff" }, // red
  "tiled":        { bg: "#F1C40F", fg: "#000" }, // yellow (dark text)
  "undisclosed":  { bg: "#888",    fg: "#fff" }, // gray
  "baseline":     { bg: "#222",    fg: "#fff" }, // near-black
};

function bucketOf(s) {
  return s.isBaseline ? "baseline" : BUCKETS[s.name];
}

async function loadOne(src) {
  const r = await fetch(src.url);
  if (!r.ok) throw new Error(`fetch ${src.url}: ${r.status}`);
  const rows = parseScoreCsv(await r.text());
  for (const row of rows) {
    row.bucket = playerBucket(row.n_gt);
    row.jitter = Math.random() - 0.5;
  }
  const scores = rows.map((r) => r.score);
  const p = PARAMS[src.name];
  const display = src.isBaseline
    ? "CV baseline"
    : (p ? `${src.name} (${p.display})` : src.name);
  return {
    ...src, rows, scores, display,
    mean: mean(scores),
    median: median(scores),
    stddev: stddev(scores),
    min: Math.min(...scores),
    max: Math.max(...scores),
    q1: quantile(scores, 0.25),
    q3: quantile(scores, 0.75),
  };
}

const MOBILE_QUERY = window.matchMedia("(max-width: 700px)");

{
  const legend = document.querySelector(".legend");
  if (legend) {
    if (MOBILE_QUERY.matches) legend.open = false;
    const summary = legend.querySelector("summary");
    if (summary) {
      summary.addEventListener("click", (e) => {
        if (!MOBILE_QUERY.matches) e.preventDefault();
      });
    }
  }
}

// Build the mobile badge text: the model name (wrapped to two lines at the
// dash closest to the middle if longer than 10 chars), followed by the
// parameter count on its own line if available. Plotly annotations honor <br>.
function wrapMobileLabel(s) {
  if (s.isBaseline) return "CV<br>baseline";
  const name = s.name;
  let nameText = name;
  if (name.length > 10) {
    const mid = Math.floor(name.length / 2);
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < name.length; i++) {
      if (name[i] === "-") {
        const d = Math.abs(i - mid);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    if (bestIdx !== -1) {
      nameText = name.slice(0, bestIdx) + "<br>" + name.slice(bestIdx + 1);
    }
  }
  const p = PARAMS[s.name];
  return p ? `${nameText}<br>${p.display}` : nameText;
}

// Shared layout pieces (badges, overflow markers, axes) used by both the
// strip plot (desktop) and box plot (mobile). Returns the layout object.
function buildLayout(series, yOf, getRows, mobile) {
  const N = series.length;

  const rowBadges = series.map((s) => {
    const c = BUCKET_COLORS[bucketOf(s)];
    const text = mobile ? wrapMobileLabel(s) : s.display;
    return {
      xref: "paper", x: 0, xanchor: "right", xshift: -8,
      yref: "y", y: yOf(s), yanchor: "middle",
      text,
      showarrow: false,
      bgcolor: c.bg,
      bordercolor: c.bg,
      borderpad: 3,
      font: { color: c.fg, size: mobile ? 12 : 11 },
    };
  });

  const overflowMarkers = series
    .map((s) => {
      const scores = getRows(s).map((r) => r.score);
      if (!scores.length) return null;
      const mx = Math.max(...scores);
      if (mx <= 50) return null;
      return {
        xref: "x", x: 50, xanchor: "right", xshift: -6,
        yref: "y", y: yOf(s), yanchor: "middle",
        text: `→ max ${mx.toFixed(2)}`,
        showarrow: false,
        font: { color: "#c00", size: mobile ? 9 : 11 },
        bgcolor: "rgba(255,255,255,0.85)",
      };
    })
    .filter(Boolean);

  return {
    showlegend: false,
    margin: { l: mobile ? 105 : 230, r: mobile ? 12 : 30, t: 16, b: 44 },
    xaxis: {
      title: mobile
        ? "GOSPA / max(n_gt, 1)  (m, lower better)"
        : "GOSPA / max(n_gt, 1)  (meters per ground-truth player; lower = better)",
      zeroline: true,
      zerolinecolor: "#444",
      zerolinewidth: 1,
      gridcolor: "#eee",
      range: [0, 50],
    },
    yaxis: {
      range: [-0.5, N - 0.5],
      showticklabels: false,
      zeroline: false,
      showgrid: false,
    },
    plot_bgcolor: "#fff",
    paper_bgcolor: "#fff",
    annotations: [...rowBadges, ...overflowMarkers],
  };
}

// Desktop view: every image is a dot, jittered vertically, with a black tick
// at the mean. `series` is the sorted list of model rows, `yOf(s)` returns
// the numeric row index for a model (shared across plots so labels line up),
// `getScores(s)` returns the array of per-image scores for that model.
function renderStripPlot(divId, series, yOf, getRows) {
  const JITTER = 0.55;

  const traces = series.map((s) => {
    const baseY = yOf(s);
    const rows = getRows(s);
    return {
      type: "scatter",
      mode: "markers",
      name: s.display,
      x: rows.map((r) => r.score),
      y: rows.map((r) => baseY + r.jitter * JITTER),
      marker: { color: "rgba(31,119,180,0.45)", size: 5, line: { width: 0 } },
      hoverinfo: "skip",
      showlegend: false,
    };
  });

  const meanMarkers = series
    .map((s) => {
      const rows = getRows(s);
      if (!rows.length) return null;
      const m = rows.reduce((a, r) => a + r.score, 0) / rows.length;
      return {
        type: "line",
        xref: "x", yref: "y",
        x0: m, x1: m,
        y0: yOf(s) - 0.4, y1: yOf(s) + 0.4,
        line: { color: "#000", width: 2.5 },
      };
    })
    .filter(Boolean);

  const layout = buildLayout(series, yOf, getRows, false);
  layout.shapes = meanMarkers;

  Plotly.react(divId, traces, layout, { responsive: true, staticPlot: true });
}

// Mobile view: a horizontal box plot per model (median solid line, mean dashed
// line via boxmean: true, whiskers + outlier dots). Keeps the per-row layout
// so the eye still tracks ranking top-to-bottom.
function renderBoxPlot(divId, series, yOf, getRows) {
  const traces = series.map((s) => {
    const scores = getRows(s).map((r) => r.score);
    return {
      type: "box",
      name: s.display,
      x: scores,
      y0: yOf(s),
      orientation: "h",
      boxmean: false,
      width: 0.6,
      line: { color: "#1f77b4", width: 1 },
      fillcolor: "rgba(31,119,180,0.35)",
      marker: { color: "rgba(31,119,180,0.7)", size: 3, opacity: 0.6 },
      hoverinfo: "skip",
      showlegend: false,
    };
  });

  const layout = buildLayout(series, yOf, getRows, true);
  Plotly.react(divId, traces, layout, { responsive: true, staticPlot: true });
}

async function main() {
  const status = document.getElementById("status");
  let series;
  try {
    series = await Promise.all(SOURCES.map(loadOne));
  } catch (e) {
    status.textContent = `Failed to load score CSVs: ${e.message}`;
    return;
  }

  // Best on top: lowest overall mean gets the highest numeric y value. The
  // y-order is held fixed across filter changes so the eye can track each
  // model row as the dot cloud reshapes.
  series.sort((a, b) => a.mean - b.mean);
  const N = series.length;
  const yOf = (s) => N - 1 - series.indexOf(s);

  let currentFilter = "all";
  const renderPlot = () => {
    const pred = FILTERS[currentFilter];
    const getRows = (s) => s.rows.filter(pred);
    if (MOBILE_QUERY.matches) {
      renderBoxPlot("plot", series, yOf, getRows);
    } else {
      renderStripPlot("plot", series, yOf, getRows);
    }
  };
  renderPlot();

  // Re-render on crossing the mobile breakpoint (rotation, resize, devtools).
  MOBILE_QUERY.addEventListener("change", renderPlot);

  document.querySelectorAll(".filter-controls button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll(".filter-controls button").forEach((b) =>
        b.classList.toggle("active", b === btn));
      renderPlot();
    });
  });

  const tbody = document.querySelector("#summary tbody");
  series.forEach((s, i) => {
    const tr = document.createElement("tr");
    if (s.isBaseline) tr.classList.add("baseline-row");
    const trophy = i === 0 ? "🏆 " : "";
    tr.innerHTML =
      `<td class="model-name">${trophy}${s.display}</td>` +
      `<td class="mean-col">${s.mean.toFixed(2)}</td>` +
      `<td>${s.stddev.toFixed(2)}</td>` +
      `<td>${s.min.toFixed(2)}</td>` +
      `<td>${s.max.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("summary").hidden = false;
  status.hidden = true;
}

// Tab switching: delegated click handler on the sidebar list. Set up before
// main() so it works even if score-CSV loading fails. The active tab is
// stored in the URL hash so refresh / direct-link preserves it; Plotly
// needs a resize kick when Profiling first becomes visible since it was
// hidden at newPlot time.
function setActiveTab(name) {
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-pane").forEach((p) =>
    p.classList.toggle("active", p.id === name));
  if (location.hash !== `#${name}`) {
    history.replaceState(null, "", `#${name}`);
  }
  if (name === "profiling" && window.Plotly) {
    requestAnimationFrame(() => Plotly.Plots.resize("plot"));
  }
  closeMobileMenu();
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  const t = document.querySelector(".menu-toggle");
  if (t) t.setAttribute("aria-expanded", "false");
}

const menuToggle = document.querySelector(".menu-toggle");
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}
const backdrop = document.querySelector(".menu-backdrop");
if (backdrop) backdrop.addEventListener("click", closeMobileMenu);

const initialTab = (location.hash || "").slice(1);
const validInitial = document.querySelector(`.tabs button[data-tab="${initialTab}"]`);
setActiveTab(validInitial ? initialTab : "about");

const tabsList = document.querySelector(".tabs");
if (tabsList) {
  tabsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (btn) setActiveTab(btn.dataset.tab);
  });
}

main();
