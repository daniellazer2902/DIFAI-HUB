import { describe, it, expect } from 'vitest'
import { findMdLinks, mdLinkRanges } from '../src/renderer/src/mdLinks'

const tokens = (s: string): string[] => findMdLinks(s).map((l) => l.token)

describe('findMdLinks', () => {
  it('chemin absolu Windows', () => {
    expect(tokens('écrit dans C:\\Users\\d\\docs\\rapport.md.')).toEqual(['C:\\Users\\d\\docs\\rapport.md'])
  })
  it('chemin absolu POSIX', () => {
    expect(tokens('voir /home/d/r.md')).toEqual(['/home/d/r.md'])
  })
  it('chemin relatif', () => {
    expect(tokens('cf docs/superpowers/specs/2026-06-19-x-design.md')).toEqual(['docs/superpowers/specs/2026-06-19-x-design.md'])
  })
  it('relatif avec ./ et ../', () => {
    expect(tokens('./a.md et ../b.markdown')).toEqual(['./a.md', '../b.markdown'])
  })
  it('nettoie backticks et guillemets', () => {
    expect(tokens('le fichier `rapport.md` et "notes.md"')).toEqual(['rapport.md', 'notes.md'])
  })
  it('nettoie parenthèses et ponctuation finale', () => {
    expect(tokens('(voir x.md), puis y.md;')).toEqual(['x.md', 'y.md'])
  })
  it('plusieurs sur une ligne', () => {
    expect(tokens('a.md b.md').length).toBe(2)
  })
  it('ignore les non-.md et .md5', () => {
    expect(tokens('script.ts, hash.md5, image.png')).toEqual([])
  })
  it('renvoie les bornes du token nettoyé', () => {
    const [l] = findMdLinks('x `a.md`')
    expect('x `a.md`'.slice(l.start, l.end)).toBe('a.md')
  })
})

describe('chemins avec espaces', () => {
  it('chemin absolu Windows avec un espace dans un dossier', () => {
    expect(tokens('rapport dans C:\\Users\\dg\\BE.WEAPON\\av vente\\ESTIMATION_CLAUDE_BE.WEAPON_DG.md'))
      .toEqual(['C:\\Users\\dg\\BE.WEAPON\\av vente\\ESTIMATION_CLAUDE_BE.WEAPON_DG.md'])
  })
  it('chemin POSIX avec espace', () => {
    expect(tokens('voir /home/d/av vente/r.md')).toEqual(['/home/d/av vente/r.md'])
  })
  it('relatif ancré ./ avec espace', () => {
    expect(tokens('cf ./av vente/r.md ok')).toEqual(['./av vente/r.md'])
  })
  it('relatif avec espace via backticks', () => {
    expect(tokens('le fichier `av vente\\r.md` existe')).toEqual(['av vente\\r.md'])
  })
  it('relatif avec espace via guillemets', () => {
    expect(tokens('ouvre "av vente/notes.md" stp')).toEqual(['av vente/notes.md'])
  })
  it('borne correcte d\'un chemin ancré avec espace', () => {
    const s = 'x C:\\a b\\f.md y'
    const [l] = findMdLinks(s)
    expect(s.slice(l.start, l.end)).toBe('C:\\a b\\f.md')
  })
})

describe('mdLinkRanges', () => {
  it('mappe le token en coordonnées xterm 1-based (end.x inclusif)', () => {
    const r = mdLinkRanges('voir docs/r.md', 3)
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe('docs/r.md')
    // 'docs/r.md' commence à l'index 5 (0-based) -> start.x = 6 ; longueur 9 -> end.x = 14
    expect(r[0].range).toEqual({ start: { x: 6, y: 3 }, end: { x: 14, y: 3 } })
  })
  it('aucun lien -> tableau vide', () => {
    expect(mdLinkRanges('rien ici', 1)).toEqual([])
  })
})
