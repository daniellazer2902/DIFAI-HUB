import { describe, it, expect } from 'vitest'
import { basename } from '../src/renderer/src/util'
import { isBusy, hasBusySession } from '../src/renderer/src/util'

describe('basename', () => {
  it('extrait le dernier segment (Windows)', () => {
    expect(basename('C:\\Users\\dan\\projet')).toBe('projet')
  })
  it('extrait le dernier segment (slash) et ignore le slash final', () => {
    expect(basename('C:/Users/dan/projet/')).toBe('projet')
  })
  it('renvoie l\'entrée si pas de séparateur', () => {
    expect(basename('projet')).toBe('projet')
  })
})

const busyItem = (over = {}) => ({ tabId: 't', state: 'active' as const, agents: [], ...over })

describe('isBusy', () => {
  it('occupé si state active/starting', () => {
    expect(isBusy(busyItem({ state: 'active' }))).toBe(true)
    expect(isBusy(busyItem({ state: 'starting' }))).toBe(true)
  })
  it('occupé si un agent non terminé', () => {
    expect(isBusy(busyItem({ state: 'waiting', agents: [{ done: false }] }))).toBe(true)
  })
  it('au repos si waiting/done sans agent actif', () => {
    expect(isBusy(busyItem({ state: 'waiting', agents: [{ done: true }] }))).toBe(false)
    expect(isBusy(busyItem({ state: 'done' }))).toBe(false)
  })
  it('au repos si pas de tabId', () => {
    expect(isBusy(busyItem({ tabId: null }))).toBe(false)
  })
})

describe('hasBusySession', () => {
  it('vrai si au moins une session occupée dans un groupe', () => {
    const groups = [{ items: [busyItem({ state: 'done' })] }, { items: [busyItem({ state: 'active' })] }]
    expect(hasBusySession(groups)).toBe(true)
  })
  it('faux si aucune', () => {
    expect(hasBusySession([{ items: [busyItem({ state: 'done' })] }])).toBe(false)
  })
})
