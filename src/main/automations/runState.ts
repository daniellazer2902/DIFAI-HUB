import type { RunStatus } from '../../shared/ipc'

const INTERACTIFS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const TERMINES = new Set<RunStatus>(['done', 'failed'])

/**
 * Traduit un événement de hook en statut de run. `null` = pas de changement.
 * `Stop` signale la fin d'un tour, pas la fin du run : la session reste ouverte et attend.
 * Seule la sortie du processus termine un run (voir statusFromExit).
 */
export function statusFromHook(eventName: string, toolName: string | undefined, current: RunStatus): RunStatus | null {
  if (TERMINES.has(current)) return null
  switch (eventName) {
    case 'UserPromptSubmit':
      return 'running'
    case 'Stop':
    case 'Notification':
      return 'attention'
    case 'PreToolUse':
      return INTERACTIFS.has(toolName ?? '') ? 'attention' : null
    case 'PostToolUse':
      return INTERACTIFS.has(toolName ?? '') ? 'running' : null
    default:
      return null
  }
}

export function statusFromExit(code: number): RunStatus {
  return code === 0 ? 'done' : 'failed'
}
