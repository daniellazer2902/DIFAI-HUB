import { describe, it, expect } from 'vitest'
import { summarizeRuns } from '../src/renderer/src/automationSummary'
import type { RunRecord, RunStatus } from '../src/shared/ipc'

const r = (id: string, status: RunStatus): RunRecord => ({
  id, automationId: 'a', key: id, project: 'P', repo: 'R', prId: 1, title: '', url: '',
  startedAt: 0, endedAt: null, status, error: null, tabId: null
})

describe('summarizeRuns', () => {
  it('compte les runs actifs et ceux qui attendent', () => {
    const runs = { a: r('a', 'running'), b: r('b', 'attention'), c: r('c', 'queued'), d: r('d', 'done') }
    expect(summarizeRuns(runs)).toEqual({ active: 3, attention: 1, pending: 0 })
  })

  it('un run en attente compte comme actif', () => {
    expect(summarizeRuns({ a: r('a', 'attention') })).toEqual({ active: 1, attention: 1, pending: 0 })
  })

  it('les runs terminés ou en échec ne comptent pas', () => {
    expect(summarizeRuns({ a: r('a', 'done'), b: r('b', 'failed') })).toEqual({ active: 0, attention: 0, pending: 0 })
  })

  it('un run en attente de feu vert n est pas actif', () => {
    expect(summarizeRuns({ a: r('a', 'pending') })).toEqual({ active: 0, attention: 0, pending: 1 })
  })

  it('aucun run donne un résumé nul', () => {
    expect(summarizeRuns({})).toEqual({ active: 0, attention: 0, pending: 0 })
  })

  it('compte plusieurs runs en attente de feu vert', () => {
    const runs = { a: r('a', 'pending'), b: r('b', 'pending'), c: r('c', 'running') }
    expect(summarizeRuns(runs)).toEqual({ active: 1, attention: 0, pending: 2 })
  })
})
