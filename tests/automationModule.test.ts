import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutomationModule } from '../src/main/modules/automationModule'
import { IPC } from '../src/shared/ipc'
import { MAX_CONCURRENT } from '../src/main/automations/planTick'
import type { AppContext } from '../src/main/AppContext'
import type { AdoPullRequest, AutomationConfig, RunRecord } from '../src/shared/ipc'

const pr = (id: number): AdoPullRequest => ({
  prId: id, project: 'P', repo: 'R', title: `t${id}`, author: 'a',
  sourceBranch: 's', targetBranch: 'd', url: `u${id}`
})

const config = (over: Partial<AutomationConfig> = {}): AutomationConfig => ({
  id: 'auto-1', groupId: 'g1', name: 'Review PR', cwd: 'C:/x', connId: 'c1',
  scope: [{ project: 'P', repos: [] }], trigger: 'reviewer-assigned', pollSeconds: 60,
  prompt: 'Revue {{prId}}', allowedTools: ['Read'], enabled: true, ...over
})

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const sent: { channel: string; args: unknown[] }[] = []
  let hookCb: ((e: unknown) => void) | null = null
  let exitCb: ((tabId: string, code: number) => void) | null = null
  const ctx = {
    ipc: {
      handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h),
      on: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h)
    },
    sender: { send: (channel: string, ...args: unknown[]) => { sent.push({ channel, args }) } },
    pty: { onExit: (cb: (t: string, c: number) => void) => { exitCb = cb; return () => {} } },
    registry: { register: vi.fn() },
    hookServer: { onEvent: (cb: (e: unknown) => void) => { hookCb = cb; return () => {} }, port: 7000 },
    hooksSettingsPath: () => 'S',
    userDataDir: 'C:/ud',
    credentials: { get: () => 'pat-secret', set: vi.fn(), delete: vi.fn() }
  } as unknown as AppContext
  return { ctx, handlers, sent, hook: () => hookCb!, exit: () => exitCb! }
}

