import type { SessionRegistry } from './SessionRegistry'

export interface HookEvent {
  hook_event_name?: string
  tabId?: string | null
  session_id?: string
  transcript_path?: string
  agent_id?: string
  agent_type?: string
  agent_transcript_path?: string
  [key: string]: unknown
}

/**
 * Route un event de hook vers le SessionRegistry.
 * Sémantique des états : `active` = Claude travaille (mouline) ; `waiting` = prêt / a
 * fini sa tâche / attend l'utilisateur. UserPromptSubmit relance le travail (active),
 * Stop/Notification le ramènent à l'état prêt (waiting).
 */
export function applyHookEvent(reg: SessionRegistry, e: HookEvent): void {
  const tabId = e.tabId
  if (!tabId) return
  switch (e.hook_event_name) {
    case 'SessionStart':
      if (e.session_id && e.transcript_path) reg.correlate(tabId, e.session_id, e.transcript_path)
      reg.setState(tabId, 'waiting')
      break
    case 'UserPromptSubmit':
      reg.setState(tabId, 'active')
      break
    case 'Stop':
    case 'Notification':
      reg.setState(tabId, 'waiting')
      break
    default:
      break
  }
}
