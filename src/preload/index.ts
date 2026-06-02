// API IPC exposée au renderer — remplie en Task A.5.
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('hub', {})
