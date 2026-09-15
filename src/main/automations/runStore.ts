import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RunRecord, RunStatus } from '../../shared/ipc'

export const MAX_RUNS = 200
const FILE = 'automations.json'
const STATUSES: RunStatus[] = ['pending', 'queued', 'running', 'attention', 'done', 'failed']

/** Clé de déduplication d'un run. L'itération permettra plus tard le re-run sur push. */
export function runKey(project: string, repo: string, prId: number, iterationId: number): string {
  return `${project}/${repo}#${prId}@${iterationId}`
}

function normRun(x: unknown): RunRecord | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.key !== 'string') return null
  return {
    id: o.id,
    automationId: typeof o.automationId === 'string' ? o.automationId : '',
    key: o.key,
    project: typeof o.project === 'string' ? o.project : '',
    repo: typeof o.repo === 'string' ? o.repo : '',
    prId: typeof o.prId === 'number' ? o.prId : 0,
    title: typeof o.title === 'string' ? o.title : '',
    url: typeof o.url === 'string' ? o.url : '',
    startedAt: typeof o.startedAt === 'number' ? o.startedAt : 0,
    endedAt: typeof o.endedAt === 'number' ? o.endedAt : null,
    status: STATUSES.includes(o.status as RunStatus) ? (o.status as RunStatus) : 'failed',
    error: typeof o.error === 'string' ? o.error : null,
    tabId: typeof o.tabId === 'string' ? o.tabId : null
  }
}

export function parseRuns(raw: string): RunRecord[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr.map(normRun).filter(Boolean) as RunRecord[]) : []
  } catch { return [] }
}
export function serializeRuns(list: RunRecord[]): string {
  return JSON.stringify(list, null, 2)
}
export function hasKey(list: RunRecord[], key: string): boolean {
  return list.some((r) => r.key === key)
}
export function upsertRun(list: RunRecord[], run: RunRecord): RunRecord[] {
  const i = list.findIndex((r) => r.id === run.id)
  if (i >= 0) { const copy = [...list]; copy[i] = run; return copy }
  return [run, ...list].slice(0, MAX_RUNS)
}
/** Les sessions ne survivent pas à l'arrêt du processus : tout run non-terminal relu du disque est interrompu. */
export function requalifyRuns(list: RunRecord[]): RunRecord[] {
  return list.map((r) => {
    if (r.status === 'done' || r.status === 'failed') return r
    return {
      ...r,
      status: 'failed',
      endedAt: r.endedAt ?? r.startedAt,
      error: r.error ?? 'Session interrompue à l\'arrêt de l\'application.',
      tabId: null
    }
  })
}

export function loadRuns(dir: string): RunRecord[] {
  try { return requalifyRuns(parseRuns(readFileSync(join(dir, FILE), 'utf8'))) } catch { return [] }
}
export function saveRuns(dir: string, list: RunRecord[]): void {
  try { writeFileSync(join(dir, FILE), serializeRuns(list), 'utf8') } catch { /* disque indisponible */ }
}
