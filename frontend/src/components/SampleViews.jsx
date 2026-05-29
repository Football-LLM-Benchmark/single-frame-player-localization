import React, { useEffect, useState } from 'react'
import PitchPlot from './PitchPlot'

const DEFAULT_MODEL = 'claude-opus-4-7'
const BASE = import.meta.env.BASE_URL

export default function SampleViews() {
  const [samples, setSamples] = useState(null)
  const [error, setError] = useState(null)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    fetch(`${BASE}data/samples.json`)
      .then(r => { if (!r.ok) throw new Error(`samples.json: ${r.status}`); return r.json() })
      .then(j => setSamples(j.samples))
      .catch(e => setError(e.message))
  }, [])

  if (error) return <p>Failed to load sample views: {error}</p>
  if (!samples) return <p id="status">Loading sample views…</p>

  const active = samples[activeIdx]
  return (
    <div className="sample-views">
      <div className="sample-tabs">
        {samples.map((s, i) => (
          <button
            key={s.id}
            className={i === activeIdx ? 'active' : ''}
            onClick={() => setActiveIdx(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <SampleView sample={active} />
    </div>
  )
}

function SampleView({ sample }) {
  const models = Object.keys(sample.predictions).sort((a, b) => {
    if (a === 'baseline') return -1
    if (b === 'baseline') return 1
    return a.localeCompare(b)
  })

  const initialA = sample.predictions[DEFAULT_MODEL] ? DEFAULT_MODEL : models[0]
  const [modelA, setModelA] = useState(initialA)
  const [modelB, setModelB] = useState('')

  // Reset selections when sample changes (e.g. tab switch).
  useEffect(() => {
    setModelA(sample.predictions[DEFAULT_MODEL] ? DEFAULT_MODEL : models[0])
    setModelB('')
  }, [sample.id])

  const labelOf = (m) => m === 'baseline' ? 'CV baseline' : m
  const overlays = []
  if (modelA) overlays.push({ name: modelA, label: labelOf(modelA), color: '#1f77b4', symbol: 'circle', points: sample.predictions[modelA] })
  if (modelB && modelB !== modelA) overlays.push({ name: modelB, label: labelOf(modelB), color: '#D62728', symbol: 'diamond', points: sample.predictions[modelB] })

  return (
    <div className="sample-view">
      <div className="sample-controls">
        <label>
          Model A:{' '}
          <select value={modelA} onChange={e => setModelA(e.target.value)}>
            {models.map(m => <option key={m} value={m}>{labelOf(m)}</option>)}
          </select>
        </label>
        <label>
          Model B:{' '}
          <select value={modelB} onChange={e => setModelB(e.target.value)}>
            <option value="">None</option>
            {models.filter(m => m !== modelA).map(m => (
              <option key={m} value={m}>{labelOf(m)}</option>
            ))}
          </select>
        </label>
      </div>
      <img src={`${BASE}${sample.image}`} alt={sample.label} className="sample-image" />
      <div className="sample-pitch">
        <PitchPlot groundTruth={sample.groundTruth} overlays={overlays} />
      </div>
    </div>
  )
}
