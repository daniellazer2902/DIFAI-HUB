import { describe, it, expect, beforeEach } from 'vitest'
import { clampMemoRect, makeMemoItem, memoOptions, resolveMemoTarget, MEMO_MIN_W, MEMO_MIN_H } from '../src/renderer/src/memo'
import { useHub, tabRef, paneTabs, type Group, type Item } from '../src/renderer/src/store'

const grp = (id: string, items: Partial<Item>[], color: string | null = null): Group => ({
  id, name: id.toUpperCase(), collapsed: false, defaultCwd: null, color, ado: null, leftActiveTab: null, rightActiveTab: null,
  items: items.map((o, i) => ({ ...makeMemoItem(), id: `${id}-${i}`, ...o }))
})

describe('clampMemoRect', () => {
  it('place une fenêtre jamais positionnée en bas à droite', () => {
    const r = clampMemoRect({ x: -1, y: -1, w: 300, h: 400 }, 1200, 800, 36)
    expect(r).toEqual({ x: 1200 - 300 - 24, y: 800 - 400 - 24, w: 300, h: 400 })
  })

  it('ramène dans la zone visible après un rétrécissement de la fenêtre', () => {
    const r = clampMemoRect({ x: 1000, y: 700, w: 340, h: 420 }, 800, 600, 36)
    expect(r.x + r.w).toBeLessThanOrEqual(800 - 8)
    expect(r.y + r.h).toBeLessThanOrEqual(600 - 8)
    expect(r.y).toBeGreaterThanOrEqual(36 + 8)
  })

  it('borne la taille entre le minimum et la zone disponible', () => {
    expect(clampMemoRect({ x: 10, y: 50, w: 50, h: 50 }, 1200, 800, 36)).toMatchObject({ w: MEMO_MIN_W, h: MEMO_MIN_H })
    const big = clampMemoRect({ x: 0, y: 0, w: 5000, h: 5000 }, 1000, 700, 36)
    expect(big.w).toBe(1000 - 16)
    expect(big.h).toBe(700 - 36 - 16)
  })

  it('ne passe pas sous la barre de titre', () => {
    expect(clampMemoRect({ x: 100, y: 0, w: 300, h: 300 }, 1200, 800, 36).y).toBe(44)
  })
})

describe('memoOptions / resolveMemoTarget', () => {
  const groups = [
    grp('a', [{ name: 'A1' }, { kind: 'claude', name: 'session' }], '#3a7bd0'),
    grp('b', [{ name: 'B1' }, { name: 'B2' }])
  ]

  it('liste uniquement les mémos avec leur groupe et sa couleur', () => {
    const o = memoOptions(groups)
    expect(o.map((x) => x.name)).toEqual(['A1', 'B1', 'B2'])
    expect(o[0]).toMatchObject({ groupName: 'A', color: '#3a7bd0' })
  })

  it('garde le mémo choisi s\'il existe', () => {
    expect(resolveMemoTarget(groups, 'b-1', 'a')).toBe('b-1')
  })

  it('sinon prend le 1er mémo du groupe actif, puis le 1er tout court', () => {
    expect(resolveMemoTarget(groups, 'disparu', 'b')).toBe('b-0')
    expect(resolveMemoTarget(groups, null, 'zzz')).toBe('a-0')
    expect(resolveMemoTarget([grp('c', [{ kind: 'claude' }])], null, 'c')).toBeNull()
  })
})

describe('store : mémos', () => {
  beforeEach(() => useHub.getState().reset())

  it('un mémo créé est épinglé et ne peut pas être désépinglé', () => {
    const g = useHub.getState().addGroup('G')
    const m = makeMemoItem()
    useHub.getState().addItem(g, m)
    useHub.getState().togglePin(m.id)
    expect(useHub.getState().itemById(m.id)!.pinned).toBe(true)
  })

  it('ouvre un onglet mémo, le ferme sans supprimer l\'item, puis le rouvre', () => {
    const gid = useHub.getState().addGroup('G')
    const m = makeMemoItem()
    useHub.getState().addItem(gid, m)
    const group = (): Group => useHub.getState().groups.find((x) => x.id === gid)!
    expect(paneTabs(group(), 'left').map((t) => t.ref)).toEqual([tabRef('memo', m.id)])
    useHub.getState().setMemoClosed(m.id, true)
    expect(paneTabs(group(), 'left')).toEqual([])
    expect(group().items).toHaveLength(1)
    useHub.getState().openMemo(m.id)
    expect(group().leftActiveTab).toBe(tabRef('memo', m.id))
  })

  it('persiste le mémo et le recharge onglet fermé', () => {
    const gid = useHub.getState().addGroup('G')
    const m = makeMemoItem()
    useHub.getState().addItem(gid, m)
    const tree = useHub.getState().toPersistable()
    expect(tree.groups[0].items[0]).toMatchObject({ id: m.id, kind: 'memo', name: 'Mémo' })
    useHub.getState().reset()
    useHub.getState().loadWorkspace(tree)
    const it = useHub.getState().itemById(m.id)!
    expect(it).toMatchObject({ kind: 'memo', pinned: true, memoClosed: true })
  })

  it('supprimer le mémo affiché dans la fenêtre flottante vide la sélection', () => {
    const gid = useHub.getState().addGroup('G')
    const m = makeMemoItem()
    useHub.getState().addItem(gid, m)
    useHub.getState().setMemoFloat({ open: true, itemId: m.id })
    useHub.getState().removeItem(m.id)
    expect(useHub.getState().memoFloat).toMatchObject({ open: true, itemId: null })
  })

  it('supprimer le groupe vide aussi la sélection de la fenêtre flottante', () => {
    const gid = useHub.getState().addGroup('G')
    const m = makeMemoItem()
    useHub.getState().addItem(gid, m)
    useHub.getState().setMemoFloat({ itemId: m.id })
    useHub.getState().removeGroup(gid)
    expect(useHub.getState().memoFloat.itemId).toBeNull()
  })
})
