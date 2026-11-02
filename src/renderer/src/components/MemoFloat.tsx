import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useHub } from '../store'
import { clampMemoRect, makeMemoItem, memoOptions, resolveMemoTarget, type Rect } from '../memo'
import { memoColorVars } from '../memoColor'
import { MemoEditor } from './MemoEditor'
import { CloseIcon } from './icons'

// Hauteur de la barre de titre (titleBarOverlay) : la fenêtre ne doit pas passer dessous.
const TITLE_H = 36

type Gesture = { kind: 'move' | 'resize'; px: number; py: number; start: Rect }

/** Pense-bête flottant : liste déroulante des mémos, contenu éditable, déplaçable et redimensionnable. */
export function MemoFloat(): React.JSX.Element | null {
  const float = useHub((s) => s.memoFloat)
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const [rect, setRect] = useState<Rect>(() => clampMemoRect(float, window.innerWidth, window.innerHeight, TITLE_H))
  const gesture = useRef<Gesture | null>(null)
  const [dragging, setDragging] = useState(false)

  const options = useMemo(() => memoOptions(groups), [groups])
  const targetId = resolveMemoTarget(groups, float.itemId, activeGroupId)
  const target = options.find((o) => o.id === targetId)

  // Recale la fenêtre quand l'app est redimensionnée (ou à l'ouverture).
  useEffect(() => {
    if (!float.open) return
    const fit = (): void => {
      const s = useHub.getState().memoFloat
      const r = clampMemoRect(s, window.innerWidth, window.innerHeight, TITLE_H)
      setRect(r)
      if (r.x !== s.x || r.y !== s.y || r.w !== s.w || r.h !== s.h) useHub.getState().setMemoFloat(r)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [float.open])

  if (!float.open) return null

  function begin(kind: Gesture['kind'], e: React.PointerEvent<HTMLElement>): void {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = { kind, px: e.clientX, py: e.clientY, start: rect }
    setDragging(true)
  }
  function move(e: React.PointerEvent<HTMLElement>): void {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.px
    const dy = e.clientY - g.py
    const next = g.kind === 'move'
      ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy }
      : { ...g.start, w: g.start.w + dx, h: g.start.h + dy }
    setRect(clampMemoRect(next, window.innerWidth, window.innerHeight, TITLE_H))
  }
  function end(e: React.PointerEvent<HTMLElement>): void {
    if (!gesture.current) return
    gesture.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
    useHub.getState().setMemoFloat(rect)
  }

  function createInActiveGroup(): void {
    const s = useHub.getState()
    const gid = s.activeGroupId ?? s.groups[0]?.id
    if (!gid) return
    const item = { ...makeMemoItem(), memoClosed: true }
    s.addItem(gid, item)
    s.setMemoFloat({ itemId: item.id })
  }

  const byGroup = groups
    .map((g) => ({ g, memos: options.filter((o) => o.groupId === g.id) }))
    .filter((x) => x.memos.length > 0)
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0]

  return (
    <div
      className={`memo-float memo-paper${dragging ? ' dragging' : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...memoColorVars(target?.color) }}
      role="dialog"
      aria-label="Mémo"
    >
      <div
        className="memo-float-head"
        onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('select, button')) begin('move', e) }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {options.length > 0 ? (
          <select
            className="memo-float-select"
            value={targetId ?? ''}
            title={target ? `${target.groupName} — ${target.name}` : ''}
            onChange={(e) => useHub.getState().setMemoFloat({ itemId: e.target.value })}
          >
            {byGroup.map(({ g, memos }) => (
              <optgroup key={g.id} label={g.name}>
                {memos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            ))}
          </select>
        ) : (
          <span className="memo-float-title">Mémo</span>
        )}
        <span className="memo-float-grab" />
        <button type="button" className="memo-float-close" title="Fermer" aria-label="Fermer" onClick={() => useHub.getState().setMemoFloat({ open: false })}>
          <CloseIcon size={15} />
        </button>
      </div>
      {targetId ? (
        <MemoEditor key={targetId} itemId={targetId} autoFocus />
      ) : (
        <div className="memo-float-empty">
          <p>Aucun mémo pour l'instant.</p>
          {activeGroup && <button type="button" className="btn" onClick={createInActiveGroup}>Créer un mémo dans « {activeGroup.name} »</button>}
        </div>
      )}
      <span
        className="memo-float-resize"
        title="Redimensionner"
        onPointerDown={(e) => begin('resize', e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  )
}
