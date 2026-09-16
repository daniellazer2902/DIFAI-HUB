import type { AdoPullRequest, RunRecord } from '../../shared/ipc'
import { runKey, hasKey } from './runStore'

export const MAX_CONCURRENT = 2

export interface TickInput {
  prs: AdoPullRequest[]
  journal: RunRecord[]
  firstTick: boolean
  activeCount: number
}
export interface TickPlan {
  toStart: AdoPullRequest[]
  toPend: AdoPullRequest[]
}

/**
 * Au premier tick suivant l'ouverture de l'application, les PR déjà assignées ne lancent pas de
 * run rétroactif : elles attendent un feu vert, sinon ouvrir l'IDE le matin lancerait toutes les
 * sessions de la journée d'un coup.
 */
export function planTick({ prs, journal, firstTick, activeCount }: TickInput): TickPlan {
  // Itération figée à 0 tant que AdoPullRequest ne la porte pas : re-run après push supposera d'ajouter ce champ.
  const inconnues = prs.filter((p) => !hasKey(journal, runKey(p.project, p.repo, p.prId, 0)))
  if (firstTick) return { toStart: [], toPend: inconnues }
  const creneaux = Math.max(0, MAX_CONCURRENT - activeCount)
  return { toStart: inconnues.slice(0, creneaux), toPend: [] }
}
