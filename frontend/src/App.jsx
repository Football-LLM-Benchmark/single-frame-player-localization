import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import Leaderboard from './pages/Leaderboard'
import Profiling from './pages/Profiling'
import Methodology from './pages/Methodology'
import References from './pages/References'

const REPO_URL = 'https://github.com/Football-LLM-Benchmark/single-frame-player-localization'

export default function App() {
  return (
    <>
      <nav className="topnav">
        <span className="topnav-title">Football LLM Benchmark</span>
        <ul className="tabs">
          <li><NavLink to="/" end>Leaderboard</NavLink></li>
          <li><NavLink to="/profiling">Profiling</NavLink></li>
          <li><NavLink to="/methodology">Methodology</NavLink></li>
          <li><NavLink to="/references">References</NavLink></li>
        </ul>
        <GithubLink />
        <MobileMenu />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Leaderboard />} />
          <Route path="/profiling" element={<Profiling />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/references" element={<References />} />
        </Routes>
      </main>
    </>
  )
}

function GithubLink() {
  return (
    <a
      className="topnav-github"
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View source on GitHub"
      title="View source on GitHub"
    >
      <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
             0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
             -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
             .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15
             -.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0
             1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82
             1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01
             1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
    </a>
  )
}

function MobileMenu() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button className="menu-toggle" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
        <span /><span /><span />
      </button>
      {open && (
        <ul className="tabs mobile-open" onClick={() => setOpen(false)}>
          <li><NavLink to="/" end>Leaderboard</NavLink></li>
          <li><NavLink to="/profiling">Profiling</NavLink></li>
          <li><NavLink to="/methodology">Methodology</NavLink></li>
          <li><NavLink to="/references">References</NavLink></li>
        </ul>
      )}
    </>
  )
}
