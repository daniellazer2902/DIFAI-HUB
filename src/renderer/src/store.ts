import { create } from 'zustand'
import type { ConsoleLine, SessionState, WorkspaceTree } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
  done: boolean
}

export type Pane = 'left' | 'right'
export type TabKind = 'session' | 'find' | 'agents' | 'ado'

export interface AdoView { view: 'tree' | 'board'; iterationPath: string | null }
export interface GroupAdo { connId: string; project: string; team: string | null }

export interface Item {
  id: string
  name: string
  cwd: string
  pinned: boolean
  tabId: string | null
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  split: 1 | 2
  findOpen: boolean
  agentsOpen: boolean
  searchQuery: string
  kind: 'claude' | 'ado'
  ado?: AdoView
}

export interface Group {
  id: string
  name: string
  collapsed: boolean
  defaultCwd: string | null
  items: Item[]
  leftActiveTab: string | null
  rightActiveTab: string | null
  color: string | null
  ado: GroupAdo | null
}

export interface PaneTab { ref: string; kind: TabKind; item: Item }

interface HubState {
  groups: Group[]
  activeGroupId: string | null
  activeItemId: string | null
  focusedPane: Pane
  soundEnabled: boolean
  consoleWidth: number
  confirmOnClose: boolean
  globalDefaultCwd: string | null

  itemById: (itemId: string) => Item | undefined
  itemByTab: (tabId: string) => Item | undefined

