import { describe, it, expect } from 'vitest'
import { parseClaudeArgs } from '../src/renderer/src/claudeArgs'

describe('parseClaudeArgs', () => {
  it('retire le préfixe claude optionnel', () => {
    expect(parseClaudeArgs('claude --dangerously-skip-permissions')).toEqual(['--dangerously-skip-permissions'])
  })
  it('fonctionne sans préfixe', () => {
    expect(parseClaudeArgs('--dangerously-skip-permissions')).toEqual(['--dangerously-skip-permissions'])
  })
  it('plusieurs arguments', () => {
    expect(parseClaudeArgs('claude --model opus --verbose')).toEqual(['--model', 'opus', '--verbose'])
  })
  it('gère les guillemets (chemins avec espaces)', () => {
    expect(parseClaudeArgs('claude --add-dir "C:\\mes projets"')).toEqual(['--add-dir', 'C:\\mes projets'])
  })
  it('insensible à la casse pour le préfixe', () => {
    expect(parseClaudeArgs('Claude --foo')).toEqual(['--foo'])
  })
  it('chaîne vide → aucun argument', () => {
    expect(parseClaudeArgs('   ')).toEqual([])
  })
  it('« claude » seul → aucun argument', () => {
    expect(parseClaudeArgs('claude')).toEqual([])
  })
})
