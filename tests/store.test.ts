import { describe, it, expect, beforeEach } from 'vitest'
import { useHub, tabRef, parseRef } from '../src/renderer/src/store'
import type { Item } from '../src/renderer/src/store'

const mkItem = (id: string, over: Partial<Item> = {}): Item => ({
  id, name: id, cwd: 'C:/' + id, pinned: false, tabId: 't-' + id,
  state: 'starting', agents: [], openAgentId: null,
  split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'claude', ...over
})

describe('store groupes/items', () => {
  beforeEach(() => useHub.getState().reset())

  it('addGroup ajoute et active le groupe', () => {
    const id = useHub.getState().addGroup('Messika')
    expect(useHub.getState().groups.map((g) => g.name)).toContain('Messika')
    expect(useHub.getState().activeGroupId).toBe(id)
  })

  it('addItem range dans le groupe et l\'active', () => {
    const g = useHub.getState().addGroup('Messika')
    useHub.getState().addItem(g, mkItem('i1'))
    expect(useHub.getState().groups.find((x) => x.id === g)!.items).toHaveLength(1)
    expect(useHub.getState().activeItemId).toBe('i1')
  })

  it('removeItem retire l\'item', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1'))
    useHub.getState().removeItem('i1')
    expect(useHub.getState().groups.find((x) => x.id === g)!.items).toHaveLength(0)
  })

  it('togglePin bascule l\'épingle', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1'))
    useHub.getState().togglePin('i1')
    expect(useHub.getState().itemById('i1')!.pinned).toBe(true)
  })

  it('clearSession éteint l\'item (tabId null, agents vidés)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1', { pinned: true }))
    useHub.getState().clearSession('i1')
    expect(useHub.getState().itemById('i1')!.tabId).toBeNull()
    expect(useHub.getState().itemById('i1')!.agents).toEqual([])
  })

  it('closeSession : non épinglé => supprime ; épinglé => éteint', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('eph', { pinned: false }))
    useHub.getState().addItem(g, mkItem('pin', { pinned: true }))
    useHub.getState().closeSession('eph')
    useHub.getState().closeSession('pin')
    expect(useHub.getState().itemById('eph')).toBeUndefined()
    expect(useHub.getState().itemById('pin')!.tabId).toBeNull()
  })

  it('événements par tabId : setItemState/addAgent ciblent le bon item', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1'))
    useHub.getState().setItemState('t-i1', 'waiting')
    useHub.getState().addAgent('t-i1', { id: 'a1', type: 'x', desc: '', lines: [], done: false })
    expect(useHub.getState().itemById('i1')!.state).toBe('waiting')
    expect(useHub.getState().itemById('i1')!.agents).toHaveLength(1)
  })

  it('moveItem réordonne dans le groupe', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().addItem(g, mkItem('b'))
    useHub.getState().moveItem('b', 0)
    expect(useHub.getState().groups.find((x) => x.id === g)!.items.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('toPersistable : ne garde que groupes + items épinglés (config seule)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('pin', { pinned: true, name: 'api', cwd: 'C:/api' }))
    useHub.getState().addItem(g, mkItem('eph', { pinned: false }))
    expect(useHub.getState().toPersistable().groups[0].items).toEqual([{ id: 'pin', name: 'api', cwd: 'C:/api', split: 1 }])
  })

  it('loadWorkspace recrée les groupes/items (éteints, épinglés) + defaultCwd', () => {
    useHub.getState().loadWorkspace({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'M', collapsed: false, defaultCwd: 'C:/m', items: [{ id: 'i1', name: 'api', cwd: 'C:/api' }] }] })
    expect(useHub.getState().groups).toHaveLength(1)
    expect(useHub.getState().groups[0].defaultCwd).toBe('C:/m')
    const it = useHub.getState().itemById('i1')!
    expect(it.pinned).toBe(true)
    expect(it.tabId).toBeNull()
  })

  it('setGroupDefaultCwd + toPersistable conservent le dossier par défaut', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().setGroupDefaultCwd(g, 'C:/projet')
    expect(useHub.getState().groups[0].defaultCwd).toBe('C:/projet')
    expect(useHub.getState().toPersistable().groups[0].defaultCwd).toBe('C:/projet')
  })

  it('setSoundEnabled / setConsoleWidth conservés', () => {
    useHub.getState().setSoundEnabled(false)
    useHub.getState().setConsoleWidth(420)
    expect(useHub.getState().soundEnabled).toBe(false)
    expect(useHub.getState().consoleWidth).toBe(420)
  })

  it('addItem : split par défaut = 1, va dans leftTabs', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    expect(useHub.getState().itemById('a')!.split).toBe(1)
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toEqual([tabRef('session', 'a')])
    expect(useHub.getState().rightTabs()).toEqual([])
  })

  it('setSplit déplace la session de volet', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().addItem(g, mkItem('b'))
    useHub.getState().setSplit('b', 2)
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toEqual([tabRef('session', 'a')])
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('session', 'b')])
  })

  it('toggleFind ouvre puis ferme l\'onglet Find à droite', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().toggleFind('a')
    expect(useHub.getState().itemById('a')!.findOpen).toBe(true)
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a')])
    expect(useHub.getState().groups[0].rightActiveTab).toBe(tabRef('find', 'a'))
    useHub.getState().toggleFind('a')
    expect(useHub.getState().itemById('a')!.findOpen).toBe(false)
    expect(useHub.getState().rightTabs()).toEqual([])
    expect(useHub.getState().groups[0].rightActiveTab).toBeNull()
  })

  it('openAgentsTab / closeAgentsTab', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().openAgentsTab('a')
    expect(useHub.getState().itemById('a')!.agentsOpen).toBe(true)
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('agents', 'a')])
    expect(useHub.getState().focusedPane).toBe('right')
    useHub.getState().closeAgentsTab('a')
    expect(useHub.getState().rightTabs()).toEqual([])
  })

  it('Find et Agents coexistent (plus d\'exclusivité)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().toggleFind('a')
    useHub.getState().openAgentsTab('a')
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a'), tabRef('agents', 'a')])
  })

  it('scénario extrême : A B | A-Find,B-Find -> fermetures -> B plein écran', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().addItem(g, mkItem('b'))
    useHub.getState().toggleFind('a')
    useHub.getState().toggleFind('b')
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toEqual([tabRef('session', 'a'), tabRef('session', 'b')])
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a'), tabRef('find', 'b')])
    useHub.getState().toggleFind('b')
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a')])
    useHub.getState().toggleFind('a')
    expect(useHub.getState().rightTabs()).toEqual([])
  })

  it('clearSession reset findOpen/agentsOpen', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a', { pinned: true, findOpen: true, agentsOpen: true }))
    useHub.getState().clearSession('a')
    expect(useHub.getState().itemById('a')!.findOpen).toBe(false)
    expect(useHub.getState().itemById('a')!.agentsOpen).toBe(false)
  })

  it('persistance : split conservé pour les items épinglés', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('pin', { pinned: true, name: 'api', cwd: 'C:/api', split: 2 }))
    expect(useHub.getState().toPersistable().groups[0].items).toEqual([{ id: 'pin', name: 'api', cwd: 'C:/api', split: 2 }])
    useHub.getState().reset()
    useHub.getState().loadWorkspace(useHub.getState().toPersistable())
  })

  it('loadWorkspace restaure split (défaut 1)', () => {
    useHub.getState().loadWorkspace({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'M', collapsed: false, defaultCwd: null, items: [{ id: 'i1', name: 'api', cwd: 'C:/api', split: 2 }, { id: 'i2', name: 'b', cwd: 'C:/b' }] }] })
    expect(useHub.getState().itemById('i1')!.split).toBe(2)
    expect(useHub.getState().itemById('i2')!.split).toBe(1)
  })

  it('setConfirmOnClose / setGlobalDefaultCwd', () => {
    useHub.getState().setConfirmOnClose(false)
    useHub.getState().setGlobalDefaultCwd('C:/projets')
    expect(useHub.getState().confirmOnClose).toBe(false)
    expect(useHub.getState().globalDefaultCwd).toBe('C:/projets')
  })

  it('setGroupColor + persistance + remise à null', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().setGroupColor(g, '#3a7bd0')
    expect(useHub.getState().groups[0].color).toBe('#3a7bd0')
    expect(useHub.getState().toPersistable().groups[0].color).toBe('#3a7bd0')
    useHub.getState().setGroupColor(g, null)
    expect(useHub.getState().groups[0].color).toBeNull()
  })

  it('loadWorkspace restaure color', () => {
    useHub.getState().loadWorkspace({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'M', collapsed: false, defaultCwd: null, color: '#b5413b', items: [] }] })
    expect(useHub.getState().groups[0].color).toBe('#b5413b')
  })
})

