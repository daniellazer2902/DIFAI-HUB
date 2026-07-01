import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Outils interactifs où Claude se met en pause pour attendre une réponse de l'utilisateur. */
export const INTERACTIVE_TOOLS_MATCHER = 'AskUserQuestion|ExitPlanMode'

/** Construit l'objet settings de hooks pointant vers le script forward. */
export function buildHooksConfig(forwardScriptPath: string): object {
  const cmd = { type: 'command', command: `node "${forwardScriptPath}"` }
  const entry = [{ hooks: [cmd] }]
  // Scopé par matcher : on ne POSTe que sur les outils interactifs, sinon un process
  // node serait lancé à chaque appel d'outil.
  const interactive = [{ matcher: INTERACTIVE_TOOLS_MATCHER, hooks: [cmd] }]
  return {
    hooks: {
      SessionStart: entry,
      UserPromptSubmit: entry,
      Stop: entry,
      Notification: entry,
      SubagentStop: entry,
      PreToolUse: interactive,
      PostToolUse: interactive
    }
  }
}

/** Écrit hub-hooks.json dans `dir` et renvoie son chemin. */
export function writeHooksSettings(dir: string, forwardScriptPath: string): string {
  const path = join(dir, 'hub-hooks.json')
  writeFileSync(path, JSON.stringify(buildHooksConfig(forwardScriptPath), null, 2), 'utf8')
  return path
}
