import { describe, it, expect, beforeEach } from 'vitest'
import { useHub } from '../src/renderer/src/store'

const mkTab = (id: string) => ({
  id, title: id, cwd: 'C:/' + id, state: 'starting' as const,
  agents: [], openAgentId: null, railCollapsed: false
})

describe('store multi-onglets', () => {
  beforeEach(() => useHub.getState().reset())

  it('addTab ajoute et active l\'onglet', () => {
    useHub.getState().addTab(mkTab('t1'))
    expect(useHub.getState().tabs).toHaveLength(1)
    expect(useHub.getState().activeTabId).toBe('t1')
  })

  it('addTab ignore un doublon d\'id', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addTab(mkTab('t1'))
    expect(useHub.getState().tabs).toHaveLength(1)
  })

  it('removeTab réassigne activeTabId au dernier onglet restant', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addTab(mkTab('t2'))
    useHub.getState().removeTab('t2')
    expect(useHub.getState().tabs).toHaveLength(1)
    expect(useHub.getState().activeTabId).toBe('t1')
  })

  it('removeTab du dernier onglet => activeTabId null', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().removeTab('t1')
    expect(useHub.getState().activeTabId).toBeNull()
  })

  it('setTabState modifie le bon onglet', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addTab(mkTab('t2'))
    useHub.getState().setTabState('t2', 'waiting')
    expect(useHub.getState().tabs.find((t) => t.id === 't2')!.state).toBe('waiting')
    expect(useHub.getState().tabs.find((t) => t.id === 't1')!.state).toBe('starting')
  })

  it('addAgent / appendLines ciblent le bon onglet', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addAgent('t1', { id: 'a1', type: 'Explore', desc: '', lines: [], done: false })
    useHub.getState().appendLines('t1', 'a1', [{ kind: 'tool', text: 'Glob' }])
    expect(useHub.getState().tabs[0].agents[0].lines).toEqual([{ kind: 'tool', text: 'Glob' }])
  })

  it('setAgentDone marque l\'agent comme terminé', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addAgent('t1', { id: 'a1', type: 'x', desc: '', lines: [], done: false })
    useHub.getState().setAgentDone('t1', 'a1')
    expect(useHub.getState().tabs[0].agents[0].done).toBe(true)
  })

  it('removeAgent ferme la console si l\'agent ouvert est retiré', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addAgent('t1', { id: 'a1', type: 'x', desc: '', lines: [], done: false })
    useHub.getState().openAgent('t1', 'a1')
    useHub.getState().removeAgent('t1', 'a1')
    expect(useHub.getState().tabs[0].agents).toHaveLength(0)
    expect(useHub.getState().tabs[0].openAgentId).toBeNull()
  })

  it('toggleRail bascule railCollapsed et ferme la console au repli', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addAgent('t1', { id: 'a1', type: 'x', desc: '', lines: [], done: false })
    useHub.getState().openAgent('t1', 'a1')
    useHub.getState().toggleRail('t1')
    expect(useHub.getState().tabs[0].railCollapsed).toBe(true)
    expect(useHub.getState().tabs[0].openAgentId).toBeNull()
  })

  it('toggleRail qui déplie ne touche pas la console', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().toggleRail('t1') // replie
    useHub.getState().addAgent('t1', { id: 'a1', type: 'x', desc: '', lines: [], done: false })
    useHub.getState().toggleRail('t1') // déplie
    expect(useHub.getState().tabs[0].railCollapsed).toBe(false)
  })

  it('setSoundEnabled met à jour l\'état', () => {
    useHub.getState().setSoundEnabled(false)
    expect(useHub.getState().soundEnabled).toBe(false)
  })

  it('setConsoleWidth met à jour la largeur de console', () => {
    useHub.getState().setConsoleWidth(420)
    expect(useHub.getState().consoleWidth).toBe(420)
  })
})
