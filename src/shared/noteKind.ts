export type NoteKind = 'md' | 'image' | 'html'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

/** Classe un fichier par extension. null = type non pris en charge par le lecteur. */
export function classifyNoteFile(path: string): NoteKind | null {
  const m = /\.([a-z0-9]+)$/i.exec(path)
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'md'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (IMAGE_EXT.has(ext)) return 'image'
  return null
}
