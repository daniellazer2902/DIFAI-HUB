// src/main/notes/htmlRaw.ts
import { isInside } from './paths'
import type { NotesResult, NoteRaw } from '../../shared/ipc'

const HTML_RE = /\.(html|htm)$/i
const MAX_BYTES = 10 * 1024 * 1024 // 10 Mo

export interface RawFs {
  read: (path: string) => string
  size: (path: string) => number
}

/** Lecture brute d'un fichier .html borné, sous garde isInside. Fonction pure (fs injecté) pour test. */
export function readHtmlRaw(root: string, path: string, fs: RawFs): NotesResult<NoteRaw> {
  if (!isInside(root, path) || !HTML_RE.test(path)) return { ok: false, error: 'Chemin hors vault ou non-HTML' }
  try {
    if (fs.size(path) > MAX_BYTES) return { ok: false, error: 'Fichier HTML trop volumineux' }
    return { ok: true, data: { path, content: fs.read(path) } }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
