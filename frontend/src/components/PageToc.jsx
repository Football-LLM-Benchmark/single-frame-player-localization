import React, { useEffect, useState } from 'react'

// Auto-built TOC of the page's <h2 id="..."> headings.
// Hidden on narrow viewports via CSS — desktop only.
export default function PageToc() {
  const [items, setItems] = useState([])
  const [activeId, setActiveId] = useState(null)

  // Collect headings after render. Re-run on route change handled by component remount.
  useEffect(() => {
    const hs = Array.from(document.querySelectorAll('main h2[id]'))
    setItems(hs.map(h => ({ id: h.id, text: h.textContent })))

    if (!hs.length) return
    // Treat a heading as "active" when its top crosses the viewport's upper third.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length) {
          // Pick the topmost visible heading.
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          setActiveId(visible[0].target.id)
        }
      },
      { rootMargin: '-72px 0px -66% 0px', threshold: 0 }
    )
    hs.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [])

  if (!items.length) return null

  const onClick = (e, id) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Reflect immediately; observer updates as scroll settles.
      setActiveId(id)
      history.replaceState(null, '', `#${id}`)
    }
  }

  return (
    <nav className="page-toc" aria-label="Page sections">
      <p className="page-toc-title">On this page</p>
      <ul>
        {items.map(it => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              className={it.id === activeId ? 'active' : ''}
              onClick={(e) => onClick(e, it.id)}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
