import { describe, it, expect } from 'vitest'
import { runKey, parseRuns, serializeRuns, upsertRun, hasKey, MAX_RUNS } from '../src/main/automations/runStore'
import type { RunRecord } from '../src/shared/ipc'

const rec = (id: string, key: string): RunRecord => ({
  id, automationId: 'a1', key, project: 'P', repo: 'R', prId: 1, title: 't', url: 'u',
  startedAt: 1, endedAt: null, status: 'running', error: null, tabId: null
})

describe('runStore', () => {
  it('runKey combine projet, repo, PR et itération', () => {
    expect(runKey('Socle', 'api', 1842, 3)).toBe('Socle/api#1842@3')
  })

  it('hasKey détecte un run déjà enregistré', () => {
    const list = [rec('r1', 'Socle/api#1@0')]
    expect(hasKey(list, 'Socle/api#1@0')).toBe(true)
    expect(hasKey(list, 'Socle/api#2@0')).toBe(false)
  })

  it('upsertRun remplace un run existant par son id', () => {
    const list = [rec('r1', 'k1')]
    const out = upsertRun(list, { ...rec('r1', 'k1'), status: 'done' })
    expect(out.length).toBe(1)
    expect(out[0].status).toBe('done')
  })

  it('upsertRun ajoute un run inconnu en tête', () => {
    const out = upsertRun([rec('r1', 'k1')], rec('r2', 'k2'))
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('upsertRun tronque au-delà de MAX_RUNS', () => {
    let list: RunRecord[] = []
    for (let i = 0; i < MAX_RUNS + 5; i++) list = upsertRun(list, rec(`r${i}`, `k${i}`))
    expect(list.length).toBe(MAX_RUNS)
    expect(list[0].id).toBe(`r${MAX_RUNS + 4}`)
  })

  it('parseRuns rend une liste vide sur JSON invalide', () => {
    expect(parseRuns('{pas du json')).toEqual([])
  })

  it('parseRuns écarte les entrées sans id ni key', () => {
    const raw = JSON.stringify([rec('r1', 'k1'), { nope: true }])
    expect(parseRuns(raw).map((r) => r.id)).toEqual(['r1'])
  })

  it('serializeRuns puis parseRuns conserve les données', () => {
    const list = [rec('r1', 'k1')]
    expect(parseRuns(serializeRuns(list))).toEqual(list)
  })
})
