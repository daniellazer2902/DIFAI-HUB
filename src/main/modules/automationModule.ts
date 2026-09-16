import { randomUUID } from 'node:crypto'
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { AdoConnection, AdoPullRequest, AutomationConfig, AutomationToast, RunRecord, RunStatus } from '../../shared/ipc'
import { PullRequestProvider } from '../ado/PullRequestProvider'
import { AutomationRunner } from '../automations/AutomationRunner'
import { loadRuns, saveRuns, runKey, upsertRun } from '../automations/runStore'
import { planTick, MAX_CONCURRENT } from '../automations/planTick'
import { statusFromHook, statusFromExit } from '../automations/runState'
import { loadConnections } from '../adoStore'
import type { HookEvent } from '../hookEvents'

export interface AutomationDeps {
  providerFor: (conn: AdoConnection, pat: string) => { listAssigned(scope: AutomationConfig['scope']): Promise<AdoPullRequest[]> }
  runnerFor: (ctx: AppContext) => { start(o: { cwd: string; org: string; pat: string; prompt: string; allowedTools: string[]; pr: AdoPullRequest }): string }
  connectionFor: (ctx: AppContext, connId: string) => AdoConnection | null
  loadRuns: (dir: string) => RunRecord[]
  saveRuns: (dir: string, list: RunRecord[]) => void
}

const defaultDeps: AutomationDeps = {
  providerFor: (conn, pat) => new PullRequestProvider(conn, pat),
  runnerFor: (ctx) => new AutomationRunner({
    pty: ctx.pty, settingsPath: () => ctx.hooksSettingsPath(), hookPort: () => ctx.hookServer.port
  }),
  connectionFor: (ctx, connId) => loadConnections(ctx.userDataDir).find((c) => c.id === connId) ?? null,
  loadRuns, saveRuns
}

/** Nom d'organisation lisible, extrait de l'URL de base de la connexion. */
function orgOf(conn: AdoConnection): string {
  return conn.baseUrl.replace(/\/+$/, '').split('/').pop() ?? conn.label
}

const ACTIFS = new Set<RunStatus>(['queued', 'running', 'attention'])

