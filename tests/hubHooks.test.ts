import { describe, it, expect } from 'vitest'
import { buildHooksConfig } from '../src/main/hubHooks'

describe('buildHooksConfig', () => {
  it('génère les 4 hooks pointant vers le script forward', () => {
    const cfg = buildHooksConfig('C:\\app\\hook-forward.mjs') as {
      hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>
    }
    const events = Object.keys(cfg.hooks)
    expect(events.sort()).toEqual(['Notification', 'SessionStart', 'Stop', 'SubagentStop'])
    const cmd = cfg.hooks.SessionStart[0].hooks[0]
    expect(cmd.type).toBe('command')
    expect(cmd.command).toContain('hook-forward.mjs')
  })
})