  addGroup: (name: string) => string
  renameGroup: (groupId: string, name: string) => void
  removeGroup: (groupId: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  setGroupDefaultCwd: (groupId: string, cwd: string) => void
  setGroupColor: (groupId: string, color: string | null) => void
  setActiveGroup: (groupId: string) => void

  addItem: (groupId: string, item: Item) => void
  removeItem: (itemId: string) => void
  renameItem: (itemId: string, name: string) => void
  togglePin: (itemId: string) => void
  setActiveItem: (itemId: string) => void
  moveItem: (itemId: string, toIndex: number, toGroupId?: string) => void
  setSplit: (itemId: string, split: 1 | 2) => void
  setGroupAdo: (groupId: string, ado: GroupAdo | null) => void
  setAdoView: (itemId: string, view: 'tree' | 'board') => void
  setAdoIteration: (itemId: string, iterationPath: string | null) => void

  bindSession: (itemId: string, tabId: string) => void
  clearSession: (itemId: string) => void
  closeSession: (itemId: string) => void

  setItemState: (tabId: string, state: SessionState) => void
  addAgent: (tabId: string, agent: AgentView) => void
  appendLines: (tabId: string, agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (tabId: string, agentId: string) => void
  setAgentDone: (tabId: string, agentId: string) => void
  openAgent: (itemId: string, agentId: string | null) => void

  toggleFind: (itemId: string) => void
  closeFind: (itemId: string) => void
  openAgentsTab: (itemId: string) => void
  closeAgentsTab: (itemId: string) => void
  selectTab: (pane: Pane, ref: string) => void
  setFocusedPane: (pane: Pane) => void
  setSearchQuery: (itemId: string, query: string) => void
  leftTabs: () => PaneTab[]
  rightTabs: () => PaneTab[]

  setSoundEnabled: (v: boolean) => void
  setConsoleWidth: (w: number) => void
  setConfirmOnClose: (v: boolean) => void
  setGlobalDefaultCwd: (v: string | null) => void
  toPersistable: () => WorkspaceTree
  loadWorkspace: (tree: WorkspaceTree) => void
  reset: () => void
}

let counter = 0
function uid(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

const KIND_PREFIX: Record<TabKind, string> = { session: 's', find: 'f', agents: 'a', ado: 'd' }
export function tabRef(kind: TabKind, itemId: string): string {
  return `${KIND_PREFIX[kind]}:${itemId}`
}
export function parseRef(ref: string): { kind: TabKind; itemId: string } {
  const i = ref.indexOf(':')
  if (i < 0) return { kind: 'session', itemId: ref }
  const p = ref.slice(0, i)
  const itemId = ref.slice(i + 1)
  const kind: TabKind = p === 's' ? 'session' : p === 'f' ? 'find' : p === 'a' ? 'agents' : p === 'd' ? 'ado' : 'session'
  return { kind, itemId }
}

/** Volet opposé à celui de la session (Find/Agents s'y ouvrent → split garanti). */
function auxPaneOf(split: 1 | 2): Pane {
  return split === 1 ? 'right' : 'left'
}

/** Refs ordonnés des onglets d'un volet : sessions de ce volet + auxiliaires des sessions du volet OPPOSÉ. */
function paneRefs(group: Group, pane: Pane): string[] {
  const refs: string[] = []
  const sessionSplit = pane === 'left' ? 1 : 2
  const auxOwnerSplit = pane === 'left' ? 2 : 1
  for (const i of group.items) {
    if (i.split === sessionSplit) {
      if (i.kind === 'ado') refs.push(tabRef('ado', i.id))
      else if (i.tabId) refs.push(tabRef('session', i.id))
    }
    if (i.split === auxOwnerSplit && i.findOpen) refs.push(tabRef('find', i.id))
    if (i.split === auxOwnerSplit && i.agentsOpen) refs.push(tabRef('agents', i.id))
  }
  return refs
}

/** Recale leftActiveTab/rightActiveTab sur des onglets existants (ou null/premier). */
function normalizeGroup(g: Group): Group {
  const left = paneRefs(g, 'left')
  const right = paneRefs(g, 'right')
  const leftActiveTab = g.leftActiveTab && left.includes(g.leftActiveTab) ? g.leftActiveTab : (left[0] ?? null)
  const rightActiveTab = g.rightActiveTab && right.includes(g.rightActiveTab) ? g.rightActiveTab : (right[0] ?? null)
  return { ...g, leftActiveTab, rightActiveTab }
}
function normalizeAll(groups: Group[]): Group[] {
  return groups.map(normalizeGroup)
}
export function paneTabs(group: Group, pane: Pane): PaneTab[] {
  return paneRefs(group, pane).map((ref) => {
    const { kind, itemId } = parseRef(ref)
    return { ref, kind, item: group.items.find((i) => i.id === itemId) as Item }
  })
}

const initial = {
  groups: [] as Group[],
  activeGroupId: null as string | null,
  activeItemId: null as string | null,
  focusedPane: 'left' as Pane,
  soundEnabled: true,
  consoleWidth: 380,
  confirmOnClose: true,
  globalDefaultCwd: null as string | null
}

function mapItems(groups: Group[], match: (i: Item) => boolean, fn: (i: Item) => Item): Group[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => (match(i) ? fn(i) : i)) }))
}
function setPaneActive(groups: Group[], itemId: string, pane: Pane, ref: string): Group[] {
  return groups.map((g) =>
    g.items.some((i) => i.id === itemId)
      ? pane === 'left'
        ? { ...g, leftActiveTab: ref }
        : { ...g, rightActiveTab: ref }
      : g
  )
}

