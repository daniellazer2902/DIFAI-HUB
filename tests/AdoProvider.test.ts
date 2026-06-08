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
    expect(board.taskColumns.map((c) => c.name)).toEqual(['New', 'Active', 'Closed'])
    expect(board.stories.map((s) => s.id)).toEqual([10, 11])
    expect(board.stories[0]).toMatchObject({ id: 10, title: 'US A', state: 'Active', type: 'User Story' })
  })

  it('listBoard récupère les colonnes du taskboard (taskboardcolumns) quand une équipe est fournie', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/_apis/work/taskboardcolumns')) return ok({ columns: [
        { name: 'New', order: 0, mappings: [{ workItemType: 'Task', state: 'New' }] },
        { name: 'IN PR', order: 1, mappings: [{ workItemType: 'Task', state: 'Active' }] },
        { name: 'Closed', order: 2, mappings: [{ workItemType: 'Task', state: 'Closed' }] }
      ] })
      if (url.includes('/states')) return ok({ value: [{ name: 'New', order: 1 }, { name: 'Active', order: 2 }] })
      if (url.includes('/wiql')) return ok({ workItems: [] })
      return ok({ value: [] })
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const board = await p.listBoard({ project: 'Proj', team: 'Team A' })
    expect(board.taskColumns.map((c) => c.name)).toEqual(['New', 'IN PR', 'Closed'])
    expect(board.taskColumns[1].mappings).toEqual([{ workItemType: 'Task', state: 'Active' }])
  })

  it('listBoard sans équipe : repli sur les états du type Task comme colonnes', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/workitemtypes/Task/states')) return ok({ value: [{ name: 'New', order: 1 }, { name: 'Done', order: 2 }] })
      if (url.includes('/states')) return ok({ value: [{ name: 'New', order: 1 }] })
      if (url.includes('/wiql')) return ok({ workItems: [] })
      return ok({ value: [] })
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const board = await p.listBoard({ project: 'Proj' })
    expect(board.taskColumns.map((c) => c.name)).toEqual(['New', 'Done'])
    expect(board.taskColumns[0].mappings).toEqual([{ workItemType: 'Task', state: 'New' }])
  })

  it('getDetail mappe les champs + commentaires (HTML sans image inchangé)', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/comments')) return ok({ comments: [
        { text: '<p>hi</p>', createdBy: { displayName: 'Bob' }, createdDate: '2026-01-01' }
      ] })
      if (url.includes('/workitems/42')) return ok({ id: 42, fields: {
        'System.Title': 'T', 'System.WorkItemType': 'User Story', 'System.State': 'Active',
        'System.AssignedTo': { displayName: 'Alice' },
        'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'Microsoft.VSTS.Common.Priority': 2,
        'System.Description': '<p>desc</p>', 'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>ac</p>'
      } })
      return ok({})
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const d = await p.getDetail('Proj', 42)
    expect(d).toMatchObject({
      id: 42, title: 'T', type: 'User Story', state: 'Active', assignedTo: 'Alice',
      storyPoints: 5, priority: 2, descriptionHtml: '<p>desc</p>', acceptanceCriteriaHtml: '<p>ac</p>'
    })
    expect(d.comments).toEqual([{ author: 'Bob', date: '2026-01-01', html: '<p>hi</p>' }])
  })

  it('getDetail : champs absents → null/chaîne vide, commentaires en erreur → []', async () => {
    const fetchLike = vi.fn((url: string) => {
      if (url.includes('/comments')) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
      if (url.includes('/workitems/7')) return ok({ id: 7, fields: { 'System.Title': 'X', 'System.WorkItemType': 'Task', 'System.State': 'New' } })
      return ok({})
    })
    const p = new AdoProvider(conn, 'tok', fetchLike as never)
    const d = await p.getDetail('Proj', 7)
    expect(d).toMatchObject({ id: 7, assignedTo: null, storyPoints: null, priority: null, descriptionHtml: '', acceptanceCriteriaHtml: '' })
    expect(d.comments).toEqual([])
  })
})
