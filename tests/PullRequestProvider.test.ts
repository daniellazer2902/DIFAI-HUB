import { describe, it, expect, vi } from 'vitest'
import { PullRequestProvider } from '../src/main/ado/PullRequestProvider'

const conn = { id: 'c1', label: 'Acme', baseUrl: 'https://dev.azure.com/acme' }
const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve('') })

const pr = (id: number, repo: string, project: string) => ({
  pullRequestId: id,
  title: `PR ${id}`,
  createdBy: { displayName: 'Dev A' },
  sourceRefName: 'refs/heads/feat/x',
  targetRefName: 'refs/heads/develop',
  repository: { name: repo, project: { name: project }, webUrl: `https://dev.azure.com/acme/${project}/_git/${repo}` }
})

describe('PullRequestProvider', () => {
  it('resolveUserId lit authenticatedUser.id et ne rappelle pas l API', async () => {
    const fetchLike = vi.fn(() => ok({ authenticatedUser: { id: 'u-42' } }))
    const p = new PullRequestProvider(conn, 'tok', fetchLike as never)
    expect(await p.resolveUserId()).toBe('u-42')
    expect(await p.resolveUserId()).toBe('u-42')
    expect(fetchLike).toHaveBeenCalledTimes(1)
  })

  it('listAssigned interroge un projet par entrée de périmètre', async () => {
    const urls: string[] = []
    const fetchLike = vi.fn((url: string) => {
      urls.push(url)
      if (url.includes('connectionData')) return ok({ authenticatedUser: { id: 'u-42' } })
      return ok({ value: [pr(1, 'api', 'Socle')] })
    })
    const p = new PullRequestProvider(conn, 'tok', fetchLike as never)
    const out = await p.listAssigned([{ project: 'Socle', repos: [] }, { project: 'Catalogues', repos: [] }])
    expect(urls.filter((u) => u.includes('/pullrequests')).length).toBe(2)
    expect(out.length).toBe(2)
  })

  it('normalise une PR : branches sans refs/heads, url web, projet et repo', async () => {
    const fetchLike = vi.fn((url: string) =>
      url.includes('connectionData') ? ok({ authenticatedUser: { id: 'u' } }) : ok({ value: [pr(1842, 'PortailAsso', 'BanqueAlim')] }))
    const p = new PullRequestProvider(conn, 'tok', fetchLike as never)
    const [r] = await p.listAssigned([{ project: 'BanqueAlim', repos: [] }])
    expect(r).toMatchObject({
      prId: 1842, project: 'BanqueAlim', repo: 'PortailAsso', title: 'PR 1842',
      author: 'Dev A', sourceBranch: 'feat/x', targetBranch: 'develop'
    })
    expect(r.url).toBe('https://dev.azure.com/acme/BanqueAlim/_git/PortailAsso/pullrequest/1842')
  })

  it('filtre les repos hors périmètre', async () => {
    const fetchLike = vi.fn((url: string) =>
      url.includes('connectionData') ? ok({ authenticatedUser: { id: 'u' } })
        : ok({ value: [pr(1, 'api', 'Socle'), pr(2, 'batch', 'Socle')] }))
    const p = new PullRequestProvider(conn, 'tok', fetchLike as never)
    const out = await p.listAssigned([{ project: 'Socle', repos: ['api'] }])
    expect(out.map((r) => r.prId)).toEqual([1])
  })

  it('un projet en erreur n empêche pas les autres', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('connectionData')) return ok({ authenticatedUser: { id: 'u' } })
      if (url.includes('/Socle/')) return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}), text: () => Promise.resolve('nope') })
      return ok({ value: [pr(9, 'front', 'Catalogues')] })
    })
    const p = new PullRequestProvider(conn, 'tok', fetchLike as never)
    const out = await p.listAssigned([{ project: 'Socle', repos: [] }, { project: 'Catalogues', repos: [] }])
    expect(out.map((r) => r.prId)).toEqual([9])
  })
})
