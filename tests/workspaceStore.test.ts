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

describe('workspaceStore ADO (lot 4.2)', () => {
  it('parse un item ado (kind + ado)', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      ado: { connId: 'c1', project: 'P', team: 'T' },
      items: [{ id: 'a1', name: 'Board', cwd: '', kind: 'ado', ado: { view: 'tree', iterationPath: 'P\\S1' } }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].ado).toEqual({ connId: 'c1', project: 'P', team: 'T' })
    expect(t.groups[0].items[0]).toMatchObject({ id: 'a1', kind: 'ado', ado: { view: 'tree', iterationPath: 'P\\S1' } })
  })

  it('un item sans kind reste accepté (claude implicite)', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      items: [{ id: 'c1', name: 'Sess', cwd: 'C:/x' }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].items[0].id).toBe('c1')
    expect(t.groups[0].items[0].kind).toBeUndefined()
    expect(t.groups[0].ado).toBeUndefined()
  })

  it('ignore un ado d\'item mal formé', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      items: [{ id: 'a1', name: 'B', cwd: '', kind: 'ado', ado: { view: 'wrong' } }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].items[0].ado).toBeUndefined()
    expect(t.groups[0].items[0].kind).toBe('ado')
  })
})

describe('workspaceStore note (lecteur Markdown)', () => {
  it('parse un item note (kind + note conservés)', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      items: [{ id: 'n1', name: 'Doc', cwd: '', kind: 'note', note: { root: 'C:/vault', rootKind: 'vault', activePath: 'C:/vault/a.md' } }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].items[0]).toMatchObject({ id: 'n1', kind: 'note', note: { root: 'C:/vault', rootKind: 'vault', activePath: 'C:/vault/a.md' } })
  })

  it('round-trip d\'un item note (régression : kind ne retombe pas en claude)', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: false, defaultCwd: null,
      items: [{ id: 'n1', name: 'F', cwd: '', kind: 'note', note: { root: 'C:/f.md', rootKind: 'file', activePath: 'C:/f.md' } }] }] }
    const parsed = parseWorkspace(serializeWorkspace(tree))
    expect(parsed.groups[0].items[0].kind).toBe('note')
    expect(parsed.groups[0].items[0].note).toEqual({ root: 'C:/f.md', rootKind: 'file', activePath: 'C:/f.md' })
  })

  it('ignore une note mal formée (rootKind invalide)', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      items: [{ id: 'n1', name: 'B', cwd: '', kind: 'note', note: { root: 'C:/v', rootKind: 'wrong' } }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].items[0].note).toBeUndefined()
    expect(t.groups[0].items[0].kind).toBe('note')
  })
})
