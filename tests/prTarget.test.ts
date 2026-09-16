import { describe, it, expect } from 'vitest'
import { parsePrTarget } from '../src/renderer/src/prTarget'
import type { AdoWatchScope } from '../src/shared/ipc'

const large: AdoWatchScope[] = [{ project: 'Socle', repos: [] }, { project: 'Catalogues', repos: [] }]
const precis: AdoWatchScope[] = [{ project: 'Socle', repos: ['api'] }]

describe('parsePrTarget', () => {
  it('lit projet, dépôt et identifiant dans une adresse Azure DevOps', () => {
    const r = parsePrTarget('https://dev.azure.com/acme/Socle/_git/api/pullrequest/1842', large)
    expect(r).toEqual({
      ok: true,
      target: { project: 'Socle', repo: 'api', prId: 1842, url: 'https://dev.azure.com/acme/Socle/_git/api/pullrequest/1842' }
    })
  })

  it('tronque ce qui suit l identifiant dans l adresse', () => {
    const r = parsePrTarget('https://dev.azure.com/acme/Socle/_git/api/pullrequest/7?_a=files', large)
    expect(r.ok && r.target.url).toBe('https://dev.azure.com/acme/Socle/_git/api/pullrequest/7')
  })

  it('décode les segments échappés', () => {
    const r = parsePrTarget('https://dev.azure.com/acme/Mon%20Projet/_git/mon%20depot/pullrequest/12', large)
    expect(r.ok && r.target.project).toBe('Mon Projet')
    expect(r.ok && r.target.repo).toBe('mon depot')
  })

  it('accepte un identifiant seul quand le périmètre ne laisse aucun doute', () => {
    const r = parsePrTarget(' 1842 ', precis)
    expect(r).toEqual({ ok: true, target: { project: 'Socle', repo: 'api', prId: 1842, url: '' } })
  })

  it('refuse un identifiant seul sur un périmètre ambigu', () => {
    const r = parsePrTarget('1842', large)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('adresse complète')
  })

  it('refuse une saisie vide', () => {
    expect(parsePrTarget('   ', precis).ok).toBe(false)
  })

  it('refuse une adresse qui ne désigne pas une pull request', () => {
    const r = parsePrTarget('https://dev.azure.com/acme/Socle/_git/api', precis)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('non reconnue')
  })
})
