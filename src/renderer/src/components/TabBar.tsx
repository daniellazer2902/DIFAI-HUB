import React, { useState } from 'react'
import { useHub, type Item } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon } from './icons'
import { basename } from '../util'

export function TabBar(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const activeItemId = useHub((s) => s.activeItemId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const group = groups.find((g) => g.id === activeGroupId)
  const liveItems = (group?.items ?? []).filter((i) => i.tabId)

  async function openTab(cwd: string): Promise<void> {
    setMenuOpen(false)
    const gid = useHub.getState().activeGroupId ?? useHub.getState().addGroup('Sessions')
    const tabId = await window.hub.newSession(cwd)
    const item: Item = {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId,
      state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: ''
    }
    useHub.getState().addItem(gid, item)
  }
  async function onDefault(): Promise<void> { openTab(await window.hub.defaultCwd()) }
  async function onPick(): Promise<void> { const f = await window.hub.pickFolder(); if (f) openTab(f); else setMenuOpen(false) }

  function close(e: React.MouseEvent, it: Item): void {
    e.stopPropagation()
    if (it.tabId) window.hub.killSession(it.tabId)
    useHub.getState().closeSession(it.id)
  }

  function onDrop(targetId: string): void {
    if (!dragId || dragId === targetId || !group) return
    const idx = group.items.findIndex((i) => i.id === targetId)
    useHub.getState().moveItem(dragId, idx, group.id)
    setDragId(null)
  }

  return (
    <div className="tabbar">
      {liveItems.map((it) => (
        <div
          key={it.id}
          className={`tab${it.id === activeItemId ? ' act' : ''}`}
          draggable
          onDragStart={() => setDragId(it.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(it.id)}
          onClick={() => useHub.getState().setActiveItem(it.id)}
        >
          <span className="tab-ic"><TerminalIcon /></span>
          <StateDot state={it.state} />
          <span className="tab-title">{it.name}</span>
          <span className="tab-agents">· {it.agents.filter((a) => !a.done).length} agents</span>
          <span className="tab-close" title="Fermer l'onglet" onClick={(e) => close(e, it)}>✕</span>
        </div>
      ))}
      <div className="tab-new">
        <button title="Nouvel onglet" onClick={() => setMenuOpen((o) => !o)}>＋</button>
        {menuOpen && (
          <div className="tab-new-menu">
            <div onClick={onDefault}>📂 Dossier par défaut</div>
            <div onClick={onPick}>🗂 Choisir un dossier…</div>
          </div>
        )}
      </div>
    </div>
  )
}
