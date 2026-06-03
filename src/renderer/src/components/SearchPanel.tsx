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
  const setSearch = useHub((s) => s.setSearch)
  const setSearchQuery = useHub((s) => s.setSearchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Query initiale = celle mémorisée pour CET onglet (persiste quand on cache la recherche).
  const [query, setQuery] = useState(() => useHub.getState().tabs.find((t) => t.id === tabId)?.searchQuery ?? '')
  const [matches, setMatches] = useState<TranscriptMatch[]>([])

  function fetchMatches(q: string): void {
    if (!q.trim()) { setMatches([]); return }
    window.hub.searchTranscript(tabId, q).then(setMatches).catch(() => setMatches([]))
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const init = (useHub.getState().tabs.find((t) => t.id === tabId)?.searchQuery ?? '').trim()
    if (init) fetchMatches(init) // recharge les résultats au ré-affichage de l'onglet
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runSearch(q: string): void {
    setQuery(q)
    setSearchQuery(tabId, q) // mémorise par onglet
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setMatches([]); return }
    debounceRef.current = setTimeout(() => fetchMatches(q), 180)
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
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setSearch(tabId, false) } }}
        />
        <button className="search-close" title="Fermer (Échap)" onClick={() => setSearch(tabId, false)}>✕</button>
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
