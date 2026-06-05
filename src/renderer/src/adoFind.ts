import type { AdoWorkItem } from '../../shared/ipc'

export interface Seg { text: string; hit: boolean }

/** Découpe `text` en segments, en marquant (`hit`) les occurrences de `q` (insensible à la casse). */
export function splitHighlight(text: string, q: string): Seg[] {
  if (!q) return [{ text, hit: false }]
  const segs: Seg[] = []
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(ql, i)
    if (idx < 0) { segs.push({ text: text.slice(i), hit: false }); break }
    if (idx > i) segs.push({ text: text.slice(i, idx), hit: false })
    segs.push({ text: text.slice(idx, idx + ql.length), hit: true })
    i = idx + ql.length
  }
  return segs
}

/** Un work item matche si le terme apparaît dans son titre, id, assigné ou statut. */
export function itemMatches(wi: AdoWorkItem, q: string): boolean {
  if (!q) return false
  const ql = q.toLowerCase()
  return (
    wi.title.toLowerCase().includes(ql) ||
    String(wi.id).includes(ql) ||
    (wi.assignedTo?.toLowerCase().includes(ql) ?? false) ||
    wi.state.toLowerCase().includes(ql)
  )
}

/** Mode filtre : une US est visible si elle-même matche ou une de ses tâches matche. */
export function storyVisible(story: AdoWorkItem, tasks: AdoWorkItem[], q: string): boolean {
  if (!q) return true
  return itemMatches(story, q) || tasks.some((t) => itemMatches(t, q))
}
