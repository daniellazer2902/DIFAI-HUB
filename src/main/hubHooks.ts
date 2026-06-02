import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Construit l'objet settings de hooks (4 events) pointant vers le script forward. */
export function buildHooksConfig(forwardScriptPath: string): object {
  const entry = [{ hooks: [{ type: 'command', command: `node "${forwardScriptPath}"` }] }]
  return {
    hooks: {
      SessionStart: entry,
      Stop: entry,
      Notification: entry,
      SubagentStop: entry
    }
  }
}

/** Écrit hub-hooks.json dans `dir` et renvoie son chemin. */
export function writeHooksSettings(dir: string, forwardScriptPath: string): string {
  const path = join(dir, 'hub-hooks.json')
  writeFileSync(path, JSON.stringify(buildHooksConfig(forwardScriptPath), null, 2), 'utf8')
  return path
}
