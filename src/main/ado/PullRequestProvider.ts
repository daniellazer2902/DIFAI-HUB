import type { AdoConnection, AdoPullRequest, AdoWatchScope } from '../../shared/ipc'
import { authHeader, connectionDataUrl, assignedPullRequestsUrl, pullRequestWebUrl } from './adoUrls'
import { matchesScope } from '../../shared/automationScope'
import type { FetchLike } from './AdoProvider'

const shortBranch = (ref: string): string => (ref ?? '').replace(/^refs\/heads\//, '')

export class PullRequestProvider {
  private userId: string | null = null

  constructor(
    private conn: AdoConnection,
    private pat: string,
    private fetchImpl: FetchLike = fetch as unknown as FetchLike
  ) {}

  private async get(url: string): Promise<any> {
    const r = await this.fetchImpl(url, { headers: { Authorization: authHeader(this.pat), Accept: 'application/json' } })
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
    return r.json()
  }

  /** Identité de l'utilisateur du PAT ; résolue une seule fois par connexion. */
  async resolveUserId(): Promise<string> {
    if (this.userId) return this.userId
    const d = await this.get(connectionDataUrl(this.conn.baseUrl))
    this.userId = String(d?.authenticatedUser?.id ?? '')
    return this.userId
  }

  async listAssigned(scope: AdoWatchScope[]): Promise<AdoPullRequest[]> {
    const uid = await this.resolveUserId()
    if (!uid) return []
    const base = this.conn.baseUrl.replace(/\/+$/, '')
    const uniqueProjects = Array.from(new Map(scope.map((e) => [e.project, e])).keys())
    const out: AdoPullRequest[] = []
    for (const project of uniqueProjects) {
      let raw: any
      // Un projet inaccessible (droits, projet renommé) ne doit pas priver des autres.
      try { raw = await this.get(assignedPullRequestsUrl(base, project, uid)) } catch { continue }
      for (const p of raw?.value ?? []) {
        const projName = p?.repository?.project?.name ?? project
        const repo = p?.repository?.name ?? ''
        if (!matchesScope(scope, projName, repo)) continue
        out.push({
          prId: p.pullRequestId,
          project: projName,
          repo,
          title: p.title ?? '',
          author: p?.createdBy?.displayName ?? '—',
          sourceBranch: shortBranch(p.sourceRefName),
          targetBranch: shortBranch(p.targetRefName),
          url: pullRequestWebUrl(base, projName, repo, p.pullRequestId)
        })
      }
    }
    const seen = new Set<string>()
    return out.filter((pr) => {
      const key = `${pr.project}/${pr.repo}/${pr.prId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}
