import type { ConsoleLine, ConsoleLineKind } from '../shared/ipc'
export type { ConsoleLine, ConsoleLineKind }

interface ContentItem { type?: string; text?: string; name?: string; content?: unknown }
interface RawLine { type?: string; message?: { content?: unknown } }

function truncate(s: string, n = 200): string { return s.length > n ? s.slice(0, n - 1) + '…' : s }

function stringify(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : (c as ContentItem)?.text ?? '')).join(' ')
  }
  return ''
}

/** Transforme une ligne brute de transcript d'agent en entrées de console lisibles. */
export function parseTranscriptLine(raw: string): ConsoleLine[] {
  let obj: RawLine
  try { obj = JSON.parse(raw) } catch { return [] }
  const content = obj.message?.content
  const out: ConsoleLine[] = []

  if (obj.type === 'user') {
    if (typeof content === 'string') {
      out.push({ kind: 'prompt', text: truncate(content) })
    } else if (Array.isArray(content)) {
      for (const item of content as ContentItem[]) {
        if (item?.type === 'tool_result') out.push({ kind: 'result', text: truncate(stringify(item.content)) })
      }
    }
  } else if (obj.type === 'assistant' && Array.isArray(content)) {
    for (const item of content as ContentItem[]) {
      if (item?.type === 'text' && item.text) out.push({ kind: 'text', text: truncate(item.text) })
      else if (item?.type === 'tool_use') out.push({ kind: 'tool', text: item.name ?? 'tool' })
    }
  }
  return out
}
