import React, { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

// Pitch dims in meters; origin at center, x∈[-52.5,52.5], y∈[-34,34].
const HALF_X = 52.5
const HALF_Y = 34
const PEN_BOX_X = 16.5      // penalty area depth
const PEN_BOX_Y = 20.16     // half penalty-area width
const GOAL_BOX_X = 5.5      // 6-yard box depth
const GOAL_BOX_Y = 9.16     // half 6-yard-box width
const CENTER_R = 9.15       // center-circle radius

const PITCH_LINE = { color: '#666', width: 1 }

// Static pitch-line shapes; rendered below all traces.
const PITCH_SHAPES = [
  { type: 'rect', x0: -HALF_X, x1: HALF_X, y0: -HALF_Y, y1: HALF_Y, line: PITCH_LINE, fillcolor: '#f5faf5', layer: 'below' },
  { type: 'line', x0: 0, x1: 0, y0: -HALF_Y, y1: HALF_Y, line: PITCH_LINE, layer: 'below' },
  { type: 'circle', x0: -CENTER_R, x1: CENTER_R, y0: -CENTER_R, y1: CENTER_R, line: PITCH_LINE, layer: 'below' },
  { type: 'rect', x0: -HALF_X, x1: -HALF_X + PEN_BOX_X, y0: -PEN_BOX_Y, y1: PEN_BOX_Y, line: PITCH_LINE, layer: 'below' },
  { type: 'rect', x0: -HALF_X, x1: -HALF_X + GOAL_BOX_X, y0: -GOAL_BOX_Y, y1: GOAL_BOX_Y, line: PITCH_LINE, layer: 'below' },
  { type: 'rect', x0: HALF_X - PEN_BOX_X, x1: HALF_X, y0: -PEN_BOX_Y, y1: PEN_BOX_Y, line: PITCH_LINE, layer: 'below' },
  { type: 'rect', x0: HALF_X - GOAL_BOX_X, x1: HALF_X, y0: -GOAL_BOX_Y, y1: GOAL_BOX_Y, line: PITCH_LINE, layer: 'below' },
]

// `overlays` is an array of {name, label, color, symbol, points: [{x,y},...]}.
export default function PitchPlot({ groundTruth, overlays = [] }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const traces = [
      {
        type: 'scatter', mode: 'markers',
        name: 'Ground truth',
        x: groundTruth.map(p => p.x),
        y: groundTruth.map(p => p.y),
        marker: { color: '#2e7d32', size: 14, symbol: 'x-thin', line: { width: 3, color: '#2e7d32' } },
        hovertemplate: 'GT (%{x:.1f}, %{y:.1f})<extra></extra>',
      },
      ...overlays.map(o => ({
        type: 'scatter', mode: 'markers',
        name: o.label,
        x: o.points.map(p => p.x),
        y: o.points.map(p => p.y),
        marker: { color: o.color, size: 12, symbol: o.symbol, line: { width: 1.5, color: '#fff' } },
        hovertemplate: `${o.label} (%{x:.1f}, %{y:.1f})<extra></extra>`,
      })),
    ]
    const layout = {
      margin: { l: 8, r: 8, t: 36, b: 8 },
      showlegend: true,
      legend: {
        orientation: 'h',
        yanchor: 'bottom', y: 1.02,
        xanchor: 'center', x: 0.5,
      },
      xaxis: { range: [-HALF_X - 2, HALF_X + 2], showgrid: false, zeroline: false, showline: false, showticklabels: false, fixedrange: true },
      // y inverted so +y (near touchline, camera side) is at the bottom — matches the broadcast image layout.
      yaxis: { range: [HALF_Y + 2, -HALF_Y - 2], scaleanchor: 'x', scaleratio: 1, showgrid: false, zeroline: false, showline: false, showticklabels: false, fixedrange: true },
      shapes: PITCH_SHAPES,
      plot_bgcolor: '#fff', paper_bgcolor: '#fff',
    }
    Plotly.react(ref.current, traces, layout, { displayModeBar: false, responsive: true })
  }, [groundTruth, overlays])

  return <div ref={ref} className="pitch-plot" />
}
