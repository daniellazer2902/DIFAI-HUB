import { describe, it, expect } from 'vitest'
import { soundForTransition } from '../src/renderer/src/sound'

describe('soundForTransition', () => {
  it('entrée en waiting => waiting', () => {
    expect(soundForTransition('active', 'waiting')).toBe('waiting')
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
