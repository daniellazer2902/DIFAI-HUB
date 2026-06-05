import type { WorkItemProvider } from './WorkItemProvider'
import type { AdoConnection, AdoProject, AdoTeam, AdoIteration, AdoBoard, AdoWorkItem } from '../../shared/ipc'
import { authHeader, projectsUrl, teamsUrl, iterationsUrl, statesUrl, wiqlUrl, batchUrl } from './adoUrls'
import { storiesQuery } from './wiql'

export interface FetchResponse { ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<FetchResponse>

const STORY_TYPE = 'User Story' // lot 4 : Agile. (Scrum=Product Backlog Item → override futur.)

export class AdoProvider implements WorkItemProvider {
  constructor(private conn: AdoConnection, private pat: string, private fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { Authorization: authHeader(this.pat), Accept: 'application/json' }
    if (json) h['Content-Type'] = 'application/json'
    return h
  }
  private async get(url: string): Promise<any> {
    const r = await this.fetchImpl(url, { headers: this.headers() })
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
    return r.json()
  }

  async testConnection(): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const r = await this.fetchImpl(projectsUrl(this.conn.baseUrl) + '&$top=1', { headers: this.headers() })
      return r.ok ? { ok: true } : { ok: false, status: r.status, error: await r.text() }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  async listProjects(): Promise<AdoProject[]> {
    return ((await this.get(projectsUrl(this.conn.baseUrl))).value ?? []).map((p: any) => ({ id: p.id, name: p.name }))
  }
  async listTeams(project: string): Promise<AdoTeam[]> {
    return ((await this.get(teamsUrl(this.conn.baseUrl, project))).value ?? []).map((t: any) => ({ id: t.id, name: t.name }))
  }
  async listIterations(project: string, team?: string): Promise<AdoIteration[]> {
    return ((await this.get(iterationsUrl(this.conn.baseUrl, project, team))).value ?? []).map((i: any) => ({
      id: i.id, name: i.name, path: i.path, current: i.attributes?.timeFrame === 'current'
    }))
  }
  async listBoard(p: { project: string; team?: string; iterationPath?: string }): Promise<AdoBoard> {
    const statesRaw = (await this.get(statesUrl(this.conn.baseUrl, p.project, STORY_TYPE))).value ?? []
    const states: string[] = [...statesRaw].sort((a, b) => a.order - b.order).map((s: any) => s.name)
    const wiql = await (await this.fetchImpl(wiqlUrl(this.conn.baseUrl, p.project), {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({ query: storiesQuery({ project: p.project, storyType: STORY_TYPE, iterationPath: p.iterationPath }) })
    })).json()
    const ids: number[] = (wiql.workItems ?? []).map((w: any) => w.id)
    const stories = ids.length ? await this.batch(ids) : []
    const tasksByParent: Record<number, AdoWorkItem[]> = {}
    for (const s of stories) tasksByParent[s.id] = await this.getChildren(s.id)
    return { states, stories, tasksByParent }
  }
  async getChildren(parentId: number): Promise<AdoWorkItem[]> {
    const r = await this.get(`${this.conn.baseUrl.replace(/\/+$/, '')}/_apis/wit/workitems/${parentId}?$expand=relations&api-version=7.1`)
    const childIds: number[] = (r.relations ?? [])
      .filter((rel: any) => rel.rel === 'System.LinkTypes.Hierarchy-Forward')
      .map((rel: any) => Number(rel.url.split('/').pop()))
    return childIds.length ? this.batch(childIds) : []
  }
  private async batch(ids: number[]): Promise<AdoWorkItem[]> {
    const r = await this.fetchImpl(batchUrl(this.conn.baseUrl), {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({ ids, fields: ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.AssignedTo', 'System.Parent'] })
    })
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
    const value = (await r.json()).value ?? []
    return value.map((w: any): AdoWorkItem => ({
      id: w.id,
      type: w.fields['System.WorkItemType'],
      title: w.fields['System.Title'],
      state: w.fields['System.State'],
      assignedTo: w.fields['System.AssignedTo']?.displayName ?? null,
      parentId: w.fields['System.Parent'] ?? null,
      childCount: 0
    }))
  }
}
