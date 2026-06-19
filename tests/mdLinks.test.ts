import { describe, it, expect } from 'vitest'
import { findMdLinks } from '../src/renderer/src/mdLinks'

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
