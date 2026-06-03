import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function Terminal({ tabId }: { tabId: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

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

    // Le menu Electron (et son rôle "paste" natif) est retiré → on gère nous-mêmes le
    // collage. Ctrl/Cmd+V : colle le presse-papier (une seule source, pas de double).
    // Ctrl/Cmd+C : copie UNIQUEMENT s'il y a une sélection (sinon laisser passer le SIGINT).
    term.attachCustomKeyEventHandler((e): boolean => {
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return true
      const key = e.key.toLowerCase()
      if (key === 'v') {
        // preventDefault coupe le collage natif du navigateur (sinon double-collage :
        // notre term.paste + l'insertion native via l'événement `paste`).
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

  return <div ref={containerRef} style={{ flex: 1, minWidth: 0, height: '100%' }} />
}
