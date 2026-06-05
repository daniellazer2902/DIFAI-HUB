import { homedir } from 'node:os'
import { join } from 'node:path'

/** Chemin du fichier de config global de Claude Code (respecte CLAUDE_CONFIG_DIR). */
export function claudeConfigPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const dir = env.CLAUDE_CONFIG_DIR
  return dir ? join(dir, '.claude.json') : join(home, '.claude.json')
}

export function isValidClaudeJson(text: string): boolean {
  try { JSON.parse(text); return true } catch { return false }
}

export type GuardAction =
  | { action: 'snapshot'; content: string }
  | { action: 'restore'; content: string }
  | { action: 'noop' }

/**
 * Décide quoi faire face au contenu courant de .claude.json :
 * - valide et différent du dernier bon → on le mémorise (snapshot)
 * - invalide/illisible et on a un dernier bon → on restaure
 * - sinon → rien.
 * Ne propose JAMAIS d'écraser un contenu valide (aucun conflit avec une écriture légitime).
 */
export function decideGuardAction(current: string | null, lastGood: string | null): GuardAction {
  if (current !== null && isValidClaudeJson(current)) {
    return current !== lastGood ? { action: 'snapshot', content: current } : { action: 'noop' }
  }
  if (lastGood !== null) return { action: 'restore', content: lastGood }
  return { action: 'noop' }
}
