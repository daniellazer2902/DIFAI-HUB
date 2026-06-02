import chokidar, { type FSWatcher } from 'chokidar'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { parseTranscriptLine, type ConsoleLine } from './transcriptParser'
import { newCompleteLines } from './transcriptPaths'

export interface AgentMeta { agentType: string; description: string }
export interface WatcherSink {
  onAgentAdded: (agentId: string, meta: AgentMeta) => void
  onAgentLines: (agentId: string, lines: ConsoleLine[]) => void
}

/** Surveille <session>/subagents/ : meta.json => agent ajouté, .jsonl => lignes live. */
export class TranscriptWatcher {
  private watcher: FSWatcher | null = null
  private readonly seen = new Map<string, number>() // path .jsonl -> lignes déjà émises
  private readonly known = new Set<string>()        // agentId déjà annoncés

  constructor(private readonly sink: WatcherSink) {}

  watch(dir: string): void {
    this.stop()
    this.watcher = chokidar.watch(dir, { ignoreInitial: false, depth: 0 })
    this.watcher.on('add', (p) => this.handle(p))
    this.watcher.on('change', (p) => this.handle(p))
  }

  private handle(path: string): void {
    const name = basename(path)
    const meta = name.match(/^agent-(.+)\.meta\.json$/)
    if (meta) return this.handleMeta(path, meta[1])
    const jsonl = name.match(/^agent-(.+)\.jsonl$/)
    if (jsonl) return this.handleJsonl(path, jsonl[1])
  }

  private handleMeta(path: string, agentId: string): void {
    if (this.known.has(agentId)) return
    try {
      const m = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentMeta>
      this.known.add(agentId)
      this.sink.onAgentAdded(agentId, { agentType: m.agentType ?? 'agent', description: m.description ?? '' })
    } catch { /* fichier en cours d'écriture : réessayé au prochain event */ }
  }

  private handleJsonl(path: string, agentId: string): void {
    try {
      if (statSync(path).size === 0) return
      const text = readFileSync(path, 'utf8')
      const { lines, count } = newCompleteLines(text, this.seen.get(path) ?? 0)
      this.seen.set(path, count)
      const parsed = lines.flatMap(parseTranscriptLine)
      if (parsed.length) this.sink.onAgentLines(agentId, parsed)
    } catch { /* ignore */ }
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    this.seen.clear()
    this.known.clear()
  }
}
