import type { AdoWorkItem } from '../../shared/ipc'

/**
 * Répartit les tâches dans la colonne correspondant à leur état.
 * Garantit une entrée (tableau, éventuellement vide) pour CHAQUE état fourni.
 * Les tâches dont l'état n'est dans aucune colonne sont ignorées (cas rare : Removed).
 */
export function tasksByState(
  tasks: AdoWorkItem[],
  taskStates: string[]
): Record<string, AdoWorkItem[]> {
  const out: Record<string, AdoWorkItem[]> = {}
  for (const st of taskStates) out[st] = []
  for (const t of tasks) {
    if (out[t.state]) out[t.state].push(t)
  }
  return out
}
