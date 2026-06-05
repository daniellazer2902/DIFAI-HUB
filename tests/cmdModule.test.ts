import { describe, it, expect, vi } from 'vitest'
import { createCmdModule } from '../src/main/modules/cmdModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ctx = {
    ipc: { handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h), on: vi.fn() },
    pty: { create: vi.fn(() => 'tab-1') },
    registry: { register: vi.fn() }
  } as unknown as AppContext
  return { ctx, handlers }
}

describe('cmdModule', () => {
  it('cmd:new spawn le shell (file + args) et enregistre la session', () => {
    const { ctx, handlers } = fakeCtx()
    createCmdModule({ shellPath: 'C:/ps.exe', shellArgs: ['-NoLogo'] }).register(ctx)
    const tabId = handlers.get(IPC.CmdNew)!({}, 'C:/proj')
    expect(tabId).toBe('tab-1')
    expect(ctx.pty.create).toHaveBeenCalledWith('C:/proj', { file: 'C:/ps.exe', args: ['-NoLogo'] })
    expect(ctx.registry.register).toHaveBeenCalledWith('tab-1', 'C:/proj')
  })
})
