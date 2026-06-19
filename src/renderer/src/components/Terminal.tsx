import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useHub } from '../store'
import { MD_PATH_RE } from '../mdLinks'
import { confirm } from '../confirm'

export function Terminal({ tabId }: { tabId: string }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const links = new WebLinksAddon(
      (_event, uri) => { void openMdLink(uri) },
      { urlRegex: MD_PATH_RE }
    )
    term.loadAddon(links)
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

    async function openMdLink(token: string): Promise<void> {
      const item = useHub.getState().itemByTab(tabId)
      if (!item) return
      const abs = await window.hub.notesResolveFile(item.cwd, token)
      if (!abs) {
        await confirm({ title: 'Fichier introuvable', message: token, confirmLabel: 'OK' })
        return
      }
      useHub.getState().openNoteFile(abs, item.id)
    }

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

  // onFocus/onBlur bubblent depuis le textarea interne de xterm → on suit la console focus
  // pour l'accusé « vu » (attention -> waiting) géré dans le store.
  return (
    <div
      ref={containerRef}
      className="term-screen"
      onFocus={() => useHub.getState().focusConsole(tabId)}
      onBlur={() => useHub.getState().blurConsole(tabId)}
    />
  )
}
