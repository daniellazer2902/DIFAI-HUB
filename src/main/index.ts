import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'
import { SessionRegistry } from './SessionRegistry'
import { HookServer } from './HookServer'
import { applyHookEvent, type HookEvent } from './hookEvents'
import { writeHooksSettings } from './hubHooks'
import { TranscriptWatcher } from './TranscriptWatcher'
import { subagentsDir } from './transcriptPaths'

let mainWindow: BrowserWindow | null = null
let hooksSettingsPath = ''

const registry = new SessionRegistry()
const watchers = new Map<string, TranscriptWatcher>()

const hookServer = new HookServer((e) => {
  const event = e as HookEvent
  applyHookEvent(registry, event)
  const tabId = event.tabId
  if (!tabId) return
  const s = registry.get(tabId)
  console.log('[hub] event', event.hook_event_name, '| tab', tabId.slice(0, 8), '| etat', s?.state)

  if (event.hook_event_name === 'SessionStart' && s?.sessionId && s.transcriptPath && !watchers.has(tabId)) {
    const dir = subagentsDir(s.transcriptPath, s.sessionId)
    const w = new TranscriptWatcher({
      onAgentAdded: (agentId, meta) =>
        mainWindow?.webContents.send('agent:added', tabId, agentId, meta.agentType, meta.description),
      onAgentLines: (agentId, lines) =>
        mainWindow?.webContents.send('agent:lines', tabId, agentId, lines)
    })
    w.watch(dir)
    watchers.set(tabId, w)
  }
})
const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })

ptyManager.onData((tabId, data) => mainWindow?.webContents.send('pty:data', tabId, data))
ptyManager.onExit((tabId, code) => {
  registry.setState(tabId, 'done')
  watchers.get(tabId)?.stop()
  watchers.delete(tabId)
  mainWindow?.webContents.send('pty:exit', tabId, code)
})

ipcMain.handle('session:new', (_e, cwd: string) => {
  const tabId = ptyManager.create(cwd, {
    args: ['--settings', hooksSettingsPath],
    env: { DIFAI_HUB_PORT: String(hookServer.port) }
  })
  registry.register(tabId, cwd)
  return tabId
})
ipcMain.on('session:input', (_e, tabId: string, data: string) => ptyManager.write(tabId, data))
ipcMain.on('session:resize', (_e, tabId: string, cols: number, rows: number) => ptyManager.resize(tabId, cols, rows))

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

  mainWindow = win

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => { mainWindow = null })

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
