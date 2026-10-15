import type { RunStatus } from './ipc'

/**
 * Deux notions d'activité cohabitent, et elles ne se recouvrent pas :
 * `countsAsActive` sert à l'affichage et à la découverte — une exécution en file est déjà engagée,
 * elle doit se voir dans la ligne d'état et ne pas être redécouverte au sondage suivant ;
 * `occupiesSlot` sert au plafond de concurrence — une exécution en file n'a pas encore de session,
 * elle ne consomme donc aucun créneau.
 */
const ACTIFS: RunStatus[] = ['queued', 'running', 'attention']
const OCCUPES: RunStatus[] = ['running', 'attention']
const TERMINES: RunStatus[] = ['done', 'failed']
const SANS_SESSION: RunStatus[] = ['pending', 'queued']

export function countsAsActive(status: RunStatus): boolean {
  return ACTIFS.includes(status)
}
export function occupiesSlot(status: RunStatus): boolean {
  return OCCUPES.includes(status)
}
export function isTerminal(status: RunStatus): boolean {
  return TERMINES.includes(status)
}
/** Exécution qui n'a jamais eu de session : rien à requalifier en échec au rechargement du journal. */
export function neverStarted(status: RunStatus): boolean {
  return SANS_SESSION.includes(status)
}
