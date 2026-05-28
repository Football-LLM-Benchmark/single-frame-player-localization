import React from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import Leaderboard from './pages/Leaderboard'
import Profiling from './pages/Profiling'
import Methodology from './pages/Methodology'
import References from './pages/References'

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
