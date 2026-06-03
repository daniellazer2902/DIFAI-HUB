import { create } from 'zustand'
import type { ConsoleLine, SessionState } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
}

interface HubState {
  tabId: string | null
  sessionState: SessionState
  agents: AgentView[]
  openAgentId: string | null
  setTab: (tabId: string) => void
  setSessionState: (state: SessionState) => void
  addAgent: (agent: AgentView) => void
  appendLines: (agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (agentId: string) => void
  openAgent: (agentId: string | null) => void
  reset: () => void
}

const initial = {
  tabId: null as string | null,
  sessionState: 'starting' as SessionState,
  agents: [] as AgentView[],
  openAgentId: null as string | null
}

export const useHub = create<HubState>((set) => ({
  ...initial,
  setTab: (tabId) => set({ tabId }),
  setSessionState: (sessionState) => set({ sessionState }),
  addAgent: (agent) =>
    set((s) => (s.agents.some((a) => a.id === agent.id) ? s : { agents: [...s.agents, agent] })),
  appendLines: (agentId, lines) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, lines: [...a.lines, ...lines] } : a))
    })),
  removeAgent: (agentId) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== agentId),
      openAgentId: s.openAgentId === agentId ? null : s.openAgentId
    })),
  openAgent: (openAgentId) => set({ openAgentId }),
  reset: () => set({ ...initial })
}))
