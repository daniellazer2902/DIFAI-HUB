import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'

export interface CmdModuleDeps { shellPath: string; shellArgs: string[] }

/** Crée des sessions « terminal » (shell générique, ex. PowerShell) sans hooks Claude. Réutilise tout le pipeline pty (I/O, resize, kill). */
export function createCmdModule(deps: CmdModuleDeps): HubModule {
  return {
    name: 'cmd',
    register(ctx: AppContext): void {
      ctx.ipc.handle(IPC.CmdNew, (_e, cwd: string) => {
        const tabId = ctx.pty.create(cwd, { file: deps.shellPath, args: deps.shellArgs })
        ctx.registry.register(tabId, cwd)
        return tabId
      })
    }
  }
}
