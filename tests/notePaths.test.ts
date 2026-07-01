// tests/notePaths.test.ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { isInside, resolveRelativeLink, normNoteKey, resolveWikilink } from '../src/main/notes/paths'

describe('isInside', () => {
  const root = resolve('/vault')
  it('accepte un chemin sous la racine', () => {
    expect(isInside(root, resolve('/vault/sub/a.md'))).toBe(true)
    expect(isInside(root, root)).toBe(true)
  })
  it('rejette un chemin hors racine (path traversal)', () => {
    expect(isInside(root, resolve('/vault/../secret.md'))).toBe(false)
    expect(isInside(root, resolve('/autre/a.md'))).toBe(false)
  })
})

describe('resolveRelativeLink', () => {
  it('résout relativement au dossier du fichier source', () => {
    const from = resolve('/vault/sub/doc.md')
    expect(resolveRelativeLink(from, '../a.md')).toBe(resolve('/vault/a.md'))
    expect(resolveRelativeLink(from, 'img/x.png')).toBe(resolve('/vault/sub/img/x.png'))
  })
})

describe('resolveWikilink', () => {
  const index = { 'a': '/vault/a.md', 'mon doc': '/vault/Mon Doc.md' }
  it('trouve par nom insensible à la casse, ignore #ancre et chemin', () => {
    expect(resolveWikilink(index, 'A')).toBe('/vault/a.md')
    expect(resolveWikilink(index, 'Mon Doc#section')).toBe('/vault/Mon Doc.md')
    expect(resolveWikilink(index, 'folder/a')).toBe('/vault/a.md')
  })
  it('renvoie null si absent', () => {
    expect(resolveWikilink(index, 'inconnu')).toBeNull()
  })
})

describe('normNoteKey', () => {
  it('retire dossier, extension, #ancre et met en minuscules', () => {
    expect(normNoteKey('folder/Mon Doc.md#x')).toBe('mon doc')
  })
})
