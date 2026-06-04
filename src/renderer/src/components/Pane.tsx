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

export function Pane({ side, group, tabs, activeRef, width, hasOther, dragId, setDragId }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [ctxFor, setCtxFor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const sessions = tabs.filter((t) => t.kind === 'session')
  const active = activeRef ? parseRef(activeRef) : null

  // Ferme le menu ＋ et le menu contextuel d'onglet au clic extérieur (et au début d'un drag).
  useEffect(() => {
    if (!menuOpen && !ctxFor) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!t.closest('.tab-new')) setMenuOpen(false)
      if (!t.closest('.tab-ctx') && !t.closest('.tab')) setCtxFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen, ctxFor])

  useEffect(() => {
    if (editingId) { editRef.current?.focus(); editRef.current?.select() }
  }, [editingId])

  function startRename(itemId: string, current: string): void {
    setCtxFor(null)
    setEditValue(current)
    setEditingId(itemId)
  }
  function commitRename(): void {
    if (editingId && editValue.trim()) useHub.getState().renameItem(editingId, editValue.trim())
    setEditingId(null)
  }

  async function openTab(cwd: string): Promise<void> {
    setMenuOpen(false)
    const gid = group.id
    const tabId = await window.hub.newSession(cwd)
    const id = crypto.randomUUID()
    useHub.getState().addItem(gid, {
      id, name: basename(cwd), cwd, pinned: false, tabId, state: 'starting', agents: [], openAgentId: null,
      split: side === 'right' ? 2 : 1, findOpen: false, agentsOpen: false, searchQuery: ''
    })
  }
  async function onDefault(): Promise<void> { openTab(group.defaultCwd ?? (await window.hub.defaultCwd())) }
  async function onPick(): Promise<void> { const f = await window.hub.pickFolder(); if (f) openTab(f); else setMenuOpen(false) }

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
        {tabs.map((t) => {
          const sel = t.ref === activeRef
          if (t.kind === 'session') {
            return (
              <div
                key={t.ref}
                className={`tab${sel ? ' act' : ''}`}
                draggable={editingId !== t.item.id}
                onDragStart={(e) => {
                  setMenuOpen(false); setCtxFor(null)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', t.item.id)
                  // Différé : sinon le re-render (zones de dépôt) pendant dragstart annule le drag (Chromium).
                  const id = t.item.id
                  setTimeout(() => setDragId(id), 0)
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); onDropTab(t.item.id) }}
                onClick={() => useHub.getState().selectTab(side, t.ref)}
                onContextMenu={(e) => { e.preventDefault(); setCtxFor(t.item.id) }}
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
                <span
                  className="tab-agents"
                  title="Ouvrir les agents"
                  onClick={(e) => { e.stopPropagation(); useHub.getState().openAgentsTab(t.item.id) }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxFor(t.item.id) }}
                >· {t.item.agents.filter((a) => !a.done).length} agents</span>
                <span className="tab-close" title="Fermer l'onglet" onClick={(e) => closeSession(e, t.item.id, t.item.tabId)}>✕</span>
                {ctxFor === t.item.id && (
                  <div className="ctx-menu tab-ctx" onClick={(e) => e.stopPropagation()}>
                    <div onClick={() => startRename(t.item.id, t.item.name)}><EditIcon /> Renommer</div>
                    <div onClick={() => { useHub.getState().togglePin(t.item.id); setCtxFor(null) }}><PinIcon /> {t.item.pinned ? 'Désépingler' : 'Épingler'}</div>
                    <div className="danger" onClick={(e) => { closeSession(e, t.item.id, t.item.tabId); setCtxFor(null) }}><TrashIcon /> Supprimer</div>
                  </div>
                )}
              </div>
            )
          }
          const label = `${t.item.name} - ${t.kind === 'find' ? 'Find' : 'Agents'}`
          const onClose = t.kind === 'find' ? () => useHub.getState().closeFind(t.item.id) : () => useHub.getState().closeAgentsTab(t.item.id)
          return (
            <div key={t.ref} className={`tab aux${sel ? ' act' : ''}`} onClick={() => useHub.getState().selectTab(side, t.ref)}>
              <span className="tab-title">{label}</span>
              <span className="tab-close" title="Fermer l'onglet" onClick={(e) => { e.stopPropagation(); onClose() }}>✕</span>
            </div>
          )
        })}
        <div className="tab-new">
          <button title="Nouvel onglet" onClick={() => setMenuOpen((o) => !o)}>＋</button>
          {menuOpen && (
            <div className="tab-new-menu">
              <div onClick={onDefault}><FolderIcon /> Dossier par défaut</div>
              <div onClick={onPick}><FolderIcon /> Choisir un dossier…</div>
            </div>
          )}
        </div>
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
    </div>
  )
}
