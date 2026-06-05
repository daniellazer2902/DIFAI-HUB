// Source de vérité unique des canaux IPC + types partagés main/preload/renderer.

export const IPC = {
  // renderer -> main
  SessionNew: 'session:new',
  CmdNew: 'cmd:new',
  SessionInput: 'session:input',
  SessionResize: 'session:resize',
  SessionKill: 'session:kill',
  PickFolder: 'dialog:pick-folder',
  DefaultCwd: 'session:default-cwd',
  SearchTranscript: 'transcript:search',
  LoadWorkspace: 'workspace:load',
  SaveWorkspace: 'workspace:save',
  CloseConfirm: 'app:close-confirm',
  // ADO (renderer -> main)
  AdoConnList: 'ado:conn-list',
  AdoConnUpsert: 'ado:conn-upsert',
  AdoConnDelete: 'ado:conn-delete',
  AdoConnTest: 'ado:conn-test',
  AdoListProjects: 'ado:list-projects',
  AdoListTeams: 'ado:list-teams',
  AdoListIterations: 'ado:list-iterations',
  AdoListBoard: 'ado:list-board',
  AdoGetChildren: 'ado:get-children',
  // main -> renderer
  CloseRequest: 'app:close-request',
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
export interface PersistItem { id: string; name: string; cwd: string; split?: 1 | 2; kind?: 'claude' | 'ado' | 'cmd'; ado?: { view: 'tree' | 'board'; iterationPath: string | null } }
export interface PersistGroup { id: string; name: string; collapsed: boolean; defaultCwd: string | null; color?: string | null; ado?: { connId: string; project: string; team: string | null } | null; items: PersistItem[] }
/** Arborescence persistée sur disque (groupes + items épinglés). */
export interface WorkspaceTree { activeGroupId: string | null; groups: PersistGroup[] }

// --- ADO (lot 4) ---
export interface AdoConnection {
  id: string
  label: string
  baseUrl: string // cloud: https://dev.azure.com/{org} | on-prem: https://serveur/tfs/{collection}
}
export interface AdoProject { id: string; name: string }
export interface AdoTeam { id: string; name: string }
export interface AdoIteration { id: string; name: string; path: string; current: boolean }
export interface AdoWorkItem {
  id: number
  type: string            // System.WorkItemType (User Story, Task, Bug…)
  title: string
  state: string           // System.State
  assignedTo: string | null
  parentId: number | null
  childCount: number
}
/** Board d'un sprint : colonnes (états du process) + US, chacune avec ses tâches. */
export interface AdoBoard {
  states: string[]                 // ordre des colonnes
  stories: AdoWorkItem[]           // cards (User Stories)
  tasksByParent: Record<number, AdoWorkItem[]>
}
export interface AdoError { ok: false; error: string; status?: number }
export type AdoResponse<T> = { ok: true; data: T } | AdoError

/** Fonction de désabonnement renvoyée par tous les `on*` (évite les fuites de listeners). */
export type Unsub = () => void

/** Contrat exposé au renderer via contextBridge. Le preload l'implémente, le renderer le consomme. */
export interface HubApi {
  newSession(cwd: string, extraArgs?: string[]): Promise<string>
  newCmd(cwd: string): Promise<string>
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
  onCloseRequest(cb: () => void): Unsub
  confirmClose(): void
  adoConnList(): Promise<AdoConnection[]>
  adoConnUpsert(conn: AdoConnection, pat?: string): Promise<void>
  adoConnDelete(id: string): Promise<void>
  adoConnTest(id: string): Promise<AdoResponse<true>>
  adoListProjects(connId: string): Promise<AdoResponse<AdoProject[]>>
  adoListTeams(connId: string, project: string): Promise<AdoResponse<AdoTeam[]>>
  adoListIterations(connId: string, project: string, team?: string): Promise<AdoResponse<AdoIteration[]>>
  adoListBoard(p: { connId: string; project: string; team?: string; iterationPath?: string }): Promise<AdoResponse<AdoBoard>>
  adoGetChildren(connId: string, parentId: number): Promise<AdoResponse<AdoWorkItem[]>>
}
