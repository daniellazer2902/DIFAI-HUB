import { describe, it, expect, vi } from 'vitest'
import { createAdoModule } from '../src/main/modules/adoModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const creds = new Map<string, string>()
  const ctx = {
    ipc: { handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h), on: vi.fn() },
    userDataDir: 'C:/ud',
    credentials: {
      set: (id: string, p: string) => creds.set(id, p),
      get: (id: string) => creds.get(id) ?? null,
      delete: (id: string) => { creds.delete(id) }
    }
  } as unknown as AppContext
  return { ctx, handlers, creds }
}

describe('adoModule', () => {
  it('conn-upsert enregistre la connexion et le PAT', async () => {
    const { ctx, handlers, creds } = fakeCtx()
    createAdoModule({ providerFor: vi.fn() }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' }, 'pat-123')
    expect(creds.get('c1')).toBe('pat-123')
    expect(await handlers.get(IPC.AdoConnList)!({})).toEqual([{ id: 'c1', label: 'A', baseUrl: 'u' }])
  })

  it('conn-test délègue au provider', async () => {
    const { ctx, handlers } = fakeCtx()
    const provider = { testConnection: vi.fn(async () => ({ ok: true })) }
    const providerFor = vi.fn(() => provider)
    createAdoModule({ providerFor: providerFor as never }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' }, 'pat')
    const r = await handlers.get(IPC.AdoConnTest)!({}, 'c1')
    expect(r).toEqual({ ok: true, data: true })
    expect(provider.testConnection).toHaveBeenCalled()
  })

  it('conn-test sans PAT => ok:false', async () => {
    const { ctx, handlers } = fakeCtx()
    createAdoModule({ providerFor: vi.fn() as never }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' })
    expect(await handlers.get(IPC.AdoConnTest)!({}, 'c1')).toMatchObject({ ok: false })
  })

  it('list-board délègue au provider et renvoie data', async () => {
    const { ctx, handlers } = fakeCtx()
    const board = { states: ['New'], stories: [], tasksByParent: {} }
    const provider = { testConnection: vi.fn(), listBoard: vi.fn(async () => board) }
    createAdoModule({ providerFor: (() => provider) as never }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' }, 'pat')
    const r = await handlers.get(IPC.AdoListBoard)!({}, { connId: 'c1', project: 'Proj' })
    expect(r).toEqual({ ok: true, data: board })
  })
})
