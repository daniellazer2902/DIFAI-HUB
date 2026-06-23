// src/main/notes/noteTree.ts
import { join } from 'node:path'
import type { NoteTreeNode, NotesTree } from '../../shared/ipc'
import { classifyNoteFile } from '../../shared/noteKind'

export interface DirEntry { name: string; dir: boolean }
export type ListDir = (dir: string) => DirEntry[]

const IGNORED_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules'])
const MD_RE = /\.(md|markdown)$/i

function isIgnoredDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name)
}

function noteKey(fileName: string): string {
  return fileName.replace(MD_RE, '').toLowerCase()
}

/** Construit l'arborescence (md/image/html + dossiers) et l'index nom->chemin (md-only, wikilinks). */
export function buildNoteTree(root: string, listDir: ListDir): NotesTree {
  const index: Record<string, string> = {}

  function walk(dir: string, name: string): NoteTreeNode {
    const entries = listDir(dir)
    const dirs = entries.filter((e) => e.dir && !isIgnoredDir(e.name)).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries
      .filter((e) => !e.dir && classifyNoteFile(e.name) !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
    const children: NoteTreeNode[] = []
    for (const d of dirs) children.push(walk(join(dir, d.name), d.name))
    for (const f of files) {
      const path = join(dir, f.name)
      const kind = classifyNoteFile(f.name)!
      children.push({ name: f.name, path, dir: false, kind })
      if (kind === 'md') {
        const key = noteKey(f.name)
        const prev = index[key]
        if (!prev || path.length < prev.length) index[key] = path
      }
    }
    return { name, path: dir, dir: true, children }
  }

  return { root, tree: walk(root, root), index }
}
