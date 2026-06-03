// Source de vérité unique des canaux IPC + types partagés main/preload/renderer.

export const IPC = {
  // renderer -> main
  SessionNew: 'session:new',
  SessionInput: 'session:input',
  SessionResize: 'session:resize',
  SessionKill: 'session:kill',
  // main -> renderer
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  SessionState: 'session:state',
  AgentAdded: 'agent:added',
  AgentLines: 'agent:lines'
} as const

export type ConsoleLineKind = 'prompt' | 'text' | 'tool' | 'result'
export interface ConsoleLine {
  kind: ConsoleLineKind
  text: string
}

export type SessionState = 'starting' | 'active' | 'waiting' | 'done'

/** Fonction de désabonnement renvoyée par tous les `on*` (évite les fuites de listeners). */
export type Unsub = () => void

/** Contrat exposé au renderer via contextBridge. Le preload l'implémente, le renderer le consomme. */
export interface HubApi {
  newSession(cwd: string): Promise<string>
  sendInput(tabId: string, data: string): void
  resize(tabId: string, cols: number, rows: number): void
  killSession(tabId: string): void
  onData(cb: (tabId: string, data: string) => void): Unsub
  onExit(cb: (tabId: string, code: number) => void): Unsub
  onSessionState(cb: (tabId: string, state: SessionState) => void): Unsub
  onAgentAdded(cb: (tabId: string, agentId: string, agentType: string, description: string) => void): Unsub
  onAgentLines(cb: (tabId: string, agentId: string, lines: ConsoleLine[]) => void): Unsub
}
