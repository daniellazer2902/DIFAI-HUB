import type { RunRecord } from '../../shared/ipc'
import { countsAsActive } from '../../shared/runStatus'

export interface RunSummary { active: number; attention: number; pending: number }

/** `pending` attend un feu vert humain : ce n'est pas une exécution en cours. */
export function summarizeRuns(runs: Record<string, RunRecord>): RunSummary {
  const list = Object.values(runs)
  return {
    active: list.filter((r) => countsAsActive(r.status)).length,
    attention: list.filter((r) => r.status === 'attention').length,
    pending: list.filter((r) => r.status === 'pending').length
  }
}
