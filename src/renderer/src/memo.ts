import type { Group, Item } from './store'

export const MEMO_DEFAULT_NAME = 'Mémo'
export const MEMO_MIN_W = 240
export const MEMO_MIN_H = 200
const MARGIN = 8

export function makeMemoItem(split: 1 | 2 = 1): Item {
  return {
    id: crypto.randomUUID(), name: MEMO_DEFAULT_NAME, cwd: '', pinned: true, tabId: null, state: 'done',
    agents: [], openAgentId: null, split, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'memo'
  }
}

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Garde la fenêtre flottante entièrement visible dans la zone (vw × vh).
 * x/y négatifs = jamais positionnée → coin bas-droit par défaut.
 */
export function clampMemoRect(r: Rect, vw: number, vh: number, top = 0): Rect {
  const maxW = Math.max(MEMO_MIN_W, vw - 2 * MARGIN)
  const maxH = Math.max(MEMO_MIN_H, vh - top - 2 * MARGIN)
  const w = Math.min(Math.max(r.w, MEMO_MIN_W), maxW)
  const h = Math.min(Math.max(r.h, MEMO_MIN_H), maxH)
  const x0 = r.x < 0 ? vw - w - 24 : r.x
  const y0 = r.y < 0 ? vh - h - 24 : r.y
  const x = Math.min(Math.max(x0, MARGIN), Math.max(MARGIN, vw - w - MARGIN))
  const y = Math.min(Math.max(y0, top + MARGIN), Math.max(top + MARGIN, vh - h - MARGIN))
  return { x, y, w, h }
}

export interface MemoOption { id: string; name: string; groupId: string; groupName: string; color: string | null }

export function memoOptions(groups: Group[]): MemoOption[] {
  return groups.flatMap((g) => g.items.filter((i) => i.kind === 'memo')
    .map((i) => ({ id: i.id, name: i.name, groupId: g.id, groupName: g.name, color: g.color })))
}

/** Mémo à afficher : celui choisi s'il existe encore, sinon le 1er du groupe actif, sinon le 1er tout court. */
export function resolveMemoTarget(groups: Group[], wanted: string | null, activeGroupId: string | null): string | null {
  const opts = memoOptions(groups)
  if (wanted && opts.some((o) => o.id === wanted)) return wanted
  return (opts.find((o) => o.groupId === activeGroupId) ?? opts[0])?.id ?? null
}
