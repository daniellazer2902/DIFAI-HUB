import type { TranscriptMatch } from '../shared/ipc'

interface ContentItem { type?: string; text?: string }
interface RawLine { type?: string; message?: { content?: unknown } }

/** Texte lisible d'une ligne de transcript (prompt user ou texte assistant). */
function textOf(line: RawLine): string {
  const c = line.message?.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return (c as ContentItem[])
      .map((it) => (typeof it === 'string' ? it : it?.type === 'text' ? (it.text ?? '') : ''))
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

/** Nombre d'occurrences (non chevauchantes) de `q` (déjà en minuscules) dans `lower`. */
function countOccurrences(lower: string, q: string): number {
  let count = 0
  let at = lower.indexOf(q)
  while (at !== -1) {
    count++
    at = lower.indexOf(q, at + q.length)
  }
  return count
}

/**
 * Recherche un terme dans le transcript brut (JSONL) d'une session Claude.
 * Ne considère que les messages `user` (prompts) et `assistant` (réponses).
 * Renvoie UN résultat par message contenant le terme — avec le texte ENTIER du message
 * et son nombre d'occurrences — au plus `limit` messages, insensible à la casse.
 */
export function searchTranscript(raw: string, query: string, limit = 200): TranscriptMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: TranscriptMatch[] = []
  for (const ln of raw.split('\n')) {
    if (!ln.trim()) continue
    let obj: RawLine
    try { obj = JSON.parse(ln) } catch { continue }
    if (obj.type !== 'user' && obj.type !== 'assistant') continue
    const text = textOf(obj)
    if (!text) continue
    const count = countOccurrences(text.toLowerCase(), q)
    if (count === 0) continue
    out.push({ role: obj.type, text, count })
    if (out.length >= limit) break
  }
  return out
}
