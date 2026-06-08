import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { AdoConnection, AdoResponse } from '../../shared/ipc'
import type { WorkItemProvider } from '../ado/WorkItemProvider'
import { AdoProvider } from '../ado/AdoProvider'
import { loadConnections, saveConnections, upsertConnection } from '../adoStore'

export interface AdoModuleDeps {
  /** Fabrique un provider pour une connexion + PAT (injectable pour test). */
  providerFor: (conn: AdoConnection, pat: string) => WorkItemProvider
}

const defaultDeps: AdoModuleDeps = {
  providerFor: (conn, pat) => new AdoProvider(conn, pat)
}

export function createAdoModule(deps: AdoModuleDeps = defaultDeps): HubModule {
  return {
    name: 'ado',
    register(ctx: AppContext): void {
      let conns = loadConnections(ctx.userDataDir)

      const provider = (connId: string): WorkItemProvider | null => {
        const conn = conns.find((c) => c.id === connId)
        const pat = ctx.credentials.get(connId)
        if (!conn || !pat) return null
        return deps.providerFor(conn, pat)
      }
      const wrap = async <T>(connId: string, fn: (p: WorkItemProvider) => Promise<T>): Promise<AdoResponse<T>> => {
        const p = provider(connId)
        if (!p) return { ok: false, error: 'Connexion ou PAT introuvable' }
        try { return { ok: true, data: await fn(p) } }
        catch (e) { return { ok: false, error: (e as Error).message, status: (e as { status?: number }).status } }
      }

      ctx.ipc.handle(IPC.AdoConnList, () => conns)
      ctx.ipc.handle(IPC.AdoConnUpsert, (_e, conn: AdoConnection, pat?: string) => {
        conns = upsertConnection(conns, conn)
        saveConnections(ctx.userDataDir, conns)
        if (pat) ctx.credentials.set(conn.id, pat)
      })
      ctx.ipc.handle(IPC.AdoConnDelete, (_e, id: string) => {
        conns = conns.filter((c) => c.id !== id)
        saveConnections(ctx.userDataDir, conns)
        ctx.credentials.delete(id)
      })
      ctx.ipc.handle(IPC.AdoConnTest, (_e, id: string): Promise<AdoResponse<true>> =>
        wrap(id, async (p) => { const r = await p.testConnection(); if (!r.ok) throw Object.assign(new Error(r.error ?? 'échec'), { status: r.status }); return true as const }))
      ctx.ipc.handle(IPC.AdoListProjects, (_e, id: string) => wrap(id, (p) => p.listProjects()))
      ctx.ipc.handle(IPC.AdoListTeams, (_e, id: string, project: string) => wrap(id, (p) => p.listTeams(project)))
      ctx.ipc.handle(IPC.AdoListIterations, (_e, id: string, project: string, team?: string) => wrap(id, (p) => p.listIterations(project, team)))
      ctx.ipc.handle(IPC.AdoListBoard, (_e, q: { connId: string; project: string; team?: string; iterationPath?: string }) =>
        wrap(q.connId, (p) => p.listBoard(q)))
      ctx.ipc.handle(IPC.AdoGetChildren, (_e, id: string, parentId: number) => wrap(id, (p) => p.getChildren(parentId)))
      ctx.ipc.handle(IPC.AdoGetDetail, (_e, connId: string, project: string, id: number) =>
        wrap(connId, (p) => p.getDetail(project, id)))
    }
  }
}
