import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkspaceTree, PersistGroup, PersistItem } from '../shared/ipc'

export function defaultWorkspace(): WorkspaceTree {
  const g: PersistGroup = { id: 'g-default', name: 'Sessions', collapsed: false, defaultCwd: null, items: [] }
  return { activeGroupId: g.id, groups: [g] }
}

function normItem(x: unknown): PersistItem | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.cwd !== 'string') return null
  const split: 1 | 2 | undefined = o.split === 2 ? 2 : o.split === 1 ? 1 : undefined
  const kind: 'claude' | 'ado' | 'cmd' | undefined = o.kind === 'ado' ? 'ado' : o.kind === 'cmd' ? 'cmd' : o.kind === 'claude' ? 'claude' : undefined
  let ado: PersistItem['ado'] | undefined
  const a = o.ado as Record<string, unknown> | undefined
  if (a && (a.view === 'tree' || a.view === 'board')) {
    ado = { view: a.view, iterationPath: typeof a.iterationPath === 'string' ? a.iterationPath : null }
  }
  return { id: o.id, name: o.name, cwd: o.cwd, ...(split ? { split } : {}), ...(kind ? { kind } : {}), ...(ado ? { ado } : {}) }
}

function normGroup(x: unknown): PersistGroup | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const items = Array.isArray(o.items) ? (o.items.map(normItem).filter(Boolean) as PersistItem[]) : []
  const defaultCwd = typeof o.defaultCwd === 'string' ? o.defaultCwd : null
  const color = typeof o.color === 'string' ? o.color : undefined
  const ab = o.ado as Record<string, unknown> | undefined
  const ado = ab && typeof ab.connId === 'string' && typeof ab.project === 'string'
    ? { connId: ab.connId, project: ab.project, team: typeof ab.team === 'string' ? ab.team : null }
    : undefined
  return { id: o.id, name: o.name, collapsed: o.collapsed === true, defaultCwd, items, ...(color ? { color } : {}), ...(ado ? { ado } : {}) }
}

/** Parse le contenu JSON ; renvoie l'arbre par défaut si invalide/incomplet. */
export function parseWorkspace(raw: string): WorkspaceTree {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const groups = Array.isArray(o.groups) ? (o.groups.map(normGroup).filter(Boolean) as PersistGroup[]) : []
    if (groups.length === 0) return defaultWorkspace()
    const activeGroupId = typeof o.activeGroupId === 'string' && groups.some((g) => g.id === o.activeGroupId)
      ? o.activeGroupId
      : groups[0].id
    return { activeGroupId, groups }
  } catch {
    return defaultWorkspace()
  }
}

export function serializeWorkspace(tree: WorkspaceTree): string {
  return JSON.stringify(tree, null, 2)
}

const FILE = 'workspace.json'

/** Lit workspace.json dans userDataDir ; défaut si absent/illisible. */
export function loadWorkspace(userDataDir: string): WorkspaceTree {
  try {
    return parseWorkspace(readFileSync(join(userDataDir, FILE), 'utf8'))
  } catch {
    return defaultWorkspace()
  }
}

/** Écrit workspace.json dans userDataDir. */
export function saveWorkspace(userDataDir: string, tree: WorkspaceTree): void {
  try {
    writeFileSync(join(userDataDir, FILE), serializeWorkspace(tree), 'utf8')
  } catch { /* disque indisponible : ignore */ }
}
