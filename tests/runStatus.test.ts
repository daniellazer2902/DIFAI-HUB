import { describe, it, expect } from 'vitest'
import { countsAsActive, occupiesSlot, isTerminal, neverStarted } from '../src/shared/runStatus'

describe('prédicats de statut de run', () => {
  it('une exécution en file compte comme active mais n occupe pas de créneau', () => {
    expect(countsAsActive('queued')).toBe(true)
    expect(occupiesSlot('queued')).toBe(false)
  })

  it('une exécution en cours ou en attente occupe un créneau', () => {
    expect(occupiesSlot('running')).toBe(true)
    expect(occupiesSlot('attention')).toBe(true)
  })

  it('une exécution en attente de feu vert n est ni active ni occupante', () => {
    expect(countsAsActive('pending')).toBe(false)
    expect(occupiesSlot('pending')).toBe(false)
  })

  it('les statuts terminaux ne sont plus actifs', () => {
    for (const s of ['done', 'failed'] as const) {
      expect(isTerminal(s)).toBe(true)
      expect(countsAsActive(s)).toBe(false)
      expect(occupiesSlot(s)).toBe(false)
    }
  })

  it('seules les exécutions sans session sont dites jamais démarrées', () => {
    expect(neverStarted('pending')).toBe(true)
    expect(neverStarted('queued')).toBe(true)
    expect(neverStarted('running')).toBe(false)
    expect(neverStarted('done')).toBe(false)
  })
})
