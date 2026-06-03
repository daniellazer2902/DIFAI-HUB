import { describe, it, expect, vi } from 'vitest'
import { createAgentsModule } from '../src/main/modules/agentsModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  let hookCb: (e: unknown) => void = () => {}
  let exitCb: (tabId: string, code: number) => void = () => {}
  const registryState = { tabId: 't1', cwd: 'C:/p', sessionId: null as string | null, transcriptPath: null as string | null, state: 'starting' }
  const ctx = {
    ipc: { handle: vi.fn(), on: vi.fn() },
    sender: { send: vi.fn() },
    pty: { onExit: (cb: (t: string, c: number) => void) => { exitCb = cb; return () => {} } },
    registry: {
      get: () => registryState,
      correlate: vi.fn((_t, sid, tp) => { registryState.sessionId = sid; registryState.transcriptPath = tp; registryState.state = 'active' }),
      setState: vi.fn((_t, s) => { registryState.state = s })
    },
    hookServer: { onEvent: (cb: (e: unknown) => void) => { hookCb = cb; return () => {} } },
    hooksSettingsPath: () => ''
  } as unknown as AppContext
  return { ctx, fire: (e: unknown) => hookCb(e), exit: (t: string, c: number) => exitCb(t, c), registryState }
}

describe('agentsModule', () => {
  it('pousse l\'état de session au renderer sur event de hook', () => {
    const { ctx, fire } = fakeCtx()
    createAgentsModule().register(ctx)
    fire({ hook_event_name: 'SessionStart', tabId: 't1', session_id: 's1', transcript_path: 'C:/p/s1.jsonl' })
    expect(ctx.sender.send).toHaveBeenCalledWith(IPC.SessionState, 't1', 'waiting')
  })

  it('UserPromptSubmit => état active poussé au renderer', () => {
    const { ctx, fire } = fakeCtx()
    createAgentsModule().register(ctx)
    fire({ hook_event_name: 'SessionStart', tabId: 't1', session_id: 's1', transcript_path: 'C:/p/s1.jsonl' })
    fire({ hook_event_name: 'UserPromptSubmit', tabId: 't1' })
    expect(ctx.sender.send).toHaveBeenCalledWith(IPC.SessionState, 't1', 'active')
  })

  it('ignore proprement un exit pour un tab sans watcher', () => {
    const { ctx, exit } = fakeCtx()
    createAgentsModule().register(ctx)
    expect(() => exit('t-inconnu', 0)).not.toThrow()
  })

  it('SubagentStop => notifie le renderer (AgentDone) avec agent_id', () => {
    const { ctx, fire } = fakeCtx()
    createAgentsModule().register(ctx)
    fire({ hook_event_name: 'SubagentStop', tabId: 't1', agent_id: 'ag1' })
    expect(ctx.sender.send).toHaveBeenCalledWith(IPC.AgentDone, 't1', 'ag1')
  })
})
