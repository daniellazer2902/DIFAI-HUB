import { describe, it, expect } from 'vitest'
import { buildHooksConfig } from '../src/main/hubHooks'

describe('buildHooksConfig', () => {
  it('génère les hooks pointant vers le script forward', () => {
    const cfg = buildHooksConfig('C:\\app\\hook-forward.mjs') as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>
    }
    const events = Object.keys(cfg.hooks)
    expect(events.sort()).toEqual([
      'Notification', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'SubagentStop', 'UserPromptSubmit'
    ])
    const cmd = cfg.hooks.SessionStart[0].hooks[0]
    expect(cmd.type).toBe('command')
    expect(cmd.command).toContain('hook-forward.mjs')
  })

  it('scope PreToolUse/PostToolUse sur les outils interactifs via matcher', () => {
    const cfg = buildHooksConfig('C:\\app\\hook-forward.mjs') as {
      hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
    }
    expect(cfg.hooks.PreToolUse[0].matcher).toBe('AskUserQuestion|ExitPlanMode')
    expect(cfg.hooks.PostToolUse[0].matcher).toBe('AskUserQuestion|ExitPlanMode')
    expect(cfg.hooks.PreToolUse[0].hooks[0].command).toContain('hook-forward.mjs')
  })
})