describe('store ADO (lot 4.2)', () => {
  beforeEach(() => useHub.getState().reset())

  const mkAdo = (id: string, over: Partial<Item> = {}): Item => ({
    id, name: id, cwd: '', pinned: false, tabId: null, state: 'done', agents: [], openAgentId: null,
    split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'ado',
    ado: { view: 'tree', iterationPath: null }, ...over
  })

  it('addItem d\'un item ado active l\'onglet ado (ref d:)', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    const grp = useHub.getState().groups.find((x) => x.id === g)!
    expect(grp.leftActiveTab).toBe('d:a1')
  })

  it('paneRefs inclut un item ado sans tabId', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toContain('d:a1')
  })

  it('un item claude sans tabId reste absent des onglets', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('c1', { tabId: null, kind: 'claude' }))
    expect(useHub.getState().leftTabs().map((t) => t.ref)).not.toContain('s:c1')
  })

  it('setGroupAdo pose et retire le binding', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().setGroupAdo(g, { connId: 'c1', project: 'P', team: 'T' })
    expect(useHub.getState().groups.find((x) => x.id === g)!.ado).toEqual({ connId: 'c1', project: 'P', team: 'T' })
    useHub.getState().setGroupAdo(g, null)
    expect(useHub.getState().groups.find((x) => x.id === g)!.ado).toBeNull()
  })

  it('setAdoView et setAdoIteration mettent à jour l\'item', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    useHub.getState().setAdoView('a1', 'board')
    useHub.getState().setAdoIteration('a1', 'P\\Sprint 2')
    const it = useHub.getState().itemById('a1')!
    expect(it.ado).toEqual({ view: 'board', iterationPath: 'P\\Sprint 2' })
  })

  it('parseRef décode le préfixe d: en kind ado', () => {
    expect(parseRef('d:a1')).toEqual({ kind: 'ado', itemId: 'a1' })
    expect(tabRef('ado', 'a1')).toBe('d:a1')
  })

  it('setActiveItem d\'un item ado active la ref d: (pas s:)', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    useHub.getState().setActiveItem('a1')
    expect(useHub.getState().groups.find((x) => x.id === g)!.leftActiveTab).toBe('d:a1')
  })
})
