import { contextBridge, ipcRenderer } from 'electron'

const hub = {
  newSession: (cwd: string): Promise<string> => ipcRenderer.invoke('session:new', cwd),
  sendInput: (tabId: string, data: string): void => ipcRenderer.send('session:input', tabId, data),
  resize: (tabId: string, cols: number, rows: number): void => ipcRenderer.send('session:resize', tabId, cols, rows),
  onData: (cb: (tabId: string, data: string) => void): void => {
    ipcRenderer.on('pty:data', (_e, tabId: string, data: string) => cb(tabId, data))
  },
  onExit: (cb: (tabId: string, code: number) => void): void => {
    ipcRenderer.on('pty:exit', (_e, tabId: string, code: number) => cb(tabId, code))
  }
}

contextBridge.exposeInMainWorld('hub', hub)
export type Hub = typeof hub
