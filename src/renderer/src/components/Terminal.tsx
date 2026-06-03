import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TranscriptMatch } from '../../../shared/ipc'

/** Surligne les occurrences de `q` dans `text` (insensible à la casse). */
function highlight(text: string, q: string): React.ReactNode {
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

export function Terminal({ tabId }: { tabId: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<TranscriptMatch[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    let lastCols = 0
    let lastRows = 0
    const doFit = (): void => {
      // Onglet caché (display:none) => offsetParent null : ne pas fit/resize (taille 0).
      if (container.offsetParent === null) return
      try {
        fit.fit()
        // Ne propager au pty QUE si la taille a vraiment changé (évite le spam de resize
        // pendant le drag du splitter, qui fait redessiner la TUI Claude et pollue l'historique).
        if (term.cols !== lastCols || term.rows !== lastRows) {
          lastCols = term.cols
          lastRows = term.rows
          window.hub.resize(tabId, term.cols, term.rows)
        }
      } catch { /* conteneur pas encore dimensionné */ }
    }
    const ro = new ResizeObserver(() => doFit())
    ro.observe(container)
    requestAnimationFrame(doFit)
    window.addEventListener('resize', doFit)

    // Menu Electron retiré → on gère le clavier nous-mêmes.
    // Ctrl/Cmd+F : ouvre la recherche (dans le transcript) · Ctrl/Cmd+V : colle (une seule
    // source) · Ctrl/Cmd+C : copie si sélection (sinon laisser passer le SIGINT).
    term.attachCustomKeyEventHandler((e): boolean => {
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return true
      const key = e.key.toLowerCase()
      if (key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        return false
      }
      if (key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then((t) => { if (t) term.paste(t) }).catch(() => {})
        return false
      }
      if (key === 'c' && term.hasSelection()) {
        e.preventDefault()
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        return false
      }
      return true
    })

    const offData = window.hub.onData((id, data) => { if (id === tabId) term.write(data) })
    const onInput = term.onData((data) => window.hub.sendInput(tabId, data))

    return () => {
      offData()
      onInput.dispose()
      ro.disconnect()
      window.removeEventListener('resize', doFit)
      term.dispose()
    }
  }, [tabId])

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  // Recherche dans le transcript de la session, debouncée (lecture fichier côté main).
  function runSearch(q: string): void {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setMatches([]); return }
    debounceRef.current = setTimeout(() => {
      window.hub.searchTranscript(tabId, q).then(setMatches).catch(() => setMatches([]))
    }, 180)
  }

  function closeSearch(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSearchOpen(false)
    setQuery('')
    setMatches([])
  }

  return (
    <div className="term-host">
      {searchOpen && (
        <div className="term-search-panel">
          <div className="term-search">
            <input
              ref={inputRef}
              value={query}
              placeholder="Rechercher dans la conversation…"
              onChange={(e) => runSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeSearch() } }}
            />
            <span className="term-search-count">{query.trim() ? `${matches.length}` : ''}</span>
            <button title="Fermer (Échap)" onClick={closeSearch}>✕</button>
          </div>
          {query.trim() && (
            <div className="term-results">
              {matches.length === 0 ? (
                <div className="term-result empty">Aucun résultat</div>
              ) : (
                matches.map((m, i) => (
                  <div className="term-result" key={i}>
                    <span className={`role ${m.role}`}>{m.role === 'user' ? 'toi' : 'Claude'}</span>
                    <span className="snippet">{highlight(m.snippet, query.trim())}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
      <div ref={containerRef} className="term-screen" />
    </div>
  )
}
