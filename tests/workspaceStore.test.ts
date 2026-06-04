import { describe, it, expect } from 'vitest'
import { parseWorkspace, defaultWorkspace, serializeWorkspace } from '../src/main/workspaceStore'
import type { WorkspaceTree } from '../src/shared/ipc'

describe('workspaceStore (pur)', () => {
  it('defaultWorkspace : un groupe « Sessions », aucun item', () => {
    const w = defaultWorkspace()
    expect(w.groups).toHaveLength(1)
    expect(w.groups[0].name).toBe('Sessions')
    expect(w.groups[0].items).toEqual([])
    expect(w.activeGroupId).toBe(w.groups[0].id)
  })

  it('parseWorkspace : JSON valide => arbre', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'Messika', collapsed: false, defaultCwd: 'C:/messika', items: [{ id: 'i1', name: 'api', cwd: 'C:/p' }] }] }
    expect(parseWorkspace(JSON.stringify(tree))).toEqual(tree)
  })

  it('parseWorkspace : defaultCwd absent => null', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: false, items: [] }] })
    expect(parseWorkspace(raw).groups[0].defaultCwd).toBeNull()
  })

  it('parseWorkspace : JSON invalide => défaut', () => {
    expect(parseWorkspace('pas du json').groups[0].name).toBe('Sessions')
  })

  it('parseWorkspace : structure incomplète => défaut (robustesse)', () => {
    expect(parseWorkspace('{"groups": "oops"}').groups[0].name).toBe('Sessions')
  })

  it('parseWorkspace : split conservé (round-trip)', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: false, defaultCwd: null, items: [{ id: 'i1', name: 'api', cwd: 'C:/p', split: 2 }, { id: 'i2', name: 'b', cwd: 'C:/b' }] }] }
    const parsed = parseWorkspace(serializeWorkspace(tree))
    expect(parsed.groups[0].items[0].split).toBe(2)
    expect(parsed.groups[0].items[1].split).toBeUndefined()
  })

  it('parseWorkspace : color conservée (round-trip)', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: false, defaultCwd: null, color: '#3a9d5d', items: [] }] }
    expect(parseWorkspace(serializeWorkspace(tree)).groups[0].color).toBe('#3a9d5d')
  })

  it('serializeWorkspace : round-trip stable', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: true, defaultCwd: null, items: [] }] }
    expect(parseWorkspace(serializeWorkspace(tree))).toEqual(tree)
  })
})
