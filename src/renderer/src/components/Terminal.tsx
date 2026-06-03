import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'

const SEARCH_OPTS = {
  decorations: {
    matchBackground: '#664400',
    matchOverviewRuler: '#664400',
    activeMatchBackground: '#cc8800',
    activeMatchColorOverviewRuler: '#fb3'
  }
}

export function Terminal({ tabId }: { tabId: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ index: -1, count: 0 })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000 })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    searchRef.current = search
    term.open(container)

    const offResults = search.onDidChangeResults((r) => setResults({ index: r.resultIndex, count: r.resultCount }))

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
    // Ctrl/Cmd+F : ouvre la recherche · Ctrl/Cmd+V : colle (une seule source) ·
    // Ctrl/Cmd+C : copie si sélection (sinon laisser passer le SIGINT).
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
      offResults.dispose()
      offData()
      onInput.dispose()
      ro.disconnect()
      window.removeEventListener('resize', doFit)
      term.dispose()
      searchRef.current = null
    }
  }, [tabId])

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  function runSearch(q: string, prev = false): void {
    setQuery(q)
    if (!q) {
      searchRef.current?.clearDecorations()
      setResults({ index: -1, count: 0 })
      return
    }
    if (prev) searchRef.current?.findPrevious(q, SEARCH_OPTS)
    else searchRef.current?.findNext(q, SEARCH_OPTS)
  }

  function closeSearch(): void {
    setSearchOpen(false)
    setQuery('')
    searchRef.current?.clearDecorations()
    setResults({ index: -1, count: 0 })
  }

  return (
    <div className="term-host">
      {searchOpen && (
        <div className="term-search">
          <input
            ref={inputRef}
            value={query}
            placeholder="Rechercher…"
            onChange={(e) => runSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); runSearch(query, e.shiftKey) }
              else if (e.key === 'Escape') { e.preventDefault(); closeSearch() }
            }}
          />
          <span className="term-search-count">{results.count ? `${results.index + 1}/${results.count}` : '0/0'}</span>
          <button title="Précédent (Maj+Entrée)" onClick={() => runSearch(query, true)}>▲</button>
          <button title="Suivant (Entrée)" onClick={() => runSearch(query)}>▼</button>
          <button title="Fermer (Échap)" onClick={closeSearch}>✕</button>
        </div>
      )}
      <div ref={containerRef} className="term-screen" />
    </div>
  )
}
