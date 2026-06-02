import { dirname, join } from 'node:path'

/** <dir(transcript)>/<sessionId>/subagents */
export function subagentsDir(transcriptPath: string, sessionId: string): string {
  return join(dirname(transcriptPath), sessionId, 'subagents')
}

/**
 * À partir du texte complet d'un .jsonl et du nombre de lignes déjà vues,
 * renvoie les nouvelles lignes COMPLÈTES (terminées par \n) et le nouveau compte.
 * Une dernière ligne partielle (sans \n) est ignorée jusqu'à ce qu'elle soit complète.
 */
export function newCompleteLines(text: string, seen: number): { lines: string[]; count: number } {
  const lastNl = text.lastIndexOf('\n')
  if (lastNl === -1) return { lines: [], count: seen }
  const complete = text.slice(0, lastNl)
  const all = complete.split('\n').filter((l) => l.trim().length > 0)
  if (all.length <= seen) return { lines: [], count: all.length }
  return { lines: all.slice(seen), count: all.length }
}
