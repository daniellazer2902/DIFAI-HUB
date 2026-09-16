import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { registerTerminal, focusTerminal, jumpToRun } from '../src/renderer/src/runFocus'
import { useHub, type Item } from '../src/renderer/src/store'

const runItem = (id: string, runId: string, tabId: string): Item => ({
  id, name: id, cwd: 'C:/x', pinned: false, tabId, state: 'active', agents: [], openAgentId: null,
  split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'run', runId
})

beforeEach(() => { useHub.getState().reset(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

describe('runFocus', () => {
  it('focusTerminal appelle le terminal enregistré', () => {
    const focus = vi.fn()
    registerTerminal('tab-1', focus)
    expect(focusTerminal('tab-1')).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('un terminal démonté ne reçoit plus le focus', () => {
    const focus = vi.fn()
    const off = registerTerminal('tab-2', focus)
    off()
    expect(focusTerminal('tab-2')).toBe(false)
    expect(focus).not.toHaveBeenCalled()
  })

  it('jumpToRun active le groupe, l onglet, puis pose le focus dans le terminal', () => {
    const focus = vi.fn()
    registerTerminal('tab-3', focus)
    const g1 = useHub.getState().addGroup('A')
    const g2 = useHub.getState().addGroup('B')
    useHub.getState().addItem(g1, runItem('r-item', 'run-42', 'tab-3'))
    useHub.getState().setActiveGroup(g2)

    jumpToRun('run-42')
    expect(useHub.getState().activeGroupId).toBe(g1)
    expect(useHub.getState().activeItemId).toBe('r-item')
    expect(focus).not.toHaveBeenCalled()   // le terminal est encore masqué
    vi.runAllTimers()
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('jumpToRun sur un run sans onglet ne casse rien', () => {
    expect(() => { jumpToRun('inconnu'); vi.runAllTimers() }).not.toThrow()
  })
})
