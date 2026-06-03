import type { IpcMain } from 'electron'
import type { PtyManager } from './PtyManager'
import type { SessionRegistry } from './SessionRegistry'
import type { HookServer } from './HookServer'

/** Abstraction d'envoi vers le renderer (découple les modules de BrowserWindow). */
export interface Sender {
  send(channel: string, ...args: unknown[]): void
}

/** Services partagés injectés à chaque module au moment du register(). */
export interface AppContext {
  ipc: IpcMain
  sender: Sender
  pty: PtyManager
  registry: SessionRegistry
  hookServer: HookServer
  /** Chemin du settings de hooks (lu paresseusement : connu seulement après app.whenReady). */
  hooksSettingsPath: () => string
  /** Dossier par défaut des nouvelles sessions. */
  defaultCwd: string
  /** Ouvre le sélecteur de dossier natif ; renvoie le chemin choisi ou null. */
  pickFolder: () => Promise<string | null>
}

/** Une feature autonome qui câble ses services + ses canaux IPC. */
export interface HubModule {
  name: string
  register(ctx: AppContext): void
}
