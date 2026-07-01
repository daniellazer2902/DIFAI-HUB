// tests/notesReadRaw.test.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readHtmlRaw } from '../src/main/notes/htmlRaw'

const ROOT = join('/', 'v')
const ok = (size: number, content: string) => ({
  read: (_p: string) => content,
  size: (_p: string) => size
})

describe('readHtmlRaw', () => {
  it('lit un .html sous le root', () => {
    const p = join(ROOT, 'page.html')
    const r = readHtmlRaw(ROOT, p, ok(100, '<h1>hi</h1>'))
    expect(r).toEqual({ ok: true, data: { path: p, content: '<h1>hi</h1>' } })
  })
  it('refuse un chemin hors root', () => {
    const r = readHtmlRaw(ROOT, join('/', 'other', 'x.html'), ok(10, 'x'))
    expect(r.ok).toBe(false)
  })
  it('refuse un fichier non-html', () => {
    const r = readHtmlRaw(ROOT, join(ROOT, 'a.md'), ok(10, 'x'))
    expect(r.ok).toBe(false)
  })
  it('refuse au-delà de la borne de taille', () => {
    const p = join(ROOT, 'big.html')
    const r = readHtmlRaw(ROOT, p, ok(11 * 1024 * 1024, 'x'))
    expect(r.ok).toBe(false)
  })
})
