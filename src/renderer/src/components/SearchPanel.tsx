import React, { useEffect, useRef, useState } from 'react'
import { useHub } from '../store'
import type { TranscriptMatch } from '../../../shared/ipc'

/** Surligne toutes les occurrences de `q` dans `text` (insensible à la casse). */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  for (;;) {
    const at = tl.indexOf(ql, i)
    if (at === -1) { parts.push(text.slice(i)); break }
    if (at > i) parts.push(text.slice(i, at))
    parts.push(<mark key={key++}>{text.slice(at, at + q.length)}</mark>)
    i = at + q.length
  }
  return parts
}

export function SearchPanel({ tabId }: { tabId: string }): React.JSX.Element {
  const close = useHub((s) => s.setSearch)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<TranscriptMatch[]>([])

  useEffect(() => {
    inputRef.current?.focus()
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  function runSearch(q: string): void {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setMatches([]); return }
    debounceRef.current = setTimeout(() => {
      window.hub.searchTranscript(tabId, q).then(setMatches).catch(() => setMatches([]))
    }, 180)
  }

  const q = query.trim()
  const totalOcc = matches.reduce((n, m) => n + m.count, 0)

  return (
    <div className="search-panel">
      <div className="search-header">
        <input
          ref={inputRef}
          value={query}
          placeholder="Rechercher dans la conversation…"
          onChange={(e) => runSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(tabId, false) } }}
        />
        <button className="search-close" title="Fermer (Échap)" onClick={() => close(tabId, false)}>✕</button>
      </div>
      {q && (
        <div className="search-summary">
          {matches.length === 0
            ? 'Aucun résultat'
            : `${totalOcc} occurrence${totalOcc > 1 ? 's' : ''} · ${matches.length} message${matches.length > 1 ? 's' : ''}`}
        </div>
      )}
      <div className="search-results">
        {q && matches.map((m, i) => (
          <div className="search-msg" key={i}>
            <div className={`search-role ${m.role}`}>
              {m.role === 'user' ? 'toi' : 'Claude'}{m.count > 1 ? ` · ${m.count}×` : ''}
            </div>
            <div className="search-text">{highlight(m.text, q)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
