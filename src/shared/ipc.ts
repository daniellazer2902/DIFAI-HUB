// Source de vérité unique des canaux IPC + types partagés main/preload/renderer.

export const IPC = {
  // renderer -> main
  SessionNew: 'session:new',
  SessionInput: 'session:input',
  SessionResize: 'session:resize',
  SessionKill: 'session:kill',
  PickFolder: 'dialog:pick-folder',
  DefaultCwd: 'session:default-cwd',
  SearchTranscript: 'transcript:search',
  LoadWorkspace: 'workspace:load',
  SaveWorkspace: 'workspace:save',
  // main -> renderer
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  SessionState: 'session:state',
  AgentAdded: 'agent:added',
  AgentLines: 'agent:lines',
  AgentDone: 'agent:done'
} as const

export type ConsoleLineKind = 'prompt' | 'text' | 'tool' | 'result'
export interface ConsoleLine {
  kind: ConsoleLineKind
  text: string
}

export type SessionState = 'starting' | 'active' | 'waiting' | 'done'

/** Un message du transcript contenant le terme recherché (texte entier + nb d'occurrences). */
export interface TranscriptMatch {
  role: 'user' | 'assistant'
  text: string
  count: number
}

/** Sous-ensemble persistable d'un item (config, sans état runtime de session). */
export interface PersistItem { id: string; name: string; cwd: string; split?: 1 | 2 }
export interface PersistGroup { id: string; name: string; collapsed: boolean; defaultCwd: string | null; items: PersistItem[] }
/** Arborescence persistée sur disque (groupes + items épinglés). */
export interface WorkspaceTree { activeGroupId: string | null; groups: PersistGroup[] }

/** Fonction de désabonnement renvoyée par tous les `on*` (évite les fuites de listeners). */
export type Unsub = () => void

/** Contrat exposé au renderer via contextBridge. Le preload l'implémente, le renderer le consomme. */
export interface HubApi {
  newSession(cwd: string): Promise<string>
  sendInput(tabId: string, data: string): void
  resize(tabId: string, cols: number, rows: number): void
  killSession(tabId: string): void
  pickFolder(): Promise<string | null>
  defaultCwd(): Promise<string>
  searchTranscript(tabId: string, query: string): Promise<TranscriptMatch[]>
  loadWorkspace(): Promise<WorkspaceTree>
  saveWorkspace(tree: WorkspaceTree): void
  onData(cb: (tabId: string, data: string) => void): Unsub
  onExit(cb: (tabId: string, code: number) => void): Unsub
  onSessionState(cb: (tabId: string, state: SessionState) => void): Unsub
  onAgentAdded(cb: (tabId: string, agentId: string, agentType: string, description: string) => void): Unsub
  onAgentLines(cb: (tabId: string, agentId: string, lines: ConsoleLine[]) => void): Unsub
  onAgentDone(cb: (tabId: string, agentId: string) => void): Unsub
}
