import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type HubApi, type Unsub, type SessionState, type ConsoleLine, type WorkspaceTree } from '../shared/ipc'

/** Abonne un canal et renvoie un désabonnement (retire le bon listener). */
function on(channel: string, handler: (...args: unknown[]) => void): Unsub {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => handler(...args)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const hub: HubApi = {
  newSession: (cwd) => ipcRenderer.invoke(IPC.SessionNew, cwd),
  sendInput: (tabId, data) => ipcRenderer.send(IPC.SessionInput, tabId, data),
  resize: (tabId, cols, rows) => ipcRenderer.send(IPC.SessionResize, tabId, cols, rows),
  killSession: (tabId) => ipcRenderer.send(IPC.SessionKill, tabId),
  pickFolder: () => ipcRenderer.invoke(IPC.PickFolder),
  defaultCwd: () => ipcRenderer.invoke(IPC.DefaultCwd),
  searchTranscript: (tabId, query) => ipcRenderer.invoke(IPC.SearchTranscript, tabId, query),
  loadWorkspace: () => ipcRenderer.invoke(IPC.LoadWorkspace),
  saveWorkspace: (tree) => ipcRenderer.send(IPC.SaveWorkspace, tree),
  onData: (cb) => on(IPC.PtyData, (tabId, data) => cb(tabId as string, data as string)),
  onExit: (cb) => on(IPC.PtyExit, (tabId, code) => cb(tabId as string, code as number)),
  onSessionState: (cb) => on(IPC.SessionState, (tabId, state) => cb(tabId as string, state as SessionState)),
  onAgentAdded: (cb) =>
    on(IPC.AgentAdded, (tabId, agentId, type, desc) =>
      cb(tabId as string, agentId as string, type as string, desc as string)),
  onAgentLines: (cb) =>
    on(IPC.AgentLines, (tabId, agentId, lines) => cb(tabId as string, agentId as string, lines as ConsoleLine[])),
  onAgentDone: (cb) => on(IPC.AgentDone, (tabId, agentId) => cb(tabId as string, agentId as string)),
  onCloseRequest: (cb) => on(IPC.CloseRequest, () => cb()),
  confirmClose: () => ipcRenderer.send(IPC.CloseConfirm)
}

contextBridge.exposeInMainWorld('hub', hub)
