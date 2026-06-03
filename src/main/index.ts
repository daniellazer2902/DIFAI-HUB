import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'
import { SessionRegistry } from './SessionRegistry'
import { HookServer } from './HookServer'
import { writeHooksSettings } from './hubHooks'
import { WindowSender } from './WindowSender'
import type { AppContext, HubModule } from './AppContext'
import { createSessionModule } from './modules/sessionModule'
import { createAgentsModule } from './modules/agentsModule'

let hooksSettingsPath = ''

const registry = new SessionRegistry()
const hookServer = new HookServer()
const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })
const sender = new WindowSender()

const ctx: AppContext = {
  ipc: ipcMain,
  sender,
  pty: ptyManager,
  registry,
  hookServer,
  hooksSettingsPath: () => hooksSettingsPath
}

const modules: HubModule[] = [createSessionModule(), createAgentsModule()]
for (const m of modules) m.register(ctx)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  sender.setWindow(win)

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => { sender.setWindow(null) })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const port = await hookServer.start()
  const forwardScript = join(app.getAppPath(), 'resources', 'hooks', 'hook-forward.mjs')
  hooksSettingsPath = writeHooksSettings(app.getPath('userData'), forwardScript)
  console.log('[hub] HookServer sur port', port, '| hooks settings :', hooksSettingsPath)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
