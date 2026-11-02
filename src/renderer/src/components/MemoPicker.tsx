import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Group } from '../store'
import type { MemoOption } from '../memo'
import { ChevronIcon } from './icons'

interface Props {
  groups: Group[]
  options: MemoOption[]
  value: string | null
  onChange: (id: string) => void
}

const GAP = 4
const EDGE = 8

/** Sélecteur de mémo reprenant la hiérarchie de la sidebar : en-tête de groupe teinté, mémos rattachés par le trait coloré. */
export function MemoPicker({ groups, options, value, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.id === value)
  const sections = groups
    .map((g) => ({ g, memos: options.filter((o) => o.groupId === g.id) }))
    .filter((s) => s.memos.length > 0)
  const flat = sections.flatMap((s) => s.memos.map((m) => m.id))

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const place = (): void => {
      const r = btn.current!.getBoundingClientRect()
      const top = r.bottom + GAP
      const w = pop.current?.offsetWidth ?? 220
      setPos({
        left: Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE)),
        top,
        maxH: Math.max(120, window.innerHeight - top - EDGE)
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  useEffect(() => {
    if (!open || !hover) return
    pop.current?.querySelector(`[data-id="${CSS.escape(hover)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, hover])

  function toggle(): void {
    setHover(value)
    setOpen((o) => !o)
  }
  function pick(id: string): void {
    setOpen(false)
    btn.current?.focus()
    if (id !== value) onChange(id)
  }
  function onKey(e: React.KeyboardEvent): void {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); toggle() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const i = flat.indexOf(hover ?? '')
      const n = e.key === 'ArrowDown' ? Math.min(flat.length - 1, i + 1) : Math.max(0, i - 1)
      setHover(flat[n] ?? null)
      return
    }
    if ((e.key === 'Enter' || e.key === ' ') && hover) { e.preventDefault(); pick(hover) }
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`memo-picker-btn${open ? ' open' : ''}`}
        title={current ? `${current.groupName} — ${current.name}` : ''}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={onKey}
      >
        <span className="memo-picker-label">{current?.name ?? 'Mémo'}</span>
        <ChevronIcon size={13} />
      </button>
      {open && (
        <div
          ref={pop}
          className="memo-picker-pop"
          role="listbox"
          style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxH } : { visibility: 'hidden' }}
          onKeyDown={onKey}
        >
          {sections.map(({ g, memos }) => (
            <div key={g.id} className="memo-picker-group" style={{ ['--gc' as string]: g.color ?? undefined }}>
              <div className="memo-picker-head">
                <span className="group-dot" />
                <span className="memo-picker-gname">{g.name}</span>
              </div>
              <div className="memo-picker-items">
                {memos.map((m) => (
                  <div
                    key={m.id}
                    data-id={m.id}
                    role="option"
                    aria-selected={m.id === value}
                    className={`memo-picker-item${m.id === value ? ' sel' : ''}${m.id === hover ? ' hov' : ''}`}
                    onPointerEnter={() => setHover(m.id)}
                    onClick={() => pick(m.id)}
                  >
                    {m.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
