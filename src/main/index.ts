import { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'
import { resolvePowerShellPath } from './shellPath'
import { SessionRegistry } from './SessionRegistry'
import { HookServer } from './HookServer'
import { writeHooksSettings } from './hubHooks'
import { WindowSender } from './WindowSender'
import { CredentialStore } from './ado/CredentialStore'
import type { AppContext, HubModule } from './AppContext'
import { createSessionModule } from './modules/sessionModule'
import { createAgentsModule } from './modules/agentsModule'
import { createAdoModule } from './modules/adoModule'
import { createClaudeGuardModule } from './modules/claudeGuardModule'
import { createCmdModule } from './modules/cmdModule'
import { createNotesModule } from './modules/notesModule'
import { createDideOpenModule } from './modules/dideOpenModule'
import { IPC } from '../shared/ipc'

let hooksSettingsPath = ''
let quitting = false

const registry = new SessionRegistry()
const hookServer = new HookServer()
const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })
const sender = new WindowSender()
const credentialStore = new CredentialStore(app.getPath('userData'), safeStorage, { readFileSync, writeFileSync } as never)

const ctx: AppContext = {
  ipc: ipcMain,
  sender,
  pty: ptyManager,
  registry,
  hookServer,
  hooksSettingsPath: () => hooksSettingsPath,
  defaultCwd: process.cwd(),
  pickFolder: async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  },
  userDataDir: app.getPath('userData'),
  credentials: credentialStore
}

const modules: HubModule[] = [
  createSessionModule(),
  createAgentsModule(),
  createAdoModule(),
  createClaudeGuardModule(),
  createCmdModule({ shellPath: resolvePowerShellPath(), shellArgs: process.platform === 'win32' ? ['-NoLogo'] : [] }),
  createNotesModule(),
  createDideOpenModule()
]
for (const m of modules) m.register(ctx)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#171717', symbolColor: '#dddddd', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  sender.setWindow(win)

  // Révèle la fenêtre dès que possible. `ready-to-show` ne se déclenche pas toujours :
  // on double avec `did-finish-load` + un filet de sécurité par timeout.
  const reveal = (): void => { if (!win.isDestroyed() && !win.isVisible()) { win.show(); win.focus() } }
  win.once('ready-to-show', reveal)
  win.webContents.once('did-finish-load', reveal)
  const safety = setTimeout(reveal, 3000)
  win.on('show', () => clearTimeout(safety))
  win.on('closed', () => { clearTimeout(safety); sender.setWindow(null) })
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[hub] échec chargement renderer', code, desc, url))

  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    win.webContents.send(IPC.CloseRequest)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null) // retire le menu File/Edit/View/Window/Help
  const port = await hookServer.start()
  const forwardScript = join(app.getAppPath(), 'resources', 'hooks', 'hook-forward.mjs')
  hooksSettingsPath = writeHooksSettings(app.getPath('userData'), forwardScript)
  console.log('[hub] HookServer sur port', port, '| hooks settings :', hooksSettingsPath)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  ipcMain.on(IPC.CloseConfirm, () => {
    quitting = true
    ptyManager.killAll()
    BrowserWindow.getAllWindows().forEach((w) => w.destroy())
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
