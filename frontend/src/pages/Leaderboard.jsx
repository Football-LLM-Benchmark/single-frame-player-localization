import React from 'react'
import { Link } from 'react-router-dom'
import { useScoreData } from '../useScoreData'
import { config } from '../config'

export default function Leaderboard() {
  const { data, error } = useScoreData()

  return (
    <section>
      <div className="hero-intro">
        <p className="eyebrow">Football LLM Benchmark</p>
        <h1>Single-Frame Player Localization</h1>
        <p className="lede">How well can LLMs see a football pitch?</p>
        <p>
          We show VLMs (Vision-Language Models) a single broadcast frame and ask them to estimate
          every visible player's real-world (x, y) position on the pitch. The{' '}
          <Link to="/methodology#scoring">score</Link>{' '}
          is the average localization error in meters — <strong>lower is better</strong>.
        </p>
      </div>
      <img src={`${import.meta.env.BASE_URL}background.png`} alt="Broadcast image → pitch coordinate projection" className="hero-image" />
      {error && <p id="status">Failed to load scores: {error}</p>}
      {!data && !error && <p id="status">Loading scores…</p>}
      {data && (
        <div className="table-scroll">
          <p className="last-updated">Last updated: {config.leaderboardLastUpdated}</p>
          <table id="summary">
            <thead>
              <tr><th>Model</th><th className="mean-col">Mean (m)</th><th>Std dev</th><th>Min</th><th>Max</th></tr>
            </thead>
            <tbody>
              {data.map((s, i) => (
                <tr key={s.name}>
                  <td className="model-name">{i === 0 ? "🏆 " : ""}{s.isBaseline ? <Link to="/methodology#cv-baseline" style={{textDecoration:"none"}}>{s.display}</Link> : s.display}</td>
                  <td className="mean-col">{s.mean.toFixed(2)}</td>
                  <td>{s.stddev.toFixed(2)}</td>
                  <td>{s.min.toFixed(2)}</td>
                  <td>{s.max.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
