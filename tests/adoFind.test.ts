import { describe, it, expect } from 'vitest'
import { splitHighlight, itemMatches, storyVisible } from '../src/renderer/src/adoFind'
import type { AdoWorkItem } from '../src/shared/ipc'

const wi = (over: Partial<AdoWorkItem> = {}): AdoWorkItem => ({
  id: 42, type: 'User Story', title: 'Login page', state: 'Active', assignedTo: 'Daniel', parentId: null, childCount: 0, ...over
})

describe('adoFind', () => {
  it('splitHighlight sans terme → un seul segment non surligné', () => {
    expect(splitHighlight('Hello', '')).toEqual([{ text: 'Hello', hit: false }])
  })
  it('splitHighlight surligne les occurrences (insensible casse)', () => {
    expect(splitHighlight('LoginLOGIN', 'login')).toEqual([
      { text: 'Login', hit: true },
      { text: 'LOGIN', hit: true }
    ])
  })
  it('splitHighlight gère préfixe/suffixe', () => {
    expect(splitHighlight('a-log-b', 'log')).toEqual([
      { text: 'a-', hit: false },
      { text: 'log', hit: true },
      { text: '-b', hit: false }
    ])
  })
  it('splitHighlight sans correspondance', () => {
    expect(splitHighlight('abc', 'zzz')).toEqual([{ text: 'abc', hit: false }])
  })

  it('itemMatches sur titre / id / assigné / statut', () => {
    expect(itemMatches(wi(), 'login')).toBe(true)
    expect(itemMatches(wi(), '42')).toBe(true)
    expect(itemMatches(wi(), 'daniel')).toBe(true)
    expect(itemMatches(wi(), 'active')).toBe(true)
    expect(itemMatches(wi(), 'zzz')).toBe(false)
    expect(itemMatches(wi(), '')).toBe(false)
  })
  it('itemMatches gère assigné null', () => {
    expect(itemMatches(wi({ assignedTo: null }), 'daniel')).toBe(false)
  })

  it('storyVisible : terme vide → visible', () => {
    expect(storyVisible(wi({ title: 'x' }), [], '')).toBe(true)
  })
  it('storyVisible : visible si une tâche matche même si la story non', () => {
    const story = wi({ id: 1, title: 'Parent' })
    const tasks = [wi({ id: 2, title: 'fix login bug' })]
    expect(storyVisible(story, tasks, 'login')).toBe(true)
  })
  it('storyVisible : invisible si rien ne matche', () => {
    expect(storyVisible(wi({ id: 1, title: 'Parent' }), [wi({ id: 2, title: 'other' })], 'login')).toBe(false)
  })
})
