import React, { useEffect, useRef, useState } from 'react'
import { useHub, parseRef, type Group, type PaneTab, type Pane as Side } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, FolderIcon, EditIcon, PinIcon, TrashIcon } from './icons'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { SearchPanel } from './SearchPanel'
import { basename } from '../util'

interface Props {
  side: Side
  group: Group
  tabs: PaneTab[]
  activeRef: string | null
  width: number
  hasOther: boolean
  dragId: string | null
  setDragId: (id: string | null) => void
}

type Pos = { x: number; y: number }
type Ctx = { id: string; x: number; y: number }

function tabLabel(t: PaneTab): string {
  return t.kind === 'session' ? t.item.name : `${t.item.name} - ${t.kind === 'find' ? 'Find' : 'Agents'}`
}

export function Pane({ side, group, tabs, activeRef, width, hasOther, dragId, setDragId }: Props): React.JSX.Element {
  const [addMenu, setAddMenu] = useState<Pos | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [ctx, setCtx] = useState<Ctx | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const sessions = tabs.filter((t) => t.kind === 'session')
  const active = activeRef ? parseRef(activeRef) : null
  const ctxItem = ctx ? group.items.find((i) => i.id === ctx.id) : undefined

  // Détecte le débordement du bandeau (onglets + bouton ＋ ne tiennent plus).
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const check = (): void => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs.length])

  // Ferme les menus (＋, débordement, contextuel) au clic extérieur.
  useEffect(() => {
    if (!addMenu && !overflowOpen && !ctx) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!t.closest('.tab-new') && !t.closest('.add-menu')) setAddMenu(null)
      if (!t.closest('.tab-overflow')) setOverflowOpen(false)
      if (!t.closest('.tab-ctx') && !t.closest('.tab')) setCtx(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [addMenu, overflowOpen, ctx])

  useEffect(() => {
    if (editingId) { editRef.current?.focus(); editRef.current?.select() }
  }, [editingId])

  function startRename(itemId: string, current: string): void {
    setCtx(null)
    setEditValue(current)
    setEditingId(itemId)
  }
  function commitRename(): void {
    if (editingId && editValue.trim()) useHub.getState().renameItem(editingId, editValue.trim())
    setEditingId(null)
  }

  function closeMenus(): void { setAddMenu(null); setOverflowOpen(false) }

  async function openTab(cwd: string): Promise<void> {
    closeMenus()
    const tabId = await window.hub.newSession(cwd)
    const id = crypto.randomUUID()
    useHub.getState().addItem(group.id, {
      id, name: basename(cwd), cwd, pinned: false, tabId, state: 'starting', agents: [], openAgentId: null,
      split: side === 'right' ? 2 : 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'claude'
    })
  }
  async function onDefault(): Promise<void> { openTab(group.defaultCwd ?? useHub.getState().globalDefaultCwd ?? (await window.hub.defaultCwd())) }
  async function onPick(): Promise<void> { const f = await window.hub.pickFolder(); if (f) openTab(f); else closeMenus() }

  function closeSession(e: React.MouseEvent, itemId: string, tabId: string | null): void {
    e.stopPropagation()
    if (tabId) window.hub.killSession(tabId)
    useHub.getState().closeSession(itemId)
  }

  function onDropTab(targetItemId: string): void {
    if (!dragId || dragId === targetItemId) { setDragId(null); return }
    const dragged = group.items.find((i) => i.id === dragId)
    if (!dragged) { setDragId(null); return }
    if (dragged.split !== (side === 'right' ? 2 : 1)) useHub.getState().setSplit(dragId, side === 'right' ? 2 : 1)
    else {
      const idx = group.items.findIndex((i) => i.id === targetItemId)
      useHub.getState().moveItem(dragId, idx, group.id)
    }
    setDragId(null)
  }
  function onDropPane(): void {
    if (dragId) useHub.getState().setSplit(dragId, side === 'right' ? 2 : 1)
    setDragId(null)
  }

  return (
    <div
      className={`pane ${side}`}
      style={side === 'right' && hasOther ? { width } : { flex: 1, minWidth: 0 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropPane}
    >
      <div className="pane-tabstrip">
        <div className="tab-row" ref={rowRef}>
          {tabs.map((t) => {
            const sel = t.ref === activeRef
            if (t.kind === 'session') {
              return (
                <div
                  key={t.ref}
                  className={`tab${sel ? ' act' : ''}`}
                  draggable={editingId !== t.item.id}
                  onDragStart={(e) => {
                    setAddMenu(null); setCtx(null)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', t.item.id)
                    const id = t.item.id
                    setTimeout(() => setDragId(id), 0)
                  }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); onDropTab(t.item.id) }}
                  onClick={() => useHub.getState().selectTab(side, t.ref)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    const x = Math.max(4, Math.min(e.clientX, window.innerWidth - 190))
                    const y = Math.min(e.clientY, window.innerHeight - 150)
                    setCtx(ctx?.id === t.item.id ? null : { id: t.item.id, x, y })
                  }}
                >
                  <span className="tab-ic"><TerminalIcon /></span>
                  <StateDot state={t.item.state} />
                  {editingId === t.item.id ? (
                    <input
                      ref={editRef}
                      className="inline-edit"
                      value={editValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename() }
                        else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                      }}
                    />
                  ) : (
                    <span className="tab-title">{t.item.name}</span>
                  )}
                  {t.item.pinned && <span className="tab-pin"><PinIcon /></span>}
                  <span className="tab-agents">· {t.item.agents.filter((a) => !a.done).length} agents</span>
                  <span className="tab-close" title="Fermer l'onglet" onClick={(e) => closeSession(e, t.item.id, t.item.tabId)}>✕</span>
                </div>
              )
            }
            const onClose = t.kind === 'find' ? () => useHub.getState().closeFind(t.item.id) : () => useHub.getState().closeAgentsTab(t.item.id)
            return (
              <div key={t.ref} className={`tab aux${sel ? ' act' : ''}`} onClick={() => useHub.getState().selectTab(side, t.ref)}>
                <span className="tab-title">{tabLabel(t)}</span>
                <span className="tab-close" title="Fermer l'onglet" onClick={(e) => { e.stopPropagation(); onClose() }}>✕</span>
              </div>
            )
          })}
          <div className="tab-new">
            <button title="Nouvel onglet" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setAddMenu(addMenu ? null : { x: Math.max(4, Math.min(r.left, window.innerWidth - 228)), y: r.bottom + 2 }) }}>＋</button>
          </div>
        </div>
        {overflowing && (
          <div className="tab-controls">
            <div className="tab-overflow">
              <button title="Tous les onglets" onClick={() => setOverflowOpen((o) => !o)}>▾</button>
              {overflowOpen && (
                <div className="tab-overflow-menu">
                  {tabs.map((t) => (
                    <div
                      key={t.ref}
                      className={t.ref === activeRef ? 'sel' : ''}
                      onClick={() => { useHub.getState().selectTab(side, t.ref); setOverflowOpen(false) }}
                    >{tabLabel(t)}</div>
                  ))}
                  <div className="ovf-add" onClick={onDefault}><FolderIcon /> ＋ Dossier par défaut</div>
                  <div className="ovf-add" onClick={onPick}><FolderIcon /> ＋ Choisir un dossier…</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="pane-body">
        {sessions.map((t) => (
          <div key={t.item.id} className="body-slot" style={{ display: active?.kind === 'session' && active.itemId === t.item.id ? 'block' : 'none' }}>
            <Terminal tabId={t.item.tabId as string} />
          </div>
        ))}
        {active?.kind === 'find' && <SearchPanel itemId={active.itemId} />}
        {active?.kind === 'agents' && <Console itemId={active.itemId} />}
      </div>
      {addMenu && (
        <div className="tab-new-menu add-menu" style={{ position: 'fixed', left: addMenu.x, top: addMenu.y }}>
          <div onClick={onDefault}><FolderIcon /> Dossier par défaut</div>
          <div onClick={onPick}><FolderIcon /> Choisir un dossier…</div>
        </div>
      )}
      {ctx && ctxItem && (
        <div className="ctx-menu tab-ctx" style={{ position: 'fixed', left: ctx.x, top: ctx.y, right: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => startRename(ctxItem.id, ctxItem.name)}><EditIcon /> Renommer</div>
          <div onClick={() => { useHub.getState().togglePin(ctxItem.id); setCtx(null) }}><PinIcon /> {ctxItem.pinned ? 'Désépingler' : 'Épingler'}</div>
          <div onClick={() => { if (ctxItem.agentsOpen) useHub.getState().closeAgentsTab(ctxItem.id); else useHub.getState().openAgentsTab(ctxItem.id); setCtx(null) }}><TerminalIcon /> {ctxItem.agentsOpen ? 'Cacher Agents' : 'Afficher Agents'}</div>
          <div className="danger" onClick={(e) => { closeSession(e, ctxItem.id, ctxItem.tabId); setCtx(null) }}><TrashIcon /> Supprimer</div>
        </div>
      )}
    </div>
  )
}