function deps(prs: AdoPullRequest[], startedTabId = 'tab-1') {
  return {
    providerFor: () => ({ listAssigned: vi.fn(async () => prs), resolveUserId: vi.fn(async () => 'u') }),
    runnerFor: () => ({ start: vi.fn(() => startedTabId) }),
    connectionFor: () => ({ id: 'c1', label: 'acme', baseUrl: 'https://dev.azure.com/acme' }),
    loadRuns: () => [],
    saveRuns: vi.fn()
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('automationModule', () => {
  it('ne démarre aucun run au premier tick et notifie les PR en attente', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1), pr(2)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent.filter((s) => s.channel === IPC.AutomationRunStarted).length).toBe(0)
    const toast = sent.find((s) => s.channel === IPC.AutomationNotify)
    expect(toast).toBeTruthy()
    expect(JSON.stringify(toast!.args)).toContain('2')
  })

  it('une PR mise en attente ne démarre pas d elle-même au tick suivant', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)   // premier tick : mise en attente
    await vi.advanceTimersByTimeAsync(60_000)   // second tick : la PR reste en attente, pas de run
    expect(sent.filter((s) => s.channel === IPC.AutomationRunStarted).length).toBe(0)
  })

  it('approuver les PR en attente lance les runs', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    const started = sent.filter((s) => s.channel === IPC.AutomationRunStarted)
    expect(started.length).toBe(1)
    expect((started[0].args[0] as { tabId: string }).tabId).toBe('tab-1')
  })

  it('une automation désactivée ne tourne pas', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config({ enabled: false })])
    await vi.advanceTimersByTimeAsync(300_000)
    expect(sent.length).toBe(0)
  })

  it('un hook AskUserQuestion passe le run en attention et notifie', async () => {
    const { ctx, handlers, sent, hook } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    sent.length = 0
    hook()({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tabId: 'tab-1' })
    const notif = sent.find((s) => s.channel === IPC.AutomationNotify)
    expect((notif!.args[0] as { level: string }).level).toBe('attention')
  })

  it('la sortie du pty termine le run et notifie', async () => {
    const { ctx, handlers, sent, exit } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    sent.length = 0
    exit()('tab-1', 0)
    const notif = sent.find((s) => s.channel === IPC.AutomationNotify)
    expect((notif!.args[0] as { level: string }).level).toBe('done')
  })

  it('le PAT ne part jamais vers le renderer', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    expect(JSON.stringify(sent)).not.toContain('pat-secret')
  })

  it('la file d\'attente démarre au fil des créneaux libérés (fix round 1)', async () => {
    const startedTabIds = ['tab-1', 'tab-2', 'tab-3']
    let i = 0
    const { ctx, handlers, sent, exit } = fakeCtx()
    const d = {
      providerFor: () => ({ listAssigned: vi.fn(async () => [pr(1), pr(2), pr(3)]), resolveUserId: vi.fn(async () => 'u') }),
      runnerFor: () => ({ start: vi.fn(() => startedTabIds[i++]) }),
      connectionFor: () => ({ id: 'c1', label: 'acme', baseUrl: 'https://dev.azure.com/acme' }),
      loadRuns: () => [],
      saveRuns: vi.fn()
    }
    createAutomationModule(d as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})

    let started = sent.filter((s) => s.channel === IPC.AutomationRunStarted)
    expect(started.length).toBe(MAX_CONCURRENT)
    let runs = await handlers.get(IPC.AutomationListRuns)!({}) as RunRecord[]
    expect(runs.filter((r) => r.status === 'queued').length).toBe(1)
    expect(runs.filter((r) => r.status === 'pending').length).toBe(0)

    const firstTabId = (started[0].args[0] as { tabId: string }).tabId
    exit()(firstTabId, 0) // libère un créneau : la 3e PR doit démarrer d'elle-même

    started = sent.filter((s) => s.channel === IPC.AutomationRunStarted)
    expect(started.length).toBe(3)
    runs = await handlers.get(IPC.AutomationListRuns)!({}) as RunRecord[]
    expect(runs.filter((r) => r.status === 'queued').length).toBe(0)
  })

  it('deux sondages qui se chevauchent ne produisent qu\'un seul passage (fix round 1)', async () => {
    const { ctx, handlers } = fakeCtx()
    let resolveList: ((v: AdoPullRequest[]) => void) | null = null
    const listAssigned = vi.fn(() => new Promise<AdoPullRequest[]>((res) => { resolveList = res }))
    const d = {
      providerFor: () => ({ listAssigned, resolveUserId: vi.fn(async () => 'u') }),
      runnerFor: () => ({ start: vi.fn(() => 'tab-1') }),
      connectionFor: () => ({ id: 'c1', label: 'acme', baseUrl: 'https://dev.azure.com/acme' }),
      loadRuns: () => [],
      saveRuns: vi.fn()
    }
    createAutomationModule(d as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000) // 1er tick : listAssigned appelé, reste en vol
    await vi.advanceTimersByTimeAsync(60_000) // 2e tick : verrouillé, ne rappelle pas listAssigned
    expect(listAssigned).toHaveBeenCalledTimes(1)
    resolveList!([])
    await vi.advanceTimersByTimeAsync(0)
  })

  it('dispose arrête les minuteries : plus aucun sondage après libération (fix round 1)', async () => {
    const { ctx, handlers } = fakeCtx()
    const listAssigned = vi.fn(async () => [pr(1)])
    const d = {
      providerFor: () => ({ listAssigned, resolveUserId: vi.fn(async () => 'u') }),
      runnerFor: () => ({ start: vi.fn(() => 'tab-1') }),
      connectionFor: () => ({ id: 'c1', label: 'acme', baseUrl: 'https://dev.azure.com/acme' }),
      loadRuns: () => [],
      saveRuns: vi.fn()
    }
    const mod = createAutomationModule(d as never)
    mod.register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    mod.dispose?.()
    await vi.advanceTimersByTimeAsync(600_000)
    expect(listAssigned).not.toHaveBeenCalled()
  })

  it('une exception au lancement de la session marque le run failed sans perdre la PR ni le secret (fix round 1)', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    const d = {
      providerFor: () => ({ listAssigned: vi.fn(async () => [pr(1)]), resolveUserId: vi.fn(async () => 'u') }),
      runnerFor: () => ({ start: vi.fn(() => { throw new Error('échec contenant pat-secret') }) }),
      connectionFor: () => ({ id: 'c1', label: 'acme', baseUrl: 'https://dev.azure.com/acme' }),
      loadRuns: () => [],
      saveRuns: vi.fn()
    }
    createAutomationModule(d as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    const runs = await handlers.get(IPC.AutomationListRuns)!({}) as RunRecord[]
    expect(runs.find((r) => r.prId === 1)?.status).toBe('failed')
    expect(JSON.stringify(sent)).not.toContain('pat-secret')
  })
})
