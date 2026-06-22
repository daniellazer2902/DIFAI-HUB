import { describe, it, expect } from 'vitest'
import { findUrlLinks, urlLinkRanges } from '../src/renderer/src/urlLinks'

describe('urlLinks', () => {
  it('détecte une URL https simple', () => {
    const l = findUrlLinks('Voir https://github.com/org/repo/pull/19 stp')
    expect(l).toHaveLength(1)
    expect(l[0].token).toBe('https://github.com/org/repo/pull/19')
    expect(l[0].href).toBe('https://github.com/org/repo/pull/19')
  })

  it('détecte http et https', () => {
    expect(findUrlLinks('http://example.com')[0].href).toBe('http://example.com')
    expect(findUrlLinks('https://example.com')[0].href).toBe('https://example.com')
  })

  it('normalise www. en https://', () => {
    const l = findUrlLinks('site: www.bluesoft-group.com voila')
    expect(l[0].token).toBe('www.bluesoft-group.com')
    expect(l[0].href).toBe('https://www.bluesoft-group.com')
  })

  it('rogne la ponctuation finale', () => {
    expect(findUrlLinks('rendez-vous sur https://example.com.')[0].token).toBe('https://example.com')
    expect(findUrlLinks('lien (https://example.com/x) ok')[0].token).toBe('https://example.com/x')
    expect(findUrlLinks('fin: https://a.io/path!')[0].token).toBe('https://a.io/path')
  })

  it('conserve une parenthèse appariée dans l\'URL', () => {
    expect(findUrlLinks('https://en.wikipedia.org/wiki/Foo_(bar)')[0].token).toBe('https://en.wikipedia.org/wiki/Foo_(bar)')
  })

  it('détecte plusieurs URLs sur une ligne', () => {
    const l = findUrlLinks('https://a.com et https://b.com')
    expect(l.map((x) => x.token)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('ignore le texte sans URL', () => {
    expect(findUrlLinks('aucun lien ici, juste du texte')).toEqual([])
  })

  it('urlLinkRanges : coordonnées xterm 1-based, end inclusif', () => {
    // "x https://a.io" -> URL commence à l'index 2 (0-based) -> x=3 ; longueur 12 -> end.x=14
    const r = urlLinkRanges('x https://a.io', 5)
    expect(r).toHaveLength(1)
    expect(r[0].range).toEqual({ start: { x: 3, y: 5 }, end: { x: 14, y: 5 } })
    expect(r[0].href).toBe('https://a.io')
  })
})
