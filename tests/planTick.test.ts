import { describe, it, expect } from 'vitest'
import { planTick, MAX_CONCURRENT } from '../src/main/automations/planTick'
import type { AdoPullRequest, RunRecord } from '../src/shared/ipc'

const pr = (id: number): AdoPullRequest => ({
  prId: id, project: 'P', repo: 'R', title: `t${id}`, author: 'a',
  sourceBranch: 's', targetBranch: 'd', url: 'u'
})
const run = (key: string, status: RunRecord['status']): RunRecord => ({
  id: 'x' + key, automationId: 'a1', key, project: 'P', repo: 'R', prId: 0, title: '', url: '',
  startedAt: 0, endedAt: null, status, error: null, tabId: null
})

describe('planTick', () => {
  it('au premier tick, aucune PR ne démarre : toutes passent en attente de feu vert', () => {
    const plan = planTick({ prs: [pr(1), pr(2)], journal: [], firstTick: true, activeCount: 0 })
    expect(plan.toStart).toEqual([])
    expect(plan.toPend.map((p) => p.prId)).toEqual([1, 2])
  })

  it('aux ticks suivants, une PR inconnue démarre', () => {
    const plan = planTick({ prs: [pr(1)], journal: [], firstTick: false, activeCount: 0 })
    expect(plan.toStart.map((p) => p.prId)).toEqual([1])
    expect(plan.toPend).toEqual([])
  })

  it('ignore une PR déjà présente au journal, quel que soit son statut', () => {
    const journal = [run('P/R#1@0', 'done'), run('P/R#2@0', 'pending')]
    const plan = planTick({ prs: [pr(1), pr(2), pr(3)], journal, firstTick: false, activeCount: 0 })
    expect(plan.toStart.map((p) => p.prId)).toEqual([3])
  })

  it('respecte le plafond de concurrence', () => {
    const plan = planTick({ prs: [pr(1), pr(2), pr(3)], journal: [], firstTick: false, activeCount: 1 })
    expect(plan.toStart.map((p) => p.prId)).toEqual([1])
    expect(plan.toPend).toEqual([])
  })

  it('ne démarre rien quand le plafond est atteint, sans rien mettre en attente', () => {
    const plan = planTick({ prs: [pr(1)], journal: [], firstTick: false, activeCount: MAX_CONCURRENT })
    expect(plan.toStart).toEqual([])
    expect(plan.toPend).toEqual([])
  })
})
