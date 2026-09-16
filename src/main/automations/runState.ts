import type { RunStatus } from '../../shared/ipc'
import { isInteractiveTool } from '../interactiveTools'
import { isTerminal } from '../../shared/runStatus'

/**
 * Traduit un événement de hook en statut de run. `null` = pas de changement.
 * `Stop` signale la fin d'un tour, pas la fin du run : la session reste ouverte et attend.
 * Seule la sortie du processus termine un run (voir statusFromExit).
 */
export function statusFromHook(eventName: string, toolName: string | undefined, current: RunStatus): RunStatus | null {
  if (isTerminal(current)) return null
  switch (eventName) {
    case 'UserPromptSubmit':
      return 'running'
    case 'Stop':
    case 'Notification':
      return 'attention'
    case 'PreToolUse':
      return isInteractiveTool(toolName) ? 'attention' : null
    case 'PostToolUse':
      // Une validation de permission relance la session sans passer par un prompt : toute fin
      // d'outil sort donc de l'attente, sinon le run garderait un créneau pour rien.
      return current === 'attention' ? 'running' : null
    default:
      return null
  }
}

export function statusFromExit(code: number): RunStatus {
  return code === 0 ? 'done' : 'failed'
}
