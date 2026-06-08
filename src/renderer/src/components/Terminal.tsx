import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'

export function Terminal({ tabId }: { tabId: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: '"Cascadia Mono", "Cascadia Code", "Segoe UI Emoji", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
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
    // (Ctrl/Cmd+F est géré globalement dans App, en phase capture.)
    // Ctrl/Cmd+V : colle (une seule source) · Ctrl/Cmd+C : copie si sélection (sinon SIGINT).
    term.attachCustomKeyEventHandler((e): boolean => {
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return true
      const key = e.key.toLowerCase()
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

  return <div ref={containerRef} className="term-screen" />
}
