/** Outils où la session se met en pause pour attendre une réponse de l'utilisateur. */
export const INTERACTIVE_TOOLS = ['AskUserQuestion', 'ExitPlanMode'] as const

export function isInteractiveTool(name?: string): boolean {
  return INTERACTIVE_TOOLS.includes(name as typeof INTERACTIVE_TOOLS[number])
}
