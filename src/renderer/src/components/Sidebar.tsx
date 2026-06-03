import React, { useState } from 'react'
import { useHub, type Item } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, PinIcon } from './icons'
import { basename } from '../util'

/** Ouvre une session pour un item éteint et la lie. */
async function launch(item: Item): Promise<void> {
  const tabId = await window.hub.newSession(item.cwd)
  useHub.getState().bindSession(item.id, tabId)
}

function activeAgents(item: Item): number {
  return item.agents.filter((a) => !a.done).length
}

export function Sidebar(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeItemId = useHub((s) => s.activeItemId)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const [menu, setMenu] = useState<string | null>(null)

  async function onItemClick(item: Item): Promise<void> {
    useHub.getState().setActiveItem(item.id)
    if (!item.tabId) await launch(item)
  }

  async function addItemTo(groupId: string): Promise<void> {
    const cwd = await window.hub.pickFolder()
    if (!cwd) return
    const tabId = await window.hub.newSession(cwd)
    const item: Item = {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId,
      state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: ''
    }
    useHub.getState().addItem(groupId, item)
  }

  function rename(kind: 'group' | 'item', id: string, current: string): void {
    const name = window.prompt('Renommer :', current)
    setMenu(null)
    if (name && name.trim()) {
      if (kind === 'group') useHub.getState().renameGroup(id, name.trim())
      else useHub.getState().renameItem(id, name.trim())
    }
  }

  function removeItem(item: Item): void {
    setMenu(null)
    const busy = item.tabId && (item.state === 'active' || item.state === 'starting' || activeAgents(item) > 0)
    if (busy && !window.confirm(`Supprimer « ${item.name} » ? Une session est active.`)) return
    if (item.tabId) window.hub.killSession(item.tabId)
    useHub.getState().removeItem(item.id)
  }

  function removeGroup(groupId: string, name: string): void {
    setMenu(null)
    if (!window.confirm(`Supprimer le groupe « ${name} » et ses sessions ?`)) return
    const g = useHub.getState().groups.find((x) => x.id === groupId)
    g?.items.forEach((i) => { if (i.tabId) window.hub.killSession(i.tabId) })
    useHub.getState().removeGroup(groupId)
  }

  return (
    <div id="sidebar">
      <div className="sidebar-brand">DIFAI-IDE</div>
      <div className="sidebar-scroll">
        {groups.map((g) => (
          <div key={g.id} className={`group${g.id === activeGroupId ? ' active-group' : ''}`}>
            <div className="group-head">
              <span className="group-chevron" onClick={() => useHub.getState().toggleGroupCollapsed(g.id)}>{g.collapsed ? '▸' : '▾'}</span>
              <span className="group-name" onClick={() => useHub.getState().setActiveGroup(g.id)}>{g.name}</span>
              <span className="group-actions">
                <span className="ic-btn" title="Ajouter un Claude" onClick={() => addItemTo(g.id)}>＋</span>
                <span className="ic-btn" title="Menu" onClick={() => setMenu(menu === g.id ? null : g.id)}>···</span>
              </span>
              {menu === g.id && (
                <div className="ctx-menu">
                  <div onClick={() => rename('group', g.id, g.name)}>✎ Renommer</div>
                  <div onClick={() => removeGroup(g.id, g.name)}>🗑 Supprimer</div>
                </div>
              )}
            </div>
            {!g.collapsed && g.items.map((it) => (
              <div
                key={it.id}
                className={`item${it.id === activeItemId ? ' active-item' : g.id === activeGroupId ? ' active-group-item' : ''}`}
                onClick={() => onItemClick(it)}
              >
                <span className="item-ic"><TerminalIcon /></span>
                <span className="item-name">{it.name}</span>
                {it.tabId ? <StateDot state={it.state} /> : <span className="off">○</span>}
                <span className="item-actions">
                  {it.pinned && <span className="pin on" title="Épinglé"><PinIcon /></span>}
                  <span className="ic-btn" title="Menu" onClick={(e) => { e.stopPropagation(); setMenu(menu === it.id ? null : it.id) }}>···</span>
                </span>
                {menu === it.id && (
                  <div className="ctx-menu">
                    <div onClick={(e) => { e.stopPropagation(); rename('item', it.id, it.name) }}>✎ Renommer</div>
                    <div onClick={(e) => { e.stopPropagation(); useHub.getState().togglePin(it.id); setMenu(null) }}>📌 {it.pinned ? 'Désépingler' : 'Épingler'}</div>
                    <div onClick={(e) => { e.stopPropagation(); removeItem(it) }}>🗑 Supprimer</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="new-group" onClick={() => { const n = window.prompt('Nom du groupe :'); if (n && n.trim()) useHub.getState().addGroup(n.trim()) }}>＋ Nouveau groupe</div>
      </div>
    </div>
  )
}
