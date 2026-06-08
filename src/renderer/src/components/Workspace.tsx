import React, { useEffect, useRef, useState } from 'react'
import { useHub, paneTabs } from '../store'
import { clampConsoleWidth, writeConsoleWidth } from '../util'
import { Pane } from './Pane'

const VP_KEY = 'difai.consoleWidthViewport'

export function Workspace(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const consoleWidth = useHub((s) => s.consoleWidth)
  const setConsoleWidth = useHub((s) => s.setConsoleWidth)
  const [dragId, setDragId] = useState<string | null>(null)
  const panesRef = useRef<HTMLDivElement>(null)

  // Largeur de référence = zone des volets (fenêtre HORS sidebar), pas la fenêtre entière.
  const availWidth = (): number => panesRef.current?.clientWidth || window.innerWidth - 230

  // Re-borne la largeur du volet droit au redimensionnement de la fenêtre (max 50 % de la zone volets).
  useEffect(() => {
    const onResize = (): void => setConsoleWidth(clampConsoleWidth(useHub.getState().consoleWidth, availWidth()))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [setConsoleWidth])

  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startW = consoleWidth
    const avail = availWidth()
    const move = (ev: MouseEvent): void => setConsoleWidth(clampConsoleWidth(startW - (ev.clientX - startX), avail))
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      writeConsoleWidth(useHub.getState().consoleWidth)
      try { localStorage.setItem(VP_KEY, String(window.innerWidth)) } catch { /* ignore */ }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const group = groups.find((g) => g.id === activeGroupId)
  const leftTabs = group ? paneTabs(group, 'left') : []
  const rightTabs = group ? paneTabs(group, 'right') : []
  const splitOpen = leftTabs.length > 0 && rightTabs.length > 0

  // On monte les volets de TOUS les groupes (inactifs masqués en display:none) pour ne jamais
  // démonter leurs terminaux : sinon le Terminal se dispose et perd son buffer/scrollback xterm
  // → au retour sur le groupe, l'historique défilé est perdu et le scroll « reset ».

  // À l'ouverture du split : si la fenêtre a changé de taille depuis le dernier réglage,
  // on (re)met le volet à 50 % de la zone des volets.
  const prevSplit = useRef(false)
  useEffect(() => {
    if (splitOpen && !prevSplit.current) {
      let vp = 0
      try { vp = Number(localStorage.getItem(VP_KEY) || '0') } catch { /* ignore */ }
      if (vp !== window.innerWidth) {
        const avail = availWidth()
        const half = clampConsoleWidth(Math.round(avail / 2), avail)
        setConsoleWidth(half)
        writeConsoleWidth(half)
        try { localStorage.setItem(VP_KEY, String(window.innerWidth)) } catch { /* ignore */ }
      }
    }
    prevSplit.current = splitOpen
  }, [splitOpen, setConsoleWidth])

  function dropTo(split: 1 | 2): void {
    if (dragId) useHub.getState().setSplit(dragId, split)
    setDragId(null)
  }

  return (
    <div id="panes" ref={panesRef}>
      {groups.map((g) => {
        const isActive = g.id === activeGroupId
        const lt = paneTabs(g, 'left')
        const rt = paneTabs(g, 'right')
        return (
          <div key={g.id} className="group-panes" style={{ display: isActive ? 'flex' : 'none' }}>
            {isActive && dragId && lt.length === 0 && rt.length > 0 && (
              <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => dropTo(1)}>← Déposer à gauche</div>
            )}
            {lt.length > 0 && (
              <Pane side="left" group={g} tabs={lt} activeRef={g.leftActiveTab} width={consoleWidth} hasOther={rt.length > 0} dragId={dragId} setDragId={setDragId} />
            )}
            {lt.length > 0 && rt.length > 0 && (
              <div className="splitter" title="Redimensionner" onMouseDown={startResize} />
            )}
            {rt.length > 0 && (
              <Pane side="right" group={g} tabs={rt} activeRef={g.rightActiveTab} width={consoleWidth} hasOther={lt.length > 0} dragId={dragId} setDragId={setDragId} />
            )}
            {isActive && dragId && lt.length > 0 && rt.length === 0 && (
              <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => dropTo(2)}>Déposer à droite →</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
