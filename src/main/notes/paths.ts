// src/main/notes/paths.ts
import { resolve, dirname, sep } from 'node:path'

/** Vrai si `target` est sous `root` (égal ou descendant), après normalisation. */
export function isInside(root: string, target: string): boolean {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep)
}

/** Résout un lien relatif par rapport au DOSSIER du fichier source (chemin absolu). */
export function resolveRelativeLink(fromFile: string, href: string): string {
  return resolve(dirname(fromFile), href)
}

/** Normalise une cible de wikilink en clé d'index : sans dossier, sans extension, sans #ancre, minuscules. */
export function normNoteKey(target: string): string {
  const noAnchor = target.split('#')[0]
  const base = noAnchor.split(/[\\/]/).pop() ?? noAnchor
  return base.replace(/\.(md|markdown)$/i, '').trim().toLowerCase()
}

/** Résout un wikilink via l'index nom->chemin ; null si introuvable. */
export function resolveWikilink(index: Record<string, string>, target: string): string | null {
  return index[normNoteKey(target)] ?? null
}
