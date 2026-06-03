import { describe, it, expect, beforeEach } from 'vitest'
import { useHub } from '../src/renderer/src/store'

describe('store hub', () => {
  beforeEach(() => useHub.getState().reset())

  it('addAgent ajoute un agent vide', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'Explore', desc: 'liste md', lines: [] })
    expect(useHub.getState().agents).toEqual([{ id: 'a1', type: 'Explore', desc: 'liste md', lines: [] }])
  })

  it('addAgent ignore un doublon', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'Explore', desc: '', lines: [] })
    useHub.getState().addAgent({ id: 'a1', type: 'Explore', desc: '', lines: [] })
    expect(useHub.getState().agents).toHaveLength(1)
  })

  it('appendLines concatène les lignes du bon agent', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'x', desc: '', lines: [] })
    useHub.getState().appendLines('a1', [{ kind: 'tool', text: 'Glob' }])
    useHub.getState().appendLines('a1', [{ kind: 'text', text: 'ok' }])
    expect(useHub.getState().agents[0].lines).toEqual([
      { kind: 'tool', text: 'Glob' },
      { kind: 'text', text: 'ok' }
    ])
  })

  it('removeAgent ferme la console si l\'agent ouvert est retiré', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'x', desc: '', lines: [] })
    useHub.getState().openAgent('a1')
    useHub.getState().removeAgent('a1')
    expect(useHub.getState().agents).toHaveLength(0)
    expect(useHub.getState().openAgentId).toBeNull()
  })

  it('setSessionState met à jour l\'état', () => {
    useHub.getState().setSessionState('waiting')
    expect(useHub.getState().sessionState).toBe('waiting')
  })
})
