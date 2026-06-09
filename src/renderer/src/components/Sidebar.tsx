import React, { useEffect, useRef, useState } from 'react'
import { useHub, type Item, type Group } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, PinIcon, EditIcon, TrashIcon, FolderIcon, PaletteIcon, SettingsIcon, AzureIcon, ClaudeIcon, NotesIcon } from './icons'
import { GroupColorModal } from './GroupColorModal'
import { AdoBindModal } from './AdoBindModal'
import { ClaudeAdvancedModal } from './ClaudeAdvancedModal'
import { parseClaudeArgs } from '../claudeArgs'
import { darken, textOn } from '../color'
import { basename, isBusy } from '../util'
import { readDefaultVault } from '../settings'
import { confirm } from '../confirm'

/** Ouvre une session pour un item éteint et la lie. */
async function launch(item: Item): Promise<void> {
  const tabId = item.kind === 'cmd' ? await window.hub.newCmd(item.cwd) : await window.hub.newSession(item.cwd, item.claudeArgs)
  useHub.getState().bindSession(item.id, tabId)
}

type Editing = { kind: 'group' | 'item'; id: string }

export function Sidebar(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeItemId = useHub((s) => s.activeItemId)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const [menu, setMenu] = useState<string | null>(null)
  const [addFor, setAddFor] = useState<string | null>(null)
  const [colorFor, setColorFor] = useState<string | null>(null)
  const [adoFor, setAdoFor] = useState<string | null>(null)
  const [advancedFor, setAdvancedFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editValue, setEditValue] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)

  // Ferme les menus ··· et ＋ au clic extérieur.
  useEffect(() => {
    if (!menu && !addFor) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as HTMLElement
      if (!t.closest('.ctx-menu') && !t.closest('.menu-btn')) setMenu(null)
      if (!t.closest('.tab-new-menu') && !t.closest('.add-btn')) setAddFor(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu, addFor])

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
    if (item.kind === 'ado' && item.adoClosed) useHub.getState().setAdoClosed(item.id, false) // rouvre l'onglet fermé
    useHub.getState().setActiveItem(item.id)
    if (item.kind !== 'ado' && !item.tabId) await launch(item)
  }

  /** Crée un item Claude (avec ou sans paramètres libres) dans le groupe. */
  async function addClaude(group: Group, cwd: string, extraArgs?: string[]): Promise<void> {
    const tabId = await window.hub.newSession(cwd, extraArgs)
    useHub.getState().addItem(group.id, {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId, state: 'starting',
      agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'claude',
      ...(extraArgs && extraArgs.length ? { claudeArgs: extraArgs } : {})
    })
  }
  // ＋ du groupe : dossier par défaut du groupe → réglages → défaut système. N'ouvre jamais l'explorateur.
  async function addClaudeDefault(group: Group): Promise<void> {
    setAddFor(null)
    const cwd = group.defaultCwd ?? useHub.getState().globalDefaultCwd ?? (await window.hub.defaultCwd())
    if (cwd) addClaude(group, cwd)
  }
  async function addClaudePick(group: Group): Promise<void> {
    setAddFor(null)
    const cwd = await window.hub.pickFolder()
    if (cwd) addClaude(group, cwd)
  }
  async function onAdvanced(group: Group, command: string): Promise<void> {
    const cwd = group.defaultCwd ?? useHub.getState().globalDefaultCwd ?? (await window.hub.pickFolder())
    if (cwd) addClaude(group, cwd, parseClaudeArgs(command))
  }

  function addAdoItem(group: Group): void {
    setAddFor(null)
    if (!group.ado) { setAdoFor(group.id); return }
    const item: Item = {
      id: crypto.randomUUID(), name: `Board ${group.ado.project}`, cwd: '', pinned: false, tabId: null,
      state: 'done', agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'ado', ado: { view: 'tree', iterationPath: null }
    }
    useHub.getState().addItem(group.id, item)
  }

  async function addCmdItem(group: Group): Promise<void> {
    setAddFor(null)
    const cwd = group.defaultCwd ?? useHub.getState().globalDefaultCwd ?? (await window.hub.pickFolder())
    if (!cwd) return
    const tabId = await window.hub.newCmd(cwd)
    useHub.getState().addItem(group.id, {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId, state: 'active',
      agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'cmd'
    })
  }

  function addNoteItem(group: Group, root: string, rootKind: 'vault' | 'file'): void {
    useHub.getState().addItem(group.id, {
      id: crypto.randomUUID(), name: basename(root), cwd: '', pinned: false, tabId: null, state: 'done',
      agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'note', note: { root, rootKind, activePath: rootKind === 'file' ? root : null }
    })
  }
  async function addNoteFolder(group: Group): Promise<void> { setAddFor(null); const f = await window.hub.notesPickFolder(); if (f) addNoteItem(group, f, 'vault') }
  async function addNoteFile(group: Group): Promise<void> { setAddFor(null); const f = await window.hub.notesPickFile(); if (f) addNoteItem(group, f, 'file') }
  function addDefaultVault(group: Group): void { setAddFor(null); const v = readDefaultVault(); if (v) addNoteItem(group, v, 'vault') }

  async function setGroupDefault(groupId: string): Promise<void> {
    setMenu(null)
    const cwd = await window.hub.pickFolder()
    if (cwd) useHub.getState().setGroupDefaultCwd(groupId, cwd)
  }

  function addGroup(): void {
    const id = useHub.getState().addGroup('Nouveau groupe')
    startRename('group', id, 'Nouveau groupe') // édition inline immédiate
  }

  async function removeItem(item: Item): Promise<void> {
    setMenu(null)
    if (isBusy(item) && !(await confirm({ title: `Supprimer « ${item.name} » ?`, message: 'Une session est active.', confirmLabel: 'Supprimer', danger: true }))) return
    if (item.tabId) window.hub.killSession(item.tabId)
    useHub.getState().removeItem(item.id)
  }

  async function removeGroup(groupId: string, name: string): Promise<void> {
    setMenu(null)
    if (!(await confirm({ title: `Supprimer le groupe « ${name} » ?`, message: 'Ses sessions seront fermées.', confirmLabel: 'Supprimer', danger: true }))) return
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
          <div
            key={g.id}
            className={`group${g.id === activeGroupId ? ' active-group' : ''}${dragOverGroupId === g.id && dragGroupId && dragGroupId !== g.id ? ' drag-over-group' : ''}`}
            style={g.color ? ({ '--gc': g.color, '--gcd': darken(g.color), '--gt': textOn(g.color), '--gtd': textOn(darken(g.color)) } as React.CSSProperties) : undefined}
            onDragOver={(e) => { if (dragGroupId && dragGroupId !== g.id) { e.preventDefault(); setDragOverGroupId(g.id) } }}
            onDragLeave={(e) => { if (dragOverGroupId === g.id && !e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null) }}
            onDrop={(e) => { if (dragGroupId && dragGroupId !== g.id) { e.preventDefault(); useHub.getState().moveGroup(dragGroupId, g.id) } setDragGroupId(null); setDragOverGroupId(null) }}
          >
            <div
              className="group-head"
              draggable={!(editing && editing.kind === 'group' && editing.id === g.id)}
              onDragStart={(e) => { setMenu(null); setAddFor(null); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id); const id = g.id; setTimeout(() => setDragGroupId(id), 0) }}
              onDragEnd={() => { setDragGroupId(null); setDragOverGroupId(null) }}
              onContextMenu={(e) => { e.preventDefault(); setMenu(g.id) }}
            >
              <span className="group-chevron" onClick={() => useHub.getState().toggleGroupCollapsed(g.id)}>{g.collapsed ? '▸' : '▾'}</span>
              <span className="group-name-wrap" onClick={() => useHub.getState().setActiveGroup(g.id)}>{nameOrEditor('group', g.id, g.name, 'group-name')}</span>
              <span className="group-actions">
                <span className="ic-btn add-btn" title="Ajouter…" onClick={() => { setMenu(null); setAddFor(addFor === g.id ? null : g.id) }}>＋</span>
                <span className="ic-btn menu-btn" title="Menu" onClick={() => { setAddFor(null); setMenu(menu === g.id ? null : g.id) }}>···</span>
              </span>
              {addFor === g.id && (
                <div className="tab-new-menu">
                  <div onClick={() => addClaudeDefault(g)}><ClaudeIcon /> Claude par défaut</div>
                  <div onClick={() => addClaudePick(g)}><ClaudeIcon /> Claude (choisir un dossier…)</div>
                  <div onClick={() => { setAddFor(null); setAdvancedFor(g.id) }}><ClaudeIcon /> Claude avancé…</div>
                  <div onClick={() => addCmdItem(g)}><TerminalIcon /> Terminal</div>
                  <div onClick={() => addAdoItem(g)}><AzureIcon /> ADO – Azure</div>
                  {readDefaultVault() && <div onClick={() => addDefaultVault(g)}><NotesIcon /> Vault par défaut</div>}
                  <div onClick={() => addNoteFolder(g)}><NotesIcon /> Markdown : ouvrir un dossier…</div>
                  <div onClick={() => addNoteFile(g)}><NotesIcon /> Markdown : ouvrir un fichier…</div>
                </div>
              )}
              {menu === g.id && (
                <div className="ctx-menu">
                  <div onClick={() => startRename('group', g.id, g.name)}><EditIcon /> Renommer</div>
                  <div onClick={() => setGroupDefault(g.id)}><FolderIcon /> Dossier par défaut…</div>
                  <div onClick={() => { setMenu(null); setColorFor(g.id) }}><PaletteIcon /> Attribuer une couleur</div>
                  <div onClick={() => { setMenu(null); setAdoFor(g.id) }}><SettingsIcon size={12} /> Configurer ADO…</div>
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
                <span className="item-ic">{it.kind === 'ado' ? <AzureIcon /> : it.kind === 'cmd' ? <TerminalIcon /> : <ClaudeIcon />}</span>
                {nameOrEditor('item', it.id, it.name, 'item-name')}
                <span className="item-pin">{it.pinned && <PinIcon />}</span>
                <span className="item-state">{it.kind === 'ado' || it.kind === 'cmd' ? null : (it.tabId ? <StateDot state={it.state} /> : <span className="off">○</span>)}</span>
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
        {colorFor && (
          <GroupColorModal
            current={groups.find((x) => x.id === colorFor)?.color ?? null}
            onPick={(c) => useHub.getState().setGroupColor(colorFor, c)}
            onClose={() => setColorFor(null)}
          />
        )}
        {adoFor && (
          <AdoBindModal
            current={groups.find((x) => x.id === adoFor)?.ado ?? null}
            onApply={(ado) => { useHub.getState().setGroupAdo(adoFor, ado); setAdoFor(null) }}
            onClose={() => setAdoFor(null)}
          />
        )}
        {advancedFor && (
          <ClaudeAdvancedModal
            onLaunch={(cmd) => { const g = groups.find((x) => x.id === advancedFor); if (g) onAdvanced(g, cmd) }}
            onClose={() => setAdvancedFor(null)}
          />
        )}
      </div>
    </div>
  )
}
