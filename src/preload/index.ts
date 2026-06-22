import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type HubApi, type Unsub, type SessionState, type ConsoleLine, type WorkspaceTree } from '../shared/ipc'

/** Abonne un canal et renvoie un désabonnement (retire le bon listener). */
function on(channel: string, handler: (...args: unknown[]) => void): Unsub {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => handler(...args)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const hub: HubApi = {
  newSession: (cwd, extraArgs) => ipcRenderer.invoke(IPC.SessionNew, cwd, extraArgs),
  newCmd: (cwd) => ipcRenderer.invoke(IPC.CmdNew, cwd),
  sendInput: (tabId, data) => ipcRenderer.send(IPC.SessionInput, tabId, data),
  resize: (tabId, cols, rows) => ipcRenderer.send(IPC.SessionResize, tabId, cols, rows),
  killSession: (tabId) => ipcRenderer.send(IPC.SessionKill, tabId),
  pickFolder: () => ipcRenderer.invoke(IPC.PickFolder),
  openPath: (path) => ipcRenderer.send(IPC.OpenPath, path),
  defaultCwd: () => ipcRenderer.invoke(IPC.DefaultCwd),
  searchTranscript: (tabId, query) => ipcRenderer.invoke(IPC.SearchTranscript, tabId, query),
  loadWorkspace: () => ipcRenderer.invoke(IPC.LoadWorkspace),
  saveWorkspace: (tree) => ipcRenderer.send(IPC.SaveWorkspace, tree),
  onData: (cb) => on(IPC.PtyData, (tabId, data) => cb(tabId as string, data as string)),
  onExit: (cb) => on(IPC.PtyExit, (tabId, code) => cb(tabId as string, code as number)),
  onSessionState: (cb) => on(IPC.SessionState, (tabId, state) => cb(tabId as string, state as SessionState)),
  onAgentAdded: (cb) =>
    on(IPC.AgentAdded, (tabId, agentId, type, desc, kind) =>
      cb(tabId as string, agentId as string, type as string, desc as string, (kind as 'agent' | 'shell') ?? 'agent')),
  onAgentLines: (cb) =>
    on(IPC.AgentLines, (tabId, agentId, lines) => cb(tabId as string, agentId as string, lines as ConsoleLine[])),
  onAgentDone: (cb) => on(IPC.AgentDone, (tabId, agentId, failed) => cb(tabId as string, agentId as string, Boolean(failed))),
  onCloseRequest: (cb) => on(IPC.CloseRequest, () => cb()),
  confirmClose: () => ipcRenderer.send(IPC.CloseConfirm),
  adoConnList: () => ipcRenderer.invoke(IPC.AdoConnList),
  adoConnUpsert: (conn, pat) => ipcRenderer.invoke(IPC.AdoConnUpsert, conn, pat),
  adoConnDelete: (id) => ipcRenderer.invoke(IPC.AdoConnDelete, id),
  adoConnTest: (id) => ipcRenderer.invoke(IPC.AdoConnTest, id),
  adoListProjects: (id) => ipcRenderer.invoke(IPC.AdoListProjects, id),
  adoListTeams: (id, project) => ipcRenderer.invoke(IPC.AdoListTeams, id, project),
  adoListIterations: (id, project, team) => ipcRenderer.invoke(IPC.AdoListIterations, id, project, team),
  adoListBoard: (p) => ipcRenderer.invoke(IPC.AdoListBoard, p),
  adoGetChildren: (id, parentId) => ipcRenderer.invoke(IPC.AdoGetChildren, id, parentId),
  adoGetDetail: (connId, project, id) => ipcRenderer.invoke(IPC.AdoGetDetail, connId, project, id),
  notesPickFolder: () => ipcRenderer.invoke(IPC.NotesPickFolder),
  notesPickFile: () => ipcRenderer.invoke(IPC.NotesPickFile),
  notesTree: (root) => ipcRenderer.invoke(IPC.NotesTree, root),
  notesRead: (root, path) => ipcRenderer.invoke(IPC.NotesRead, root, path),
  notesAsset: (root, path) => ipcRenderer.invoke(IPC.NotesAsset, root, path),
  notesOpenExternal: (url) => ipcRenderer.send(IPC.NotesOpenExternal, url),
  notesWatch: (itemId, root) => ipcRenderer.send(IPC.NotesWatch, itemId, root),
  notesUnwatch: (itemId) => ipcRenderer.send(IPC.NotesUnwatch, itemId),
  notesResolveFile: (cwd, token) => ipcRenderer.invoke(IPC.NotesResolveFile, cwd, token),
  onNotesChanged: (cb) => on(IPC.NotesChanged, (itemId, event, path) => cb(itemId as string, event as string, path as string))
}

contextBridge.exposeInMainWorld('hub', hub)
