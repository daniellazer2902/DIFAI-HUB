import chokidar, { type FSWatcher } from 'chokidar'
import { readFileSync } from 'node:fs'
import type { ConsoleLine } from './transcriptParser'
import { newCompleteLines } from './transcriptPaths'

export interface ShellSink {
  /** Un shell background a été lancé. `title` = ligne principale (description), `detail` = commande. */
  onShellAdded: (taskId: string, title: string, detail: string) => void
  onShellLines: (taskId: string, lines: ConsoleLine[]) => void
  onShellDone: (taskId: string, failed: boolean) => void
}

interface ToolInfo { description: string; command: string }
interface ContentItem { type?: string; text?: string; name?: string; id?: string; tool_use_id?: string; input?: Record<string, unknown>; content?: unknown }
interface RawLine { type?: string; message?: { content?: unknown } }

// "Command running in background with ID: <id>. Output is being written to: <path>.output"
const BG_RE = /running in background with ID:\s*(\S+?)\.\s+Output is being written to:\s*(.+?\.output)/i
const TASK_ID_RE = /<task-id>([^<]+)<\/task-id>/
const STATUS_RE = /<status>([^<]+)<\/status>/

function truncate(s: string, n = 200): string { return s.length > n ? s.slice(0, n - 1) + '…' : s }

function stringify(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : (c as ContentItem)?.text ?? '')).join(' ')
  return ''
}

/**
 * Surveille les shells lancés en tâche de fond (`run_in_background`) d'une session.
 * Source : le transcript principal annonce chaque lancement via un tool_result contenant
 * l'ID de tâche ET le chemin exact du fichier `.output` — on n'a donc rien à deviner.
 * On corrèle le libellé via le tool_use précédent (champ `description`/`command`), puis on
 * tail le `.output`. La fin est détectée via le bloc `<task-notification>` (statut).
 */
export class ShellWatcher {
  private transcriptWatcher: FSWatcher | null = null
  private outputWatcher: FSWatcher | null = null
  private transcriptPath = ''
  private seenLines = 0
  private readonly toolInfo = new Map<string, ToolInfo>()      // tool_use_id -> {description, command}
  private readonly tasks = new Map<string, { outputPath: string; seen: number }>() // taskId -> tail state
  private readonly outputToTask = new Map<string, string>()    // outputPath -> taskId
  private readonly done = new Set<string>()

  constructor(private readonly sink: ShellSink) {}

  watch(transcriptPath: string): void {
    this.stop()
    this.transcriptPath = transcriptPath
    this.outputWatcher = chokidar.watch([], { ignoreInitial: false })
    this.outputWatcher.on('add', (p) => this.readOutput(p))
    this.outputWatcher.on('change', (p) => this.readOutput(p))
    this.parseTranscript() // rattrape les shells déjà lancés dans cette session
    this.transcriptWatcher = chokidar.watch(transcriptPath, { ignoreInitial: true })
    this.transcriptWatcher.on('change', () => this.parseTranscript())
    this.transcriptWatcher.on('add', () => this.parseTranscript())
  }

  private parseTranscript(): void {
    try {
      const text = readFileSync(this.transcriptPath, 'utf8')
      const { lines, count } = newCompleteLines(text, this.seenLines)
      this.seenLines = count
      for (const raw of lines) this.parseLine(raw)
    } catch { /* fichier en cours d'écriture : réessayé au prochain event */ }
  }

  private parseLine(raw: string): void {
    if (raw.includes('<task-notification>')) this.handleNotification(raw)
    let obj: RawLine
    try { obj = JSON.parse(raw) } catch { return }
    const content = obj.message?.content
    if (!Array.isArray(content)) return

    if (obj.type === 'assistant') {
      for (const item of content as ContentItem[]) {
        if (item?.type === 'tool_use' && item.id && item.input && typeof item.input.command === 'string') {
          this.toolInfo.set(item.id, {
            description: typeof item.input.description === 'string' ? item.input.description : '',
            command: item.input.command as string
          })
        }
      }
    } else if (obj.type === 'user') {
      for (const item of content as ContentItem[]) {
        if (item?.type !== 'tool_result') continue
        const m = BG_RE.exec(stringify(item.content))
        if (!m) continue
        const taskId = m[1]
        const outputPath = m[2].trim()
        if (this.tasks.has(taskId)) continue
        const info = item.tool_use_id ? this.toolInfo.get(item.tool_use_id) : undefined
        const title = info?.description?.trim() || info?.command?.trim() || taskId
        const detail = info?.command?.trim() || ''
        this.tasks.set(taskId, { outputPath, seen: 0 })
        this.outputToTask.set(outputPath, taskId)
        this.sink.onShellAdded(taskId, truncate(title, 120), truncate(detail, 200))
        this.outputWatcher?.add(outputPath)
        this.readOutput(outputPath)
      }
    }
  }

  private handleNotification(raw: string): void {
    const idM = TASK_ID_RE.exec(raw)
    if (!idM) return
    const taskId = idM[1].trim()
    if (this.done.has(taskId)) return
    const status = (STATUS_RE.exec(raw)?.[1] ?? '').trim().toLowerCase()
    this.done.add(taskId)
    this.sink.onShellDone(taskId, status !== 'completed' && status !== 'success' && status !== '')
  }

  private readOutput(path: string): void {
    const taskId = this.outputToTask.get(path)
    if (!taskId) return
    const t = this.tasks.get(taskId)
    if (!t) return
    try {
      const text = readFileSync(path, 'utf8')
      const lastNl = text.lastIndexOf('\n')
      if (lastNl + 1 <= t.seen) return
      const fresh = text.slice(t.seen, lastNl + 1)
      t.seen = lastNl + 1
      const lines: ConsoleLine[] = fresh.split('\n').filter((l) => l.length > 0).map((l) => ({ kind: 'result', text: truncate(l) }))
      if (lines.length) this.sink.onShellLines(taskId, lines)
    } catch { /* ignore */ }
  }

  stop(): void {
    this.transcriptWatcher?.close()
    this.outputWatcher?.close()
    this.transcriptWatcher = null
    this.outputWatcher = null
    this.transcriptPath = ''
    this.seenLines = 0
    this.toolInfo.clear()
    this.tasks.clear()
    this.outputToTask.clear()
    this.done.clear()
  }
}
