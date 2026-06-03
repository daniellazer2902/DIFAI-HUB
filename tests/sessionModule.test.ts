import { describe, it, expect, vi } from 'vitest'
import { createSessionModule } from '../src/main/modules/sessionModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ons = new Map<string, (...a: unknown[]) => void>()
  const ctx = {
    ipc: {
      handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h),
      on: (c: string, h: (...a: unknown[]) => void) => ons.set(c, h)
    },
    sender: { send: vi.fn() },
    pty: { onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}), create: vi.fn(() => 'tab-1'), write: vi.fn(), resize: vi.fn(), kill: vi.fn() },
    registry: { register: vi.fn(), setState: vi.fn() },
    hookServer: { port: 4242 },
    hooksSettingsPath: () => 'C:/settings.json',
    defaultCwd: 'C:/def',
    pickFolder: vi.fn(async () => 'C:/picked')
  } as unknown as AppContext
  return { ctx, handlers, ons }
}

describe('sessionModule', () => {
  it('session:new crée un pty avec --settings + DIFAI_HUB_PORT et enregistre la session', () => {
    const { ctx, handlers } = fakeCtx()
    createSessionModule().register(ctx)
    const tabId = handlers.get(IPC.SessionNew)!({}, 'C:/proj')
    expect(tabId).toBe('tab-1')
    expect(ctx.pty.create).toHaveBeenCalledWith('C:/proj', {
      args: ['--settings', 'C:/settings.json'],
      env: { DIFAI_HUB_PORT: '4242' }
    })
    expect(ctx.registry.register).toHaveBeenCalledWith('tab-1', 'C:/proj')
  })

  it('session:input écrit dans le pty', () => {
    const { ctx, ons } = fakeCtx()
    createSessionModule().register(ctx)
    ons.get(IPC.SessionInput)!({}, 'tab-1', 'ls')
    expect(ctx.pty.write).toHaveBeenCalledWith('tab-1', 'ls')
  })

  it('default-cwd renvoie ctx.defaultCwd', async () => {
    const { ctx, handlers } = fakeCtx()
    createSessionModule().register(ctx)
    expect(await handlers.get(IPC.DefaultCwd)!({})).toBe('C:/def')
  })

  it('pick-folder délègue à ctx.pickFolder', async () => {
    const { ctx, handlers } = fakeCtx()
    createSessionModule().register(ctx)
    expect(await handlers.get(IPC.PickFolder)!({})).toBe('C:/picked')
  })
})
