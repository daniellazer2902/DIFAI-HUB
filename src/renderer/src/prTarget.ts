import type { AdoWatchScope } from '../../shared/ipc'

export interface PrTarget { project: string; repo: string; prId: number; url: string }
export type PrTargetResult = { ok: true; target: PrTarget } | { ok: false; error: string }

const WEB_URL = /\/([^/?#]+)\/_git\/([^/?#]+)\/pullrequest\/(\d+)/i

const decode = (s: string): string => { try { return decodeURIComponent(s) } catch { return s } }

/**
 * Résout la pull request désignée par une adresse web ou par un identifiant seul. L'identifiant
 * seul ne suffit que si le périmètre ne laisse aucune ambiguïté sur le projet et le dépôt.
 */
export function parsePrTarget(input: string, scope: AdoWatchScope[]): PrTargetResult {
  const texte = input.trim()
  if (!texte) return { ok: false, error: 'Saisis l\'adresse d\'une pull request ou son identifiant.' }

  const m = WEB_URL.exec(texte)
  if (m) {
    const fin = (m.index ?? 0) + m[0].length
    return {
      ok: true,
      target: { project: decode(m[1]), repo: decode(m[2]), prId: Number(m[3]), url: texte.slice(0, fin) }
    }
  }

  if (/^\d+$/.test(texte)) {
    const projets = Array.from(new Set(scope.map((s) => s.project)))
    const depots = scope.length === 1 ? scope[0].repos : []
    if (projets.length !== 1 || depots.length !== 1) {
      return { ok: false, error: 'Un identifiant seul ne suffit pas ici : colle l\'adresse complète de la pull request.' }
    }
    return { ok: true, target: { project: projets[0], repo: depots[0], prId: Number(texte), url: '' } }
  }

  return { ok: false, error: 'Adresse de pull request non reconnue. Attendu : .../{projet}/_git/{dépôt}/pullrequest/{id}' }
}
