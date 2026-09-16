import { describe, it, expect } from 'vitest'
import { statusFromHook, statusFromExit } from '../src/main/automations/runState'

describe('statusFromHook', () => {
  it('UserPromptSubmit remet le run en cours', () => {
    expect(statusFromHook('UserPromptSubmit', undefined, 'attention')).toBe('running')
  })

  it('Stop met le run en attente : la session a fini de parler mais reste ouverte', () => {
    expect(statusFromHook('Stop', undefined, 'running')).toBe('attention')
  })

  it('Notification met le run en attente', () => {
    expect(statusFromHook('Notification', undefined, 'running')).toBe('attention')
  })

  it('PreToolUse sur AskUserQuestion met le run en attente', () => {
    expect(statusFromHook('PreToolUse', 'AskUserQuestion', 'running')).toBe('attention')
  })

  it('PreToolUse sur ExitPlanMode met le run en attente', () => {
    expect(statusFromHook('PreToolUse', 'ExitPlanMode', 'running')).toBe('attention')
  })

  it('PreToolUse sur un outil ordinaire ne change rien', () => {
    expect(statusFromHook('PreToolUse', 'Read', 'running')).toBeNull()
  })

  it('PostToolUse sur un outil interactif relance le run', () => {
    expect(statusFromHook('PostToolUse', 'AskUserQuestion', 'attention')).toBe('running')
  })

  it('PostToolUse sur un outil ordinaire sort le run de l attente (validation de permission)', () => {
    expect(statusFromHook('PostToolUse', 'Bash', 'attention')).toBe('running')
  })

  it('PostToolUse ne change rien sur un run déjà en cours', () => {
    expect(statusFromHook('PostToolUse', 'Read', 'running')).toBeNull()
  })

  it('un run terminé n est plus modifié par un hook tardif', () => {
    expect(statusFromHook('Stop', undefined, 'done')).toBeNull()
    expect(statusFromHook('Stop', undefined, 'failed')).toBeNull()
  })

  it('UserPromptSubmit ne ressuscite pas un run terminé', () => {
    expect(statusFromHook('UserPromptSubmit', undefined, 'done')).toBeNull()
    expect(statusFromHook('UserPromptSubmit', undefined, 'failed')).toBeNull()
  })

  it('PostToolUse sur un outil interactif ne ressuscite pas un run terminé', () => {
    expect(statusFromHook('PostToolUse', 'AskUserQuestion', 'done')).toBeNull()
    expect(statusFromHook('PostToolUse', 'AskUserQuestion', 'failed')).toBeNull()
  })
})

describe('statusFromExit', () => {
  it('code 0 termine le run', () => { expect(statusFromExit(0)).toBe('done') })
  it('code non nul fait échouer le run', () => { expect(statusFromExit(1)).toBe('failed') })
})
