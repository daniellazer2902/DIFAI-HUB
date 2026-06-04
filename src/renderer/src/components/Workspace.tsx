import React, { useEffect, useState } from 'react'
import { useHub, paneTabs } from '../store'
import { clampConsoleWidth, writeConsoleWidth } from '../util'
import { Pane } from './Pane'

export function Workspace(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const consoleWidth = useHub((s) => s.consoleWidth)
  const setConsoleWidth = useHub((s) => s.setConsoleWidth)
  const [dragId, setDragId] = useState<string | null>(null)

  // Re-borne la largeur du volet droit au redimensionnement de la fenêtre
  // (évite un volet figé à la taille d'une fenêtre précédemment plus large).
  useEffect(() => {
    const onResize = (): void => setConsoleWidth(clampConsoleWidth(useHub.getState().consoleWidth))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [setConsoleWidth])

  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startW = consoleWidth
    const move = (ev: MouseEvent): void => setConsoleWidth(clampConsoleWidth(startW - (ev.clientX - startX)))
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      writeConsoleWidth(useHub.getState().consoleWidth)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const group = groups.find((g) => g.id === activeGroupId)
  const leftTabs = group ? paneTabs(group, 'left') : []
  const rightTabs = group ? paneTabs(group, 'right') : []

  function dropTo(split: 1 | 2): void {
    if (dragId) useHub.getState().setSplit(dragId, split)
    setDragId(null)
  }

  return (
    <div id="panes">
      {group && dragId && leftTabs.length === 0 && (
        <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => dropTo(1)}>← Déposer à gauche</div>
      )}
      {group && leftTabs.length > 0 && (
        <Pane side="left" group={group} tabs={leftTabs} activeRef={group.leftActiveTab} width={consoleWidth} hasOther={rightTabs.length > 0} dragId={dragId} setDragId={setDragId} />
      )}
      {group && leftTabs.length > 0 && rightTabs.length > 0 && (
        <div className="splitter" title="Redimensionner" onMouseDown={startResize} />
      )}
      {group && rightTabs.length > 0 && (
        <Pane side="right" group={group} tabs={rightTabs} activeRef={group.rightActiveTab} width={consoleWidth} hasOther={leftTabs.length > 0} dragId={dragId} setDragId={setDragId} />
      )}
      {group && dragId && rightTabs.length === 0 && (
        <div className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={() => dropTo(2)}>Déposer à droite →</div>
      )}
    </div>
  )
}
