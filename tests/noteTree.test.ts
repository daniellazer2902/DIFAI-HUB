import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { buildNoteTree, type DirEntry } from '../src/main/notes/noteTree'

const V = join('/', 'v')        // sépérateur natif (\v sur Windows, /v sur POSIX)
const SUB = join(V, 'sub')

const fsMap: Record<string, DirEntry[]> = {
  [V]: [
    { name: 'b.md', dir: false },
    { name: 'a.md', dir: false },
    { name: 'sub', dir: true },
    { name: '.obsidian', dir: true },
    { name: 'image.png', dir: false },
    { name: 'notes.txt', dir: false }
  ],
  [SUB]: [{ name: 'a.md', dir: false }]
}
const listDir = (dir: string): DirEntry[] => fsMap[dir] ?? []

describe('buildNoteTree', () => {
  it('ne garde que les .md et les dossiers, dossiers en premier puis tri alpha', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.map((c) => c.name)).toEqual(['sub', 'a.md', 'b.md'])
  })

  it('ignore .obsidian et les dotfolders', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.some((c) => c.name === '.obsidian')).toBe(false)
  })

  it('construit un index nom->chemin, plus court chemin en cas de collision', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.index['a']).toBe(join(V, 'a.md'))
    expect(t.index['b']).toBe(join(V, 'b.md'))
  })
})
