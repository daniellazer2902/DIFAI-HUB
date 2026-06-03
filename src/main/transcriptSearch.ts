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

/** Extrait lisible autour du match (espaces normalisés, ellipses si tronqué). */
function makeSnippet(text: string, at: number, len: number, pad = 50): string {
  const start = Math.max(0, at - pad)
  const end = Math.min(text.length, at + len + pad)
  const core = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + core + (end < text.length ? '…' : '')
}

/**
 * Recherche un terme dans le transcript brut (JSONL) d'une session Claude.
 * Ne considère que les messages `user` (prompts) et `assistant` (réponses).
 * Renvoie au plus `limit` occurrences (une par message), insensible à la casse.
 */
export function searchTranscript(raw: string, query: string, limit = 100): TranscriptMatch[] {
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
    const at = text.toLowerCase().indexOf(q)
    if (at === -1) continue
    out.push({ role: obj.type, snippet: makeSnippet(text, at, q.length) })
    if (out.length >= limit) break
  }
  return out
}
