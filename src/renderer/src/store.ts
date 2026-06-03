import { create } from 'zustand'
import type { ConsoleLine, SessionState, WorkspaceTree } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
  done: boolean
}

export interface Item {
  id: string
  name: string
  cwd: string
  pinned: boolean
  tabId: string | null
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  railCollapsed: boolean
  searchOpen: boolean
  searchQuery: string
}

export interface Group {
  id: string
  name: string
  collapsed: boolean
  defaultCwd: string | null
  items: Item[]
}

interface HubState {
  groups: Group[]
  activeGroupId: string | null
  activeItemId: string | null
  soundEnabled: boolean
  consoleWidth: number

  itemById: (itemId: string) => Item | undefined
  itemByTab: (tabId: string) => Item | undefined

  addGroup: (name: string) => string
  renameGroup: (groupId: string, name: string) => void
  removeGroup: (groupId: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  setGroupDefaultCwd: (groupId: string, cwd: string) => void
  setActiveGroup: (groupId: string) => void

  addItem: (groupId: string, item: Item) => void
  removeItem: (itemId: string) => void
  renameItem: (itemId: string, name: string) => void
  togglePin: (itemId: string) => void
  setActiveItem: (itemId: string) => void
  moveItem: (itemId: string, toIndex: number, toGroupId?: string) => void

  bindSession: (itemId: string, tabId: string) => void
  clearSession: (itemId: string) => void
  closeSession: (itemId: string) => void

  setItemState: (tabId: string, state: SessionState) => void
  addAgent: (tabId: string, agent: AgentView) => void
  appendLines: (tabId: string, agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (tabId: string, agentId: string) => void
  setAgentDone: (tabId: string, agentId: string) => void
  openAgent: (itemId: string, agentId: string | null) => void
  toggleRail: (itemId: string) => void
  setSearch: (itemId: string, open: boolean) => void
  toggleSearch: (itemId: string) => void
  setSearchQuery: (itemId: string, query: string) => void

  setSoundEnabled: (v: boolean) => void
  setConsoleWidth: (w: number) => void
  toPersistable: () => WorkspaceTree
  loadWorkspace: (tree: WorkspaceTree) => void
  reset: () => void
}

let counter = 0
function uid(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

const initial = {
  groups: [] as Group[],
  activeGroupId: null as string | null,
  activeItemId: null as string | null,
  soundEnabled: true,
  consoleWidth: 380
}

function mapItems(groups: Group[], match: (i: Item) => boolean, fn: (i: Item) => Item): Group[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => (match(i) ? fn(i) : i)) }))
}

export const useHub = create<HubState>((set, get) => ({
  ...initial,

  itemById: (itemId) => get().groups.flatMap((g) => g.items).find((i) => i.id === itemId),
  itemByTab: (tabId) => get().groups.flatMap((g) => g.items).find((i) => i.tabId === tabId),

  addGroup: (name) => {
    const id = uid('g')
    set((s) => ({ groups: [...s.groups, { id, name, collapsed: false, defaultCwd: null, items: [] }], activeGroupId: id }))
    return id
  },
  renameGroup: (groupId, name) =>
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) })),
  removeGroup: (groupId) =>
    set((s) => {
      const groups = s.groups.filter((g) => g.id !== groupId)
      const activeGroupId = s.activeGroupId === groupId ? (groups[groups.length - 1]?.id ?? null) : s.activeGroupId
      return { groups, activeGroupId }
    }),
  toggleGroupCollapsed: (groupId) =>
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)) })),
  setGroupDefaultCwd: (groupId, cwd) =>
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, defaultCwd: cwd } : g)) })),
  setActiveGroup: (activeGroupId) => set({ activeGroupId }),

  addItem: (groupId, item) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, items: [...g.items, item] } : g)),
      activeGroupId: groupId,
      activeItemId: item.id
    })),
  removeItem: (itemId) =>
    set((s) => {
      const groups = s.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) }))
      const activeItemId = s.activeItemId === itemId ? null : s.activeItemId
      return { groups, activeItemId }
    }),
  renameItem: (itemId, name) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, name })) })),
  togglePin: (itemId) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, pinned: !i.pinned })) })),
  setActiveItem: (itemId) =>
    set((s) => {
      const g = s.groups.find((grp) => grp.items.some((i) => i.id === itemId))
      return { activeItemId: itemId, activeGroupId: g ? g.id : s.activeGroupId }
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
      return { groups }
    }),

  bindSession: (itemId, tabId) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, tabId, state: 'starting' })) })),
  clearSession: (itemId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({
        ...i, tabId: null, state: 'done', agents: [], openAgentId: null, searchOpen: false
      }))
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
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) =>
        i.agents.some((a) => a.id === agent.id) ? i : { ...i, agents: [...i.agents, agent] })
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
  openAgent: (itemId, agentId) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, openAgentId: agentId, searchOpen: agentId ? false : i.searchOpen })) })),
  toggleRail: (itemId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.id === itemId, (i) => {
        const railCollapsed = !i.railCollapsed
        return { ...i, railCollapsed, openAgentId: railCollapsed ? null : i.openAgentId }
      })
    })),
  setSearch: (itemId, open) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, searchOpen: open, openAgentId: open ? null : i.openAgentId })) })),
  toggleSearch: (itemId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.id === itemId, (i) => {
        const searchOpen = !i.searchOpen
        return { ...i, searchOpen, openAgentId: searchOpen ? null : i.openAgentId }
      })
    })),
  setSearchQuery: (itemId, searchQuery) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, searchQuery })) })),

  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setConsoleWidth: (consoleWidth) => set({ consoleWidth }),

  toPersistable: () => {
    const s = get()
    return {
      activeGroupId: s.activeGroupId,
      groups: s.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd,
        items: g.items.filter((i) => i.pinned).map((i) => ({ id: i.id, name: i.name, cwd: i.cwd }))
      }))
    }
  },
  loadWorkspace: (tree) =>
    set({
      activeGroupId: tree.activeGroupId,
      activeItemId: null,
      groups: tree.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd ?? null,
        items: g.items.map((i) => ({
          id: i.id, name: i.name, cwd: i.cwd, pinned: true, tabId: null,
          state: 'done', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: ''
        }))
      }))
    }),
  reset: () => set({ ...initial })
}))
