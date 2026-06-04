import React, { useEffect, useRef, useState } from 'react'
import { useHub, type Item, type Group } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, PinIcon, EditIcon, TrashIcon, FolderIcon } from './icons'
import { basename, isBusy } from '../util'

/** Ouvre une session pour un item éteint et la lie. */
async function launch(item: Item): Promise<void> {
  const tabId = await window.hub.newSession(item.cwd)
  useHub.getState().bindSession(item.id, tabId)
}

type Editing = { kind: 'group' | 'item'; id: string }

export function Sidebar(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeItemId = useHub((s) => s.activeItemId)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const [menu, setMenu] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  // Ferme le menu ··· au clic extérieur.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!t.closest('.ctx-menu') && !t.closest('.menu-btn')) setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  useEffect(() => {
    if (editing) { editRef.current?.focus(); editRef.current?.select() }
  }, [editing])

  function startRename(kind: 'group' | 'item', id: string, current: string): void {
    setMenu(null)
    setEditValue(current)
    setEditing({ kind, id })
  }
  function commitRename(): void {
    if (editing && editValue.trim()) {
      if (editing.kind === 'group') useHub.getState().renameGroup(editing.id, editValue.trim())
      else useHub.getState().renameItem(editing.id, editValue.trim())
    }
    setEditing(null)
  }

  async function onItemClick(item: Item): Promise<void> {
    useHub.getState().setActiveItem(item.id)
    if (!item.tabId) await launch(item)
  }

  // ＋ du groupe : utilise le dossier par défaut du groupe s'il est défini, sinon demande.
  async function addItemTo(group: Group): Promise<void> {
    const cwd = group.defaultCwd ?? (await window.hub.pickFolder())
    if (!cwd) return
    const tabId = await window.hub.newSession(cwd)
    const item: Item = {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId,
      state: 'starting', agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: ''
    }
    useHub.getState().addItem(group.id, item)
  }

  async function setGroupDefault(groupId: string): Promise<void> {
    setMenu(null)
    const cwd = await window.hub.pickFolder()
    if (cwd) useHub.getState().setGroupDefaultCwd(groupId, cwd)
  }

  function addGroup(): void {
    const id = useHub.getState().addGroup('Nouveau groupe')
    startRename('group', id, 'Nouveau groupe') // édition inline immédiate
  }

  function removeItem(item: Item): void {
    setMenu(null)
    if (isBusy(item) && !window.confirm(`Supprimer « ${item.name} » ? Une session est active.`)) return
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

  function nameOrEditor(kind: 'group' | 'item', id: string, name: string, cls: string): React.JSX.Element {
    if (editing && editing.kind === kind && editing.id === id) {
      return (
        <input
          ref={editRef}
          className="inline-edit"
          value={editValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            else if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
          }}
        />
      )
    }
    return <span className={cls}>{name}</span>
  }

  return (
    <div id="sidebar">
      <div className="sidebar-scroll">
        {groups.map((g) => (
          <div key={g.id} className={`group${g.id === activeGroupId ? ' active-group' : ''}`}>
            <div className="group-head" onContextMenu={(e) => { e.preventDefault(); setMenu(g.id) }}>
              <span className="group-chevron" onClick={() => useHub.getState().toggleGroupCollapsed(g.id)}>{g.collapsed ? '▸' : '▾'}</span>
              <span className="group-name-wrap" onClick={() => useHub.getState().setActiveGroup(g.id)}>{nameOrEditor('group', g.id, g.name, 'group-name')}</span>
              <span className="group-actions">
                <span className="ic-btn" title="Ajouter un Claude" onClick={() => addItemTo(g)}>＋</span>
                <span className="ic-btn menu-btn" title="Menu" onClick={() => setMenu(menu === g.id ? null : g.id)}>···</span>
              </span>
              {menu === g.id && (
                <div className="ctx-menu">
                  <div onClick={() => startRename('group', g.id, g.name)}><EditIcon /> Renommer</div>
                  <div onClick={() => setGroupDefault(g.id)}><FolderIcon /> Dossier par défaut…</div>
                  <div className="danger" onClick={() => removeGroup(g.id, g.name)}><TrashIcon /> Supprimer</div>
                </div>
              )}
            </div>
            {!g.collapsed && g.items.map((it) => (
              <div
                key={it.id}
                className={`item${it.id === activeItemId ? ' active-item' : g.id === activeGroupId ? ' active-group-item' : ''}`}
                onClick={() => onItemClick(it)}
                onContextMenu={(e) => { e.preventDefault(); setMenu(it.id) }}
              >
                <span className="item-ic"><TerminalIcon /></span>
                {nameOrEditor('item', it.id, it.name, 'item-name')}
                <span className="item-pin">{it.pinned && <PinIcon />}</span>
                <span className="item-state">{it.tabId ? <StateDot state={it.state} /> : <span className="off">○</span>}</span>
                <span className="ic-btn menu-btn item-menu" title="Menu" onClick={(e) => { e.stopPropagation(); setMenu(menu === it.id ? null : it.id) }}>···</span>
                {menu === it.id && (
                  <div className="ctx-menu" onClick={(e) => e.stopPropagation()}>
                    <div onClick={() => startRename('item', it.id, it.name)}><EditIcon /> Renommer</div>
                    <div onClick={() => { useHub.getState().togglePin(it.id); setMenu(null) }}><PinIcon /> {it.pinned ? 'Désépingler' : 'Épingler'}</div>
                    <div className="danger" onClick={() => removeItem(it)}><TrashIcon /> Supprimer</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="new-group" onClick={addGroup}>＋ Nouveau groupe</div>
      </div>
    </div>
  )
}
