import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { claudeConfigPath, isValidClaudeJson, decideGuardAction } from '../src/main/claudeConfigGuard'

describe('claudeConfigGuard', () => {
  it('claudeConfigPath utilise CLAUDE_CONFIG_DIR si défini', () => {
    expect(claudeConfigPath({ CLAUDE_CONFIG_DIR: 'C:/cfg' } as never, 'C:/home')).toBe(join('C:/cfg', '.claude.json'))
  })
  it('claudeConfigPath retombe sur le home sinon', () => {
    expect(claudeConfigPath({} as never, 'C:/home')).toBe(join('C:/home', '.claude.json'))
  })

  it('isValidClaudeJson', () => {
    expect(isValidClaudeJson('{"a":1}')).toBe(true)
    expect(isValidClaudeJson('{"a":1}garbage')).toBe(false)
    expect(isValidClaudeJson('')).toBe(false)
  })

  it('valide et différent du dernier bon → snapshot', () => {
    expect(decideGuardAction('{"a":1}', '{"a":0}')).toEqual({ action: 'snapshot', content: '{"a":1}' })
  })
  it('valide et identique → noop', () => {
    expect(decideGuardAction('{"a":1}', '{"a":1}')).toEqual({ action: 'noop' })
  })
  it('valide sans dernier bon → snapshot', () => {
    expect(decideGuardAction('{"a":1}', null)).toEqual({ action: 'snapshot', content: '{"a":1}' })
  })
  it('invalide avec dernier bon → restore', () => {
    expect(decideGuardAction('{"a":1}xx', '{"a":1}')).toEqual({ action: 'restore', content: '{"a":1}' })
  })
  it('illisible (null) avec dernier bon → restore', () => {
    expect(decideGuardAction(null, '{"a":1}')).toEqual({ action: 'restore', content: '{"a":1}' })
  })
  it('invalide sans dernier bon → noop', () => {
    expect(decideGuardAction('{bad', null)).toEqual({ action: 'noop' })
  })
})