export function createAutomationModule(deps: AutomationDeps = defaultDeps): HubModule {
  return {
    name: 'automation',
    register(ctx: AppContext): void {
      let configs: AutomationConfig[] = []
      let runs: RunRecord[] = deps.loadRuns(ctx.userDataDir)
      const timers = new Map<string, ReturnType<typeof setInterval>>()
      const firstTickDone = new Set<string>()
      const pending = new Map<string, { config: AutomationConfig; pr: AdoPullRequest }>()

      const persist = (): void => deps.saveRuns(ctx.userDataDir, runs)
      const notify = (t: AutomationToast): void => ctx.sender.send(IPC.AutomationNotify, t)

      const setStatus = (runId: string, status: RunStatus, error: string | null = null): RunRecord | null => {
        const run = runs.find((r) => r.id === runId)
        if (!run) return null
        const next: RunRecord = {
          ...run, status, error,
          endedAt: status === 'done' || status === 'failed' ? Date.now() : run.endedAt
        }
        runs = upsertRun(runs, next)
        persist()
        ctx.sender.send(IPC.AutomationRunUpdated, next)
        return next
      }

      const startRun = (config: AutomationConfig, pr: AdoPullRequest, existingId?: string): void => {
        const conn = deps.connectionFor(ctx, config.connId)
        const pat = ctx.credentials.get(config.connId)
        const runId = existingId ?? randomUUID()
        if (!conn || !pat) {
          const record: RunRecord = {
            id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
            project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
            startedAt: Date.now(), endedAt: Date.now(), status: 'failed',
            error: 'Connexion ou PAT introuvable', tabId: null
          }
          runs = upsertRun(runs, record); persist()
          notify({ runId, level: 'failed', title: `Run impossible — !${pr.prId}`, body: 'Connexion ou PAT introuvable. Rien n\'a été posté.' })
          return
        }
        const tabId = deps.runnerFor(ctx).start({
          cwd: config.cwd, org: orgOf(conn), pat, prompt: config.prompt,
          allowedTools: config.allowedTools, pr
        })
        ctx.registry.register(tabId, config.cwd)
        const record: RunRecord = {
          id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
          project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
          startedAt: Date.now(), endedAt: null, status: 'running', error: null, tabId
        }
        runs = upsertRun(runs, record); persist()
        ctx.sender.send(IPC.AutomationRunStarted, {
          runId, groupId: config.groupId, automationId: config.id, tabId,
          title: `Review !${pr.prId}`, cwd: config.cwd
        })
      }

      const tick = async (config: AutomationConfig): Promise<void> => {
        const conn = deps.connectionFor(ctx, config.connId)
        const pat = ctx.credentials.get(config.connId)
        if (!conn || !pat) return
        let prs: AdoPullRequest[]
        try { prs = await deps.providerFor(conn, pat).listAssigned(config.scope) } catch { return }
        const first = !firstTickDone.has(config.id)
        const activeCount = runs.filter((r) => ACTIFS.has(r.status)).length
        const plan = planTick({ prs, journal: runs, firstTick: first, activeCount })
        firstTickDone.add(config.id)

        for (const pr of plan.toPend) {
          const runId = randomUUID()
          runs = upsertRun(runs, {
            id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
            project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
            startedAt: Date.now(), endedAt: null, status: 'pending', error: null, tabId: null
          })
          pending.set(runId, { config, pr })
        }
        if (plan.toPend.length > 0) {
          persist()
          notify({
            runId: '', level: 'attention',
            title: `${plan.toPend.length} PR en attente de review`,
            body: 'Détectées au démarrage. Lancer les reviews ?'
          })
        }
        for (const pr of plan.toStart) startRun(config, pr)
      }

      const rearm = (): void => {
        for (const t of timers.values()) clearInterval(t)
        timers.clear()
        for (const c of configs.filter((x) => x.enabled)) {
          timers.set(c.id, setInterval(() => { void tick(c) }, Math.max(60, c.pollSeconds) * 1000))
        }
      }

      ctx.ipc.handle(IPC.AutomationSetConfig, (_e, list: AutomationConfig[]) => {
        configs = Array.isArray(list) ? list : []
        rearm()
      })
      ctx.ipc.handle(IPC.AutomationListRuns, () => runs)
      ctx.ipc.handle(IPC.AutomationApprovePending, () => {
        const creneaux = MAX_CONCURRENT - runs.filter((r) => ACTIFS.has(r.status)).length
        for (const [runId, { config, pr }] of [...pending.entries()].slice(0, Math.max(0, creneaux))) {
          pending.delete(runId)
          startRun(config, pr, runId)
        }
      })
      ctx.ipc.handle(IPC.AutomationDismissPending, () => {
        for (const runId of pending.keys()) setStatus(runId, 'failed', 'Écarté au démarrage')
        pending.clear()
      })
      ctx.ipc.handle(IPC.AutomationRunNow, (_e, automationId: string, pr: AdoPullRequest) => {
        const config = configs.find((c) => c.id === automationId)
        if (config) startRun(config, pr)
      })

      ctx.hookServer.onEvent((raw) => {
        const e = raw as HookEvent
        const run = runs.find((r) => r.tabId && r.tabId === e.tabId)
        if (!run) return
        const next = statusFromHook(e.hook_event_name ?? '', e.tool_name, run.status)
        if (!next || next === run.status) return
        setStatus(run.id, next)
        if (next === 'attention') {
          notify({
            runId: run.id, level: 'attention',
            title: `Une réponse est attendue — !${run.prId}`,
            body: `${run.project} · ${run.repo} — la session t'attend.`
          })
        }
      })

      ctx.pty.onExit((tabId, code) => {
        const run = runs.find((r) => r.tabId === tabId)
        if (!run || run.status === 'done' || run.status === 'failed') return
        const status = statusFromExit(code)
        setStatus(run.id, status, status === 'failed' ? `Session terminée (code ${code})` : null)
        notify({
          runId: run.id, level: status === 'done' ? 'done' : 'failed',
          title: status === 'done' ? `Review terminée — !${run.prId}` : `Run interrompu — !${run.prId}`,
          body: `${run.project} · ${run.repo}`
        })
      })
    }
  }
}
