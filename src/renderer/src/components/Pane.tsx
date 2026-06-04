import React, { useState } from 'react'
import { useHub, parseRef, type Group, type PaneTab, type Pane as Side } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, FolderIcon } from './icons'
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
  const sessions = tabs.filter((t) => t.kind === 'session')
  const active = activeRef ? parseRef(activeRef) : null

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
                draggable
                onDragStart={() => setDragId(t.item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); onDropTab(t.item.id) }}
                onClick={() => useHub.getState().selectTab(side, t.ref)}
              >
                <span className="tab-ic"><TerminalIcon /></span>
                <StateDot state={t.item.state} />
                <span className="tab-title">{t.item.name}</span>
                <span
                  className="tab-agents"
                  title="Ouvrir les agents"
                  onClick={(e) => { e.stopPropagation(); useHub.getState().openAgentsTab(t.item.id) }}
                >· {t.item.agents.filter((a) => !a.done).length} agents</span>
                <span className="tab-close" title="Fermer l'onglet" onClick={(e) => closeSession(e, t.item.id, t.item.tabId)}>✕</span>
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
