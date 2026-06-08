import { describe, it, expect, vi } from 'vitest'
import { AdoProvider } from '../src/main/ado/AdoProvider'

const conn = { id: 'c1', label: 'Acme', baseUrl: 'https://dev.azure.com/acme' }
const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve('') })

describe('AdoProvider', () => {
  it('testConnection appelle projects?$top=1 avec le header Basic', async () => {
    const fetchLike = vi.fn(() => ok({ value: [] }))
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const r = await p.testConnection()
    expect(r.ok).toBe(true)
    const [url, init] = fetchLike.mock.calls[0]
    expect(url).toContain('/_apis/projects?')
    expect((init as any).headers.Authorization).toBe('Basic ' + Buffer.from(':tok').toString('base64'))
  })

  it('testConnection renvoie ok:false sur 401', async () => {
    const fetchLike = vi.fn(() => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}), text: () => Promise.resolve('denied') }))
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    expect((await p.testConnection())).toMatchObject({ ok: false, status: 401 })
  })

  it('listBoard récupère les US (WIQL+batch) et leurs tâches, groupe par parent', async () => {
    const calls: string[] = []
    const fetchLike = vi.fn((url: string) => {
      calls.push(url)
      if (url.includes('/states')) return ok({ value: [{ name: 'New', order: 1 }, { name: 'Active', order: 2 }, { name: 'Closed', order: 3 }] })
      if (url.includes('/wiql')) return ok({ workItems: [{ id: 10 }, { id: 11 }] })
      if (url.includes('/workitemsbatch')) return ok({ value: [
        { id: 10, fields: { 'System.WorkItemType': 'User Story', 'System.Title': 'US A', 'System.State': 'Active' } },
        { id: 11, fields: { 'System.WorkItemType': 'User Story', 'System.Title': 'US B', 'System.State': 'New' } }
      ] })
      if (url.includes('/workitems/10') || url.includes('id=10')) return ok({ value: [] })
      return ok({ value: [] })
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const board = await p.listBoard({ project: 'Proj', iterationPath: 'Proj\\S1' })
    expect(board.states).toEqual(['New', 'Active', 'Closed'])
    expect(board.taskStates).toEqual(['New', 'Active', 'Closed'])
    expect(board.stories.map((s) => s.id)).toEqual([10, 11])
    expect(board.stories[0]).toMatchObject({ id: 10, title: 'US A', state: 'Active', type: 'User Story' })
  })

  it('listBoard expose les états du type Task (colonnes du taskboard), triés par order', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/workitemtypes/Task/states')) {
        return ok({ value: [{ name: 'Closed', order: 3 }, { name: 'New', order: 1 }, { name: 'In PR', order: 2 }] })
      }
      if (url.includes('/states')) return ok({ value: [{ name: 'New', order: 1 }, { name: 'Active', order: 2 }] })
      if (url.includes('/wiql')) return ok({ workItems: [] })
      return ok({ value: [] })
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const board = await p.listBoard({ project: 'Proj' })
    expect(board.taskStates).toEqual(['New', 'In PR', 'Closed'])
  })
})
