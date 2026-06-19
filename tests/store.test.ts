import { describe, it, expect, beforeEach } from 'vitest'
import { useHub, tabRef, parseRef, adoCacheKey } from '../src/renderer/src/store'
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
    expect(useHub.getState().toPersistable().groups[0].items).toEqual([{ id: 'pin', name: 'api', cwd: 'C:/api', split: 1, kind: 'claude' }])
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
    expect(useHub.getState().toPersistable().groups[0].items).toEqual([{ id: 'pin', name: 'api', cwd: 'C:/api', split: 2, kind: 'claude' }])
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

  it('setSplit d\'un item ado active la ref d: dans le volet cible', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('c1')) // session à gauche
    useHub.getState().addItem(g, mkAdo('a1'))
    useHub.getState().setSplit('a1', 2)
    expect(useHub.getState().groups.find((x) => x.id === g)!.rightActiveTab).toBe('d:a1')
  })

  it('setAdoCache stocke le board par clé', () => {
    const k = adoCacheKey('a1', 'P\\S1')
    const board = { states: ['New'], stories: [], tasksByParent: {} }
    useHub.getState().setAdoCache(k, board)
    expect(useHub.getState().adoCache[k].board).toEqual(board)
  })

  it('removeItem purge le cache de l\'item', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    useHub.getState().setAdoCache(adoCacheKey('a1', null), { states: [], stories: [], tasksByParent: {} })
    useHub.getState().setAdoCache(adoCacheKey('a1', 'P\\S2'), { states: [], stories: [], tasksByParent: {} })
    useHub.getState().removeItem('a1')
    expect(Object.keys(useHub.getState().adoCache)).toHaveLength(0)
  })

  it('setAdoClosed masque l\'onglet ado puis le réaffiche', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1', { pinned: true }))
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toContain('d:a1')
    useHub.getState().setAdoClosed('a1', true)
    expect(useHub.getState().leftTabs().map((t) => t.ref)).not.toContain('d:a1')
    expect(useHub.getState().itemById('a1')).toBeDefined() // item conservé (épinglé)
    useHub.getState().setAdoClosed('a1', false)
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toContain('d:a1')
  })

  it('removeGroup purge le cache de ses items', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    useHub.getState().setAdoCache(adoCacheKey('a1', null), { states: [], stories: [], tasksByParent: {} })
    useHub.getState().removeGroup(g)
    expect(Object.keys(useHub.getState().adoCache)).toHaveLength(0)
  })

  it('claudeArgs (Claude avancé) persiste en round-trip toPersistable/loadWorkspace', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('adv', { pinned: true, kind: 'claude', claudeArgs: ['--dangerously-skip-permissions'] }))
    const persisted = useHub.getState().toPersistable()
    expect(persisted.groups[0].items[0].claudeArgs).toEqual(['--dangerously-skip-permissions'])
    useHub.getState().reset()
    useHub.getState().loadWorkspace(persisted)
    expect(useHub.getState().itemById('adv')!.claudeArgs).toEqual(['--dangerously-skip-permissions'])
  })
})

describe('items note', () => {
  beforeEach(() => useHub.getState().reset())

  it('ajoute un item note, persiste root/rootKind/activePath et recharge', () => {
    const gid = useHub.getState().addGroup('Docs')
    useHub.getState().addItem(gid, {
      id: 'n1', name: 'Vault', cwd: '', pinned: true, tabId: null, state: 'done', agents: [],
      openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'note', note: { root: '/v', rootKind: 'vault', activePath: '/v/a.md' }
    })
    const tree = useHub.getState().toPersistable()
    const persisted = tree.groups[0].items[0]
    expect(persisted.kind).toBe('note')
    expect(persisted.note).toEqual({ root: '/v', rootKind: 'vault', activePath: '/v/a.md' })

    useHub.getState().reset()
    useHub.getState().loadWorkspace(tree)
    const back = useHub.getState().itemById('n1')!
    expect(back.note).toEqual({ root: '/v', rootKind: 'vault', activePath: '/v/a.md' })
  })

  it('setNoteActivePath met à jour le fichier ouvert', () => {
    const gid = useHub.getState().addGroup('Docs')
    useHub.getState().addItem(gid, {
      id: 'n2', name: 'Vault', cwd: '', pinned: true, tabId: null, state: 'done', agents: [],
      openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'note', note: { root: '/v', rootKind: 'vault', activePath: null }
    })
    useHub.getState().setNoteActivePath('n2', '/v/b.md')
    expect(useHub.getState().itemById('n2')!.note!.activePath).toBe('/v/b.md')
  })
})

describe('openNoteFile', () => {
  beforeEach(() => useHub.getState().reset())

  it('crée un item note dans le volet opposé au terminal', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('term', { split: 1 }))
    useHub.getState().openNoteFile('C:/proj/rapport.md', 'term')
    const items = useHub.getState().groups.find((x) => x.id === g)!.items
    const note = items.find((i) => i.kind === 'note')!
    expect(note.note).toEqual({ root: 'C:/proj/rapport.md', rootKind: 'file', activePath: 'C:/proj/rapport.md' })
    expect(note.name).toBe('rapport.md')
    expect(note.split).toBe(2)
    expect(useHub.getState().activeItemId).toBe(note.id)
  })

  it('réutilise l\'onglet si le .md est déjà ouvert', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('term', { split: 1 }))
    useHub.getState().openNoteFile('C:/proj/r.md', 'term')
    const firstId = useHub.getState().groups.find((x) => x.id === g)!.items.find((i) => i.kind === 'note')!.id
    useHub.getState().openNoteFile('C:/proj/r.md', 'term')
    const notes = useHub.getState().groups.find((x) => x.id === g)!.items.filter((i) => i.kind === 'note')
    expect(notes).toHaveLength(1)
    expect(useHub.getState().activeItemId).toBe(firstId)
  })
})
