import { describe, it, expect } from 'vitest'
import { basename } from '../src/renderer/src/util'

describe('basename', () => {
  it('extrait le dernier segment (Windows)', () => {
    expect(basename('C:\\Users\\dan\\projet')).toBe('projet')
  })
  it('extrait le dernier segment (slash) et ignore le slash final', () => {
    expect(basename('C:/Users/dan/projet/')).toBe('projet')
  })
  it('renvoie l\'entrée si pas de séparateur', () => {
    expect(basename('projet')).toBe('projet')
  })
})
