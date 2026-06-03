import type { BrowserWindow } from 'electron'
import type { Sender } from './AppContext'

/** Sender concret : route les events vers la fenêtre courante si elle est vivante. */
export class WindowSender implements Sender {
  private win: BrowserWindow | null = null

  setWindow(win: BrowserWindow | null): void { this.win = win }

  send(channel: string, ...args: unknown[]): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, ...args)
  }
}
