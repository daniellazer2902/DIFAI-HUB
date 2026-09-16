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

/** Statuts qui comptent comme « en cours » pour la découverte de nouvelles PR (une file non vidée n'en laisse pas doubler d'autres). */
const ACTIFS = new Set<RunStatus>(['queued', 'running', 'attention'])
/** Statuts qui occupent réellement un créneau de concurrence (une entrée en file n'en consomme aucun tant qu'elle n'a pas démarré). */
const OCCUPES = new Set<RunStatus>(['running', 'attention'])

type Waiting = { config: AutomationConfig; pr: AdoPullRequest }

export function createAutomationModule(deps: AutomationDeps = defaultDeps): HubModule {
  let configs: AutomationConfig[] = []
  let runs: RunRecord[] = []
  const timers = new Map<string, ReturnType<typeof setInterval>>()
  const firstTickDone = new Set<string>()
  const pending = new Map<string, Waiting>()
  const queued = new Map<string, Waiting>()
  const ticking = new Set<string>()
  let draining = false

  return {
    name: 'automation',
    register(ctx: AppContext): void {
      runs = deps.loadRuns(ctx.userDataDir)

      const persist = (): void => deps.saveRuns(ctx.userDataDir, runs)
      const notify = (t: AutomationToast): void => ctx.sender.send(IPC.AutomationNotify, t)

      /** Enregistre un run et le projette vers l'interface : sans cet envoi, la ligne d'état l'ignore. */
      const record = (r: RunRecord): void => {
        runs = upsertRun(runs, r)
        persist()
        ctx.sender.send(IPC.AutomationRunUpdated, r)
      }

      const setStatus = (runId: string, status: RunStatus, error: string | null = null): RunRecord | null => {
        const run = runs.find((r) => r.id === runId)
        if (!run) return null
        const next: RunRecord = {
          ...run, status, error,
          endedAt: status === 'done' || status === 'failed' ? Date.now() : run.endedAt
        }
        record(next)
        // Un passage à un statut terminal libère un créneau : la file peut avancer.
        if (status === 'done' || status === 'failed') drainQueue()
        return next
      }

      const startRun = (config: AutomationConfig, pr: AdoPullRequest, existingId?: string): void => {
        const conn = deps.connectionFor(ctx, config.connId)
        const pat = ctx.credentials.get(config.connId)
        const runId = existingId ?? randomUUID()
        if (!conn || !pat) {
          record({
            id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
            project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
            startedAt: Date.now(), endedAt: Date.now(), status: 'failed',
            error: 'Connexion ou PAT introuvable', tabId: null
          })
          notify({ runId, level: 'failed', title: `Run impossible — !${pr.prId}`, body: 'Connexion ou PAT introuvable. Rien n\'a été posté.' })
          drainQueue()
          return
        }
        let tabId: string
        try {
          tabId = deps.runnerFor(ctx).start({
            cwd: config.cwd, org: orgOf(conn), pat, prompt: config.prompt,
            allowedTools: config.allowedTools, pr
          })
        } catch {
          // Motif générique : ne jamais reprendre le message d'erreur brut, qui pourrait référencer le PAT.
          record({
            id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
            project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
            startedAt: Date.now(), endedAt: Date.now(), status: 'failed',
            error: 'Échec du lancement de la session', tabId: null
          })
          notify({ runId, level: 'failed', title: `Run impossible — !${pr.prId}`, body: 'Le lancement de la session a échoué.' })
          drainQueue()
          return
        }
        ctx.registry.register(tabId, config.cwd)
        record({
          id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
          project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
          startedAt: Date.now(), endedAt: null, status: 'running', error: null, tabId
        })
        ctx.sender.send(IPC.AutomationRunStarted, {
          runId, groupId: config.groupId, automationId: config.id, tabId,
          title: `Review !${pr.prId}`, cwd: config.cwd
        })
      }

      /** Démarre les exécutions en file, dans l'ordre d'arrivée, tant qu'un créneau est libre. Non réentrante. */
      const drainQueue = (): void => {
        if (draining) return
        draining = true
        try {
          for (const [runId, { config, pr }] of [...queued.entries()]) {
            const occupied = runs.filter((r) => OCCUPES.has(r.status)).length
            if (occupied >= MAX_CONCURRENT) break
            queued.delete(runId)
            startRun(config, pr, runId)
          }
        } finally {
          draining = false
        }
      }

      const tick = async (config: AutomationConfig): Promise<void> => {
        if (ticking.has(config.id)) return // un sondage de cette automation est déjà en vol
        ticking.add(config.id)
        try {
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
            record({
              id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
              project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
              startedAt: Date.now(), endedAt: null, status: 'pending', error: null, tabId: null
            })
            pending.set(runId, { config, pr })
          }
          if (plan.toPend.length > 0) {
            notify({
              runId: '', level: 'attention',
              title: `${plan.toPend.length} PR en attente de review`,
              body: 'Détectées au démarrage. Lancer les reviews ?'
            })
          }
          for (const pr of plan.toQueue) {
            const runId = randomUUID()
            record({
              id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
              project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
              startedAt: Date.now(), endedAt: null, status: 'queued', error: null, tabId: null
            })
            queued.set(runId, { config, pr })
          }
          for (const pr of plan.toStart) startRun(config, pr)
          drainQueue()
        } finally {
          ticking.delete(config.id)
        }
      }

      /**
       * Le renderer republie sa configuration à chaque écriture de son état, bien plus souvent que
       * la période de sondage : réarmer sans distinction repousserait indéfiniment le premier tick.
       * Seules l'apparition, la disparition et le changement de période touchent aux minuteries.
       */
      const rearm = (next: AutomationConfig[]): void => {
        const before = new Map(configs.map((c) => [c.id, c]))
        configs = next
        const armable = new Map(next.filter((c) => c.enabled).map((c) => [c.id, c]))
        for (const [id, t] of [...timers.entries()]) {
          const cible = armable.get(id)
          if (!cible || cible.pollSeconds !== before.get(id)?.pollSeconds) { clearInterval(t); timers.delete(id) }
        }
        for (const [id, c] of armable.entries()) {
          if (timers.has(id)) continue
          // Le tick relit la configuration courante : un prompt modifié s'applique sans réarmement.
          timers.set(id, setInterval(() => {
            const cur = configs.find((x) => x.id === id)
            if (cur) void tick(cur)
          }, Math.max(60, c.pollSeconds) * 1000))
        }
      }

      ctx.ipc.handle(IPC.AutomationSetConfig, (_e, list: AutomationConfig[]) => {
        rearm(Array.isArray(list) ? list : [])
      })
      ctx.ipc.handle(IPC.AutomationListRuns, () => runs)
      ctx.ipc.handle(IPC.AutomationApprovePending, () => {
        // Toutes les PR en attente passent en file — c'est drainQueue() qui décide, au fil des créneaux, lesquelles démarrent.
        for (const [runId, entry] of [...pending.entries()]) {
          pending.delete(runId)
          queued.set(runId, entry)
          setStatus(runId, 'queued')
        }
        drainQueue()
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
    },
    dispose(): void {
      for (const t of timers.values()) clearInterval(t)
      timers.clear()
      firstTickDone.clear()
      pending.clear()
      queued.clear()
      ticking.clear()
    }
  }
}
