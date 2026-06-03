import { create } from 'zustand'
import type { ConsoleLine, SessionState } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
  done: boolean
}

export interface TabState {
  id: string
  title: string
  cwd: string
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  railCollapsed: boolean
}

interface HubState {
  tabs: TabState[]
  activeTabId: string | null
  soundEnabled: boolean
  consoleWidth: number
  addTab: (tab: TabState) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setTabState: (id: string, state: SessionState) => void
  addAgent: (id: string, agent: AgentView) => void
  appendLines: (id: string, agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (id: string, agentId: string) => void
  setAgentDone: (id: string, agentId: string) => void
  openAgent: (id: string, agentId: string | null) => void
  toggleRail: (id: string) => void
  setSoundEnabled: (v: boolean) => void
  setConsoleWidth: (w: number) => void
  reset: () => void
}

const initial = {
  tabs: [] as TabState[],
  activeTabId: null as string | null,
  soundEnabled: true,
  consoleWidth: 380
}

function patch(tabs: TabState[], id: string, fn: (t: TabState) => TabState): TabState[] {
  return tabs.map((t) => (t.id === id ? fn(t) : t))
}

export const useHub = create<HubState>((set) => ({
  ...initial,
  addTab: (tab) =>
    set((s) => (s.tabs.some((t) => t.id === tab.id) ? s : { tabs: [...s.tabs, tab], activeTabId: tab.id })),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId =
        s.activeTabId === id ? (tabs.length ? tabs[tabs.length - 1].id : null) : s.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (activeTabId) => set({ activeTabId }),
  setTabState: (id, state) => set((s) => ({ tabs: patch(s.tabs, id, (t) => ({ ...t, state })) })),
  addAgent: (id, agent) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) =>
        t.agents.some((a) => a.id === agent.id) ? t : { ...t, agents: [...t.agents, agent] }
      )
    })),
  appendLines: (id, agentId, lines) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) => ({
        ...t,
        agents: t.agents.map((a) => (a.id === agentId ? { ...a, lines: [...a.lines, ...lines] } : a))
      }))
    })),
  removeAgent: (id, agentId) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) => ({
        ...t,
        agents: t.agents.filter((a) => a.id !== agentId),
        openAgentId: t.openAgentId === agentId ? null : t.openAgentId
      }))
    })),
  setAgentDone: (id, agentId) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) => ({
        ...t,
        agents: t.agents.map((a) => (a.id === agentId ? { ...a, done: true } : a))
      }))
    })),
  openAgent: (id, agentId) => set((s) => ({ tabs: patch(s.tabs, id, (t) => ({ ...t, openAgentId: agentId })) })),
  toggleRail: (id) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) => {
        const railCollapsed = !t.railCollapsed
        return { ...t, railCollapsed, openAgentId: railCollapsed ? null : t.openAgentId }
      })
    })),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setConsoleWidth: (consoleWidth) => set({ consoleWidth }),
  reset: () => set({ ...initial })
}))
