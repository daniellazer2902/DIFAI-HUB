import { describe, it, expect } from 'vitest'
import { soundForTransition } from '../src/renderer/src/sound'

describe('soundForTransition', () => {
  it('fin de génération (-> attention) => waiting (alerte)', () => {
    expect(soundForTransition('active', 'attention')).toBe('waiting')
  })
  it('session prête au démarrage (starting -> waiting) => waiting', () => {
    expect(soundForTransition('starting', 'waiting')).toBe('waiting')
  })
  it('accusé « vu » (attention -> waiting) => null (silencieux)', () => {
    expect(soundForTransition('attention', 'waiting')).toBeNull()
  })
  it('entrée en done => done', () => {
    expect(soundForTransition('active', 'done')).toBe('done')
  })
  it('pas de changement => null', () => {
    expect(soundForTransition('waiting', 'waiting')).toBeNull()
  })
  it('transition neutre => null', () => {
    expect(soundForTransition('starting', 'active')).toBeNull()
  })
})
