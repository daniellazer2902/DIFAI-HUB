// tests/noteKind.test.ts
import { describe, it, expect } from 'vitest'
import { classifyNoteFile } from '../src/shared/noteKind'

describe('classifyNoteFile', () => {
  it('classe les markdown', () => {
    expect(classifyNoteFile('a.md')).toBe('md')
    expect(classifyNoteFile('a.MARKDOWN')).toBe('md')
  })
  it('classe les images', () => {
    for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
      expect(classifyNoteFile(`x.${e}`)).toBe('image')
    expect(classifyNoteFile('X.PNG')).toBe('image')
  })
  it('classe le html', () => {
    expect(classifyNoteFile('p.html')).toBe('html')
    expect(classifyNoteFile('p.HTM')).toBe('html')
  })
  it('renvoie null pour les types non supportés', () => {
    expect(classifyNoteFile('a.txt')).toBeNull()
    expect(classifyNoteFile('a')).toBeNull()
  })
})
