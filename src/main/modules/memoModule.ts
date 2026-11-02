import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import { loadMemo, saveMemo, deleteMemo } from '../memoStore'

/** Persistance des mémos : un fichier HTML par mémo dans userData/memos/. */
export function createMemoModule(): HubModule {
  return {
    name: 'memo',
    register(ctx: AppContext): void {
      ctx.ipc.handle(IPC.MemoLoad, (_e, id: string) => loadMemo(ctx.userDataDir, String(id)))
      ctx.ipc.handle(IPC.MemoSave, (_e, id: string, html: string) => { saveMemo(ctx.userDataDir, String(id), html) })
      ctx.ipc.on(IPC.MemoDelete, (_e, id: string) => deleteMemo(ctx.userDataDir, String(id)))
    }
  }
}
