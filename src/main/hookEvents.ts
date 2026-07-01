import type { SessionRegistry } from './SessionRegistry'

export interface HookEvent {
  hook_event_name?: string
  tabId?: string | null
  session_id?: string
  transcript_path?: string
  tool_name?: string
  agent_id?: string
  agent_type?: string
  agent_transcript_path?: string
  [key: string]: unknown
}

/** Outils où Claude se met en pause pour attendre une réponse de l'utilisateur. */
function isInteractiveTool(name?: string): boolean {
  return name === 'AskUserQuestion' || name === 'ExitPlanMode'
}

/**
 * Route un event de hook vers le SessionRegistry.
 * Sémantique des états : `active` = Claude travaille (mouline) ; `attention` = a fini de
 * générer mais l'utilisateur ne l'a pas encore vu ; `waiting` = prêt / vu. UserPromptSubmit
 * relance le travail (active), Stop/Notification signalent la fin (attention) — c'est le
 * renderer qui repasse à `waiting` quand l'utilisateur focus la console (accusé « vu »).
 * Cas particulier : un outil interactif (AskUserQuestion/ExitPlanMode) met Claude en
 * pause sans terminer le tour — `PreToolUse` signale l'attente (attention), `PostToolUse`
 * la reprise (active) une fois l'utilisateur a répondu.
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
      reg.setState(tabId, 'attention')
      break
    case 'PreToolUse':
      // Claude pose une question / présente un plan → il attend l'utilisateur.
      if (isInteractiveTool(e.tool_name)) reg.setState(tabId, 'attention')
      break
    case 'PostToolUse':
      // L'utilisateur a répondu → Claude reprend le travail.
      if (isInteractiveTool(e.tool_name)) reg.setState(tabId, 'active')
      break
    default:
      break
  }
}
