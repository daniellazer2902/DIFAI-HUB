import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'

let mainWindow: BrowserWindow | null = null

const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })

ptyManager.onData((tabId, data) => mainWindow?.webContents.send('pty:data', tabId, data))
ptyManager.onExit((tabId, code) => mainWindow?.webContents.send('pty:exit', tabId, code))

ipcMain.handle('session:new', (_e, cwd: string) => ptyManager.create(cwd))
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
