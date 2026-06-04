import { describe, it, expect } from 'vitest'
import { darken, textOn, PALETTE } from '../src/renderer/src/color'

describe('darken', () => {
  it('assombrit et reste un hex #rrggbb', () => {
    const d = darken('#3a7bd0')
    expect(d).toMatch(/^#[0-9a-f]{6}$/)
    expect(d).not.toBe('#3a7bd0')
    expect(parseInt(d.slice(1, 3), 16)).toBeLessThanOrEqual(0x3a)
  })
  it('#000000 reste noir', () => {
    expect(darken('#000000')).toBe('#000000')
  })
})

describe('textOn', () => {
  it('texte sombre sur couleur claire', () => {
    expect(textOn('#ffffff')).toBe('#1e1e1e')
    expect(textOn('#b8902a')).toBe('#1e1e1e')
  })
  it('texte blanc sur couleur foncée', () => {
    expect(textOn('#000000')).toBe('#ffffff')
    expect(textOn('#3a7bd0')).toBe('#ffffff')
  })
})

describe('PALETTE', () => {
  it('8 hex valides', () => {
    expect(PALETTE).toHaveLength(8)
    PALETTE.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/))
  })
})
