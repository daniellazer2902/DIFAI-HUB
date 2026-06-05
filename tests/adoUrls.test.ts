import { describe, it, expect } from 'vitest'
import { authHeader, projectsUrl, teamsUrl, iterationsUrl, statesUrl, wiqlUrl, batchUrl } from '../src/main/ado/adoUrls'

describe('adoUrls', () => {
  const base = 'https://dev.azure.com/acme'
  it('authHeader encode le PAT en Basic', () => {
    expect(authHeader('mytoken')).toBe('Basic ' + Buffer.from(':mytoken').toString('base64'))
  })
  it('projectsUrl', () => {
    expect(projectsUrl(base)).toBe('https://dev.azure.com/acme/_apis/projects?api-version=7.1')
  })
  it('teamsUrl', () => {
    expect(teamsUrl(base, 'Proj')).toBe('https://dev.azure.com/acme/_apis/projects/Proj/teams?api-version=7.1')
  })
  it('iterationsUrl avec équipe encode les espaces', () => {
    expect(iterationsUrl(base, 'My Proj', 'Team A')).toBe(
      'https://dev.azure.com/acme/My%20Proj/Team%20A/_apis/work/teamsettings/iterations?api-version=7.1')
  })
  it('statesUrl encode le type', () => {
    expect(statesUrl(base, 'Proj', 'User Story')).toBe(
      'https://dev.azure.com/acme/Proj/_apis/wit/workitemtypes/User%20Story/states?api-version=7.1')
  })
  it('wiqlUrl scoppé projet', () => {
    expect(wiqlUrl(base, 'Proj')).toBe('https://dev.azure.com/acme/Proj/_apis/wit/wiql?api-version=7.1')
  })
  it('batchUrl', () => {
    expect(batchUrl(base)).toBe('https://dev.azure.com/acme/_apis/wit/workitemsbatch?api-version=7.1')
  })
  it('tolère un baseUrl avec slash final', () => {
    expect(projectsUrl('https://dev.azure.com/acme/')).toBe('https://dev.azure.com/acme/_apis/projects?api-version=7.1')
  })
})
