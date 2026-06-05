import { describe, it, expect } from 'vitest'
import { storiesQuery } from '../src/main/ado/wiql'

describe('wiql', () => {
  it('requête US d\'un sprint donné', () => {
    const q = storiesQuery({ project: 'Proj', iterationPath: 'Proj\\Sprint 1', storyType: 'User Story' })
    expect(q).toContain("[System.WorkItemType] = 'User Story'")
    expect(q).toContain("[System.IterationPath] = 'Proj\\Sprint 1'")
    expect(q).toContain("[System.TeamProject] = 'Proj'")
    expect(q.startsWith('SELECT [System.Id] FROM WorkItems WHERE')).toBe(true)
  })
  it('sans iterationPath n\'ajoute pas le filtre sprint', () => {
    const q = storiesQuery({ project: 'Proj', storyType: 'User Story' })
    expect(q).not.toContain('IterationPath')
  })
  it('échappe les apostrophes', () => {
    const q = storiesQuery({ project: "O'Proj", storyType: 'User Story' })
    expect(q).toContain("[System.TeamProject] = 'O''Proj'")
  })
})
