import { readFileSync } from 'node:fs'
import { IPC } from '../../shared/ipc'
import { searchTranscript } from '../transcriptSearch'
import type { AppContext, HubModule } from '../AppContext'
import { loadWorkspace, saveWorkspace } from '../workspaceStore'
import type { WorkspaceTree } from '../../shared/ipc'

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
      ctx.ipc.handle(IPC.DefaultCwd, () => ctx.defaultCwd)
      ctx.ipc.handle(IPC.PickFolder, () => ctx.pickFolder())
      ctx.ipc.handle(IPC.SearchTranscript, (_e, tabId: string, query: string) => {
        const s = ctx.registry.get(tabId)
        if (!s?.transcriptPath || !query.trim()) return []
        try {
          return searchTranscript(readFileSync(s.transcriptPath, 'utf8'), query)
        } catch {
          return []
        }
      })
      ctx.ipc.handle(IPC.LoadWorkspace, () => loadWorkspace(ctx.userDataDir))
      ctx.ipc.on(IPC.SaveWorkspace, (_e, tree: WorkspaceTree) => saveWorkspace(ctx.userDataDir, tree))
    }
  }
}