export const useHub = create<HubState>((set, get) => ({
  ...initial,

  itemById: (itemId) => get().groups.flatMap((g) => g.items).find((i) => i.id === itemId),
  itemByTab: (tabId) => get().groups.flatMap((g) => g.items).find((i) => i.tabId === tabId),

  addGroup: (name) => {
    const id = uid('g')
    set((s) => ({
      groups: [...s.groups, { id, name, collapsed: false, defaultCwd: null, color: null, ado: null, items: [], leftActiveTab: null, rightActiveTab: null }],
      activeGroupId: id
    }))
    return id
  },
  renameGroup: (groupId, name) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) })),
  removeGroup: (groupId) =>
    set((s) => {
      const groups = s.groups.filter((g) => g.id !== groupId)
      const activeGroupId = s.activeGroupId === groupId ? (groups[groups.length - 1]?.id ?? null) : s.activeGroupId
      return { groups, activeGroupId }
    }),
  toggleGroupCollapsed: (groupId) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)) })),
  setGroupDefaultCwd: (groupId, cwd) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, defaultCwd: cwd } : g)) })),
  setGroupColor: (groupId, color) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, color } : g)) })),
  setGroupAdo: (groupId, ado) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, ado } : g)) })),
  setAdoView: (itemId, view) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, ado: { view, iterationPath: i.ado?.iterationPath ?? null } })) })),
  setAdoIteration: (itemId, iterationPath) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, ado: { view: i.ado?.view ?? 'tree', iterationPath } })) })),
  setActiveGroup: (groupId) =>
    set((s) => {
      const g = s.groups.find((x) => x.id === groupId)
      if (!g) return { activeGroupId: groupId }
      // Recale le contexte sur le groupe : volet focus = gauche s'il a des onglets, sinon droite.
      const pane: Pane = paneRefs(g, 'left').length > 0 ? 'left' : 'right'
      const ref = pane === 'left' ? g.leftActiveTab : g.rightActiveTab
      return { activeGroupId: groupId, focusedPane: pane, activeItemId: ref ? parseRef(ref).itemId : s.activeItemId }
    }),

  addItem: (groupId, item) =>
    set((s) => {
      const pane: Pane = item.split === 2 ? 'right' : 'left'
      const ref = item.kind === 'ado' ? tabRef('ado', item.id) : tabRef('session', item.id)
      const groups = s.groups.map((g) => {
        if (g.id !== groupId) return g
        const ng = { ...g, items: [...g.items, item] }
        return pane === 'left' ? { ...ng, leftActiveTab: ref } : { ...ng, rightActiveTab: ref }
      })
      return { groups: normalizeAll(groups), activeGroupId: groupId, activeItemId: item.id, focusedPane: pane }
    }),
  removeItem: (itemId) =>
    set((s) => {
      const groups = normalizeAll(s.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) })))
      return { groups, activeItemId: s.activeItemId === itemId ? null : s.activeItemId }
    }),
  renameItem: (itemId, name) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, name })) })),
  togglePin: (itemId) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, pinned: !i.pinned })) })),
  setActiveItem: (itemId) =>
    set((s) => {
      const g = s.groups.find((grp) => grp.items.some((i) => i.id === itemId))
      if (!g) return { activeItemId: itemId }
      const item = g.items.find((i) => i.id === itemId) as Item
      const pane: Pane = item.split === 2 ? 'right' : 'left'
      const ref = item.kind === 'ado' ? tabRef('ado', itemId) : tabRef('session', itemId)
      const groups = setPaneActive(s.groups, itemId, pane, ref)
      return { activeItemId: itemId, activeGroupId: g.id, focusedPane: pane, groups }
    }),
  moveItem: (itemId, toIndex, toGroupId) =>
    set((s) => {
      let moved: Item | undefined
      const sourceGroup = s.groups.find((g) => g.items.some((i) => i.id === itemId))
      const stripped = s.groups.map((g) => {
        const found = g.items.find((i) => i.id === itemId)
        if (found) moved = found
        return { ...g, items: g.items.filter((i) => i.id !== itemId) }
      })
      if (!moved || !sourceGroup) return s
      const targetId = toGroupId ?? sourceGroup.id
      const groups = stripped.map((g) => {
        if (g.id !== targetId) return g
        const items = [...g.items]
        items.splice(Math.max(0, Math.min(toIndex, items.length)), 0, moved as Item)
        return { ...g, items }
      })
      return { groups: normalizeAll(groups) }
    }),
  setSplit: (itemId, split) =>
    set((s) => {
      const moved = mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, split }))
      const groups = setPaneActive(moved, itemId, split === 2 ? 'right' : 'left', tabRef('session', itemId))
      return { groups: normalizeAll(groups), focusedPane: split === 2 ? 'right' : 'left', activeItemId: itemId }
    }),

  bindSession: (itemId, tabId) =>
    set((s) => ({ groups: normalizeAll(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, tabId, state: 'starting' }))) })),
  clearSession: (itemId) =>
    set((s) => ({
      groups: normalizeAll(
        mapItems(s.groups, (i) => i.id === itemId, (i) => ({
          ...i, tabId: null, state: 'done', agents: [], openAgentId: null, findOpen: false, agentsOpen: false
        }))
      )
    })),
  closeSession: (itemId) => {
    const item = get().itemById(itemId)
    if (!item) return
    if (item.pinned) get().clearSession(itemId)
    else get().removeItem(itemId)
  },

  setItemState: (tabId, state) => set((s) => ({ groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({ ...i, state })) })),
  addAgent: (tabId, agent) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => (i.agents.some((a) => a.id === agent.id) ? i : { ...i, agents: [...i.agents, agent] }))
    })),
  appendLines: (tabId, agentId, lines) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({
        ...i, agents: i.agents.map((a) => (a.id === agentId ? { ...a, lines: [...a.lines, ...lines] } : a))
      }))
    })),
  removeAgent: (tabId, agentId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({
        ...i, agents: i.agents.filter((a) => a.id !== agentId), openAgentId: i.openAgentId === agentId ? null : i.openAgentId
      }))
    })),
  setAgentDone: (tabId, agentId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({
        ...i, agents: i.agents.map((a) => (a.id === agentId ? { ...a, done: true } : a))
      }))
    })),
  openAgent: (itemId, agentId) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, openAgentId: agentId })) })),

  toggleFind: (itemId) =>
    set((s) => {
      const item = s.groups.flatMap((g) => g.items).find((i) => i.id === itemId)
      if (!item) return s
      const open = !item.findOpen
      const auxPane = auxPaneOf(item.split)
      let groups = mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, findOpen: open }))
      if (open) groups = setPaneActive(groups, itemId, auxPane, tabRef('find', itemId))
      return { groups: normalizeAll(groups), focusedPane: open ? auxPane : s.focusedPane }
    }),
  closeFind: (itemId) => set((s) => ({ groups: normalizeAll(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, findOpen: false }))) })),
  openAgentsTab: (itemId) =>
    set((s) => {
      const item = s.groups.flatMap((g) => g.items).find((i) => i.id === itemId)
      if (!item) return s
      const auxPane = auxPaneOf(item.split)
      const groups = setPaneActive(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, agentsOpen: true })), itemId, auxPane, tabRef('agents', itemId))
      return { groups: normalizeAll(groups), focusedPane: auxPane }
    }),
  closeAgentsTab: (itemId) => set((s) => ({ groups: normalizeAll(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, agentsOpen: false }))) })),
  selectTab: (pane, ref) =>
    set((s) => {
      const { itemId } = parseRef(ref)
      return { groups: setPaneActive(s.groups, itemId, pane, ref), focusedPane: pane, activeItemId: itemId }
    }),
  setFocusedPane: (focusedPane) => set({ focusedPane }),
  setSearchQuery: (itemId, searchQuery) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, searchQuery })) })),
  leftTabs: () => {
    const g = get().groups.find((x) => x.id === get().activeGroupId)
    return g ? paneTabs(g, 'left') : []
  },
  rightTabs: () => {
    const g = get().groups.find((x) => x.id === get().activeGroupId)
    return g ? paneTabs(g, 'right') : []
  },

  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setConsoleWidth: (consoleWidth) => set({ consoleWidth }),
  setConfirmOnClose: (confirmOnClose) => set({ confirmOnClose }),
  setGlobalDefaultCwd: (globalDefaultCwd) => set({ globalDefaultCwd }),

  toPersistable: () => {
    const s = get()
    return {
      activeGroupId: s.activeGroupId,
      groups: s.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd, color: g.color,
        items: g.items.filter((i) => i.pinned).map((i) => ({ id: i.id, name: i.name, cwd: i.cwd, split: i.split }))
      }))
    }
  },
  loadWorkspace: (tree) =>
    set({
      activeGroupId: tree.activeGroupId,
      activeItemId: null,
      focusedPane: 'left',
      groups: normalizeAll(
        tree.groups.map((g) => ({
          id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd ?? null, color: g.color ?? null, ado: null, leftActiveTab: null, rightActiveTab: null,
          items: g.items.map((i) => ({
            id: i.id, name: i.name, cwd: i.cwd, pinned: true, tabId: null, state: 'done', agents: [], openAgentId: null,
            split: i.split ?? 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'claude'
          }))
        }))
      )
    }),
  reset: () => set({ ...initial })
}))
