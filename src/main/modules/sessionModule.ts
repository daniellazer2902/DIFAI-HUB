import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'

/** Cycle de vie du terminal : création de session, I/O, resize, kill, et flux pty -> renderer. */
export function createSessionModule(): HubModule {
  return {
    name: 'session',
    register(ctx: AppContext): void {
      ctx.pty.onData((tabId, data) => ctx.sender.send(IPC.PtyData, tabId, data))
      ctx.pty.onExit((tabId, code) => {
        ctx.registry.setState(tabId, 'done')
        ctx.sender.send(IPC.SessionState, tabId, 'done')
        ctx.sender.send(IPC.PtyExit, tabId, code)
      })

      ctx.ipc.handle(IPC.SessionNew, (_e, cwd: string) => {
        const tabId = ctx.pty.create(cwd, {
          args: ['--settings', ctx.hooksSettingsPath()],
          env: { DIFAI_HUB_PORT: String(ctx.hookServer.port) }
        })
        ctx.registry.register(tabId, cwd)
        return tabId
      })
      ctx.ipc.on(IPC.SessionInput, (_e, tabId: string, data: string) => ctx.pty.write(tabId, data))
      ctx.ipc.on(IPC.SessionResize, (_e, tabId: string, cols: number, rows: number) => ctx.pty.resize(tabId, cols, rows))
      ctx.ipc.on(IPC.SessionKill, (_e, tabId: string) => ctx.pty.kill(tabId))
    }
  }
}
