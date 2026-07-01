import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { buildNoteTree, type DirEntry } from '../src/main/notes/noteTree'

const V = join('/', 'v')        // séparateur natif (\v sur Windows, /v sur POSIX)
const SUB = join(V, 'sub')

const fsMap: Record<string, DirEntry[]> = {
  [V]: [
    { name: 'b.md', dir: false },
    { name: 'a.md', dir: false },
    { name: 'sub', dir: true },
    { name: '.obsidian', dir: true },
    { name: 'image.png', dir: false },
    { name: 'page.html', dir: false },
    { name: 'notes.txt', dir: false }
  ],
  [SUB]: [{ name: 'a.md', dir: false }]
}
const listDir = (dir: string): DirEntry[] => fsMap[dir] ?? []

describe('buildNoteTree', () => {
  it('garde md/image/html + dossiers, dossiers en premier puis tri alpha', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.map((c) => c.name)).toEqual(['sub', 'a.md', 'b.md', 'image.png', 'page.html'])
  })

  it('exclut les types non supportés (.txt)', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.some((c) => c.name === 'notes.txt')).toBe(false)
  })

  it('renseigne kind sur les fichiers', () => {
    const t = buildNoteTree(V, listDir)
    const byName = Object.fromEntries(t.tree.children!.map((c) => [c.name, c]))
    expect(byName['a.md'].kind).toBe('md')
    expect(byName['image.png'].kind).toBe('image')
    expect(byName['page.html'].kind).toBe('html')
    expect(byName['sub'].kind).toBeUndefined()
  })

  it('ignore .obsidian et les dotfolders', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.some((c) => c.name === '.obsidian')).toBe(false)
  })

  it('index nom->chemin md-only (pas image/html), plus court chemin si collision', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.index['a']).toBe(join(V, 'a.md'))
    expect(t.index['b']).toBe(join(V, 'b.md'))
    expect(t.index['image']).toBeUndefined()
    expect(t.index['page']).toBeUndefined()
  })
})
