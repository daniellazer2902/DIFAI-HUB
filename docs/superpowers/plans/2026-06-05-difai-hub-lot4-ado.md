# Lot 4 — Intégration ADO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher Azure DevOps dans l'IDE — board (US + tâches) lecture puis CRUD — via l'API REST en direct, multi-compte, en gardant la notion d'onglet et le découpage modulaire.

**Architecture:** Un `AdoModule` (process main) appelle l'API REST Azure DevOps (`fetch`) derrière une interface neutre `WorkItemProvider` (→ Jira plus tard). Les connexions sont globales (Réglages), le PAT chiffré via `safeStorage` ; chaque groupe se lie à `{connexion, projet, équipe}`. Côté renderer, un item gagne un `kind` (`'claude' | 'ado'`) ; un item `ado` ouvre un onglet (`TabKind 'ado'`) qui rend `<AdoBoard/>` (toggle Tree/Board).

**Tech Stack:** Electron 33, TypeScript, Zustand, Vitest. API REST Azure DevOps v7.1 (auth PAT Basic). `safeStorage` (Electron).

**Spec :** `docs/superpowers/specs/2026-06-05-difai-hub-lot4-ado-design.md`

**Périmètre de CE plan :** sous-lot **4.1 détaillé en TDD** (connexions + credential store + provider + WIQL + module IPC + Réglages). Les sous-lots **4.2→4.4** sont cadrés en roadmap à la fin (fichiers + tâches), à détailler en code complet une fois 4.1 livré et les payloads REST réels capturés.

**Convention :** voir `sessionModule.ts` (module + `register(ctx)`), `workspaceStore.ts` (persistance pure), `tests/sessionModule.test.ts` (fakeCtx). Tests dans `tests/`, lancés par `npm test`.

---

## File Structure (sous-lot 4.1)

- `src/shared/ipc.ts` — **Modifier** : canaux `Ado*`, types `AdoConnection`/`AdoProject`/`AdoTeam`/`AdoIteration`/`AdoWorkItem`/`AdoBoard`, méthodes `HubApi`.
- `src/main/ado/adoUrls.ts` — **Créer** : construction pure des URLs REST + header d'auth.
- `src/main/ado/wiql.ts` — **Créer** : construction pure des requêtes WIQL.
- `src/main/ado/WorkItemProvider.ts` — **Créer** : interface neutre + types provider.
- `src/main/ado/AdoProvider.ts` — **Créer** : implémentation REST (fetch injecté pour test).
- `src/main/ado/CredentialStore.ts` — **Créer** : PAT chiffrés via `safeStorage` (injecté pour test).
- `src/main/adoStore.ts` — **Créer** : persistance des connexions (`ado.json`), fonctions pures (modèle `workspaceStore`).
- `src/main/modules/adoModule.ts` — **Créer** : câblage IPC `Ado*` (modèle `sessionModule`).
- `src/main/AppContext.ts` — **Modifier** : exposer `credentials` + `adoStoreDir` au contexte.
- `src/main/index.ts` — **Modifier** : instancier `CredentialStore`, enregistrer `createAdoModule()`.
- `src/preload/index.ts` — **Modifier** : exposer les méthodes `ado*`.
- `src/renderer/src/components/Settings.tsx` — **Modifier** : section « Connexions ADO ».
- `src/renderer/src/components/AdoConnections.tsx` — **Créer** : liste + édition de connexions (UI).
- Tests : `tests/adoUrls.test.ts`, `tests/wiql.test.ts`, `tests/AdoProvider.test.ts`, `tests/CredentialStore.test.ts`, `tests/adoStore.test.ts`, `tests/adoModule.test.ts`.

---

## Task 1 : Contrat IPC + types partagés ADO

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1: Ajouter les types ADO** (après `WorkspaceTree`, avant `Unsub`)

```ts
// --- ADO (lot 4) ---
export interface AdoConnection {
  id: string
  label: string
  baseUrl: string // cloud: https://dev.azure.com/{org} | on-prem: https://serveur/tfs/{collection}
}
export interface AdoProject { id: string; name: string }
export interface AdoTeam { id: string; name: string }
export interface AdoIteration { id: string; name: string; path: string; current: boolean }
export interface AdoWorkItem {
  id: number
  type: string            // System.WorkItemType (User Story, Task, Bug…)
  title: string
  state: string           // System.State
  assignedTo: string | null
  parentId: number | null
  childCount: number
}
/** Board d'un sprint : colonnes (états du process) + US, chacune avec ses tâches. */
export interface AdoBoard {
  states: string[]                 // ordre des colonnes
  stories: AdoWorkItem[]           // cards (User Stories)
  tasksByParent: Record<number, AdoWorkItem[]>
}
export interface AdoError { ok: false; error: string; status?: number }
export type AdoResponse<T> = { ok: true; data: T } | AdoError
```

- [ ] **Step 2: Ajouter les canaux IPC** dans l'objet `IPC` (section renderer -> main)

```ts
  // ADO (renderer -> main)
  AdoConnList: 'ado:conn-list',
  AdoConnUpsert: 'ado:conn-upsert',
  AdoConnDelete: 'ado:conn-delete',
  AdoConnTest: 'ado:conn-test',
  AdoListProjects: 'ado:list-projects',
  AdoListTeams: 'ado:list-teams',
  AdoListIterations: 'ado:list-iterations',
  AdoListBoard: 'ado:list-board',
  AdoGetChildren: 'ado:get-children',
```

- [ ] **Step 3: Ajouter les méthodes à `HubApi`** (PAT passé en clair seulement à l'upsert ; jamais relu)

```ts
  adoConnList(): Promise<AdoConnection[]>
  adoConnUpsert(conn: AdoConnection, pat?: string): Promise<void>
  adoConnDelete(id: string): Promise<void>
  adoConnTest(id: string): Promise<AdoResponse<true>>
  adoListProjects(connId: string): Promise<AdoResponse<AdoProject[]>>
  adoListTeams(connId: string, project: string): Promise<AdoResponse<AdoTeam[]>>
  adoListIterations(connId: string, project: string, team?: string): Promise<AdoResponse<AdoIteration[]>>
  adoListBoard(p: { connId: string; project: string; team?: string; iterationPath?: string }): Promise<AdoResponse<AdoBoard>>
  adoGetChildren(connId: string, parentId: number): Promise<AdoResponse<AdoWorkItem[]>>
```

- [ ] **Step 4: Vérifier la compilation des types**

Run: `npx tsc --noEmit -p tsconfig.node.json` (et `tsconfig.web.json`)
Expected: aucune erreur liée à `ipc.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat(lot4): contrat IPC + types ADO"
```

---

## Task 2 : URLs REST + header d'auth (pur)

**Files:**
- Create: `src/main/ado/adoUrls.ts`
- Test: `tests/adoUrls.test.ts`

- [ ] **Step 1: Écrire les tests**

```ts
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
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run tests/adoUrls.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
const API = 'api-version=7.1'
const trim = (b: string): string => b.replace(/\/+$/, '')
const seg = (s: string): string => encodeURIComponent(s)

export function authHeader(pat: string): string {
  return 'Basic ' + Buffer.from(':' + pat).toString('base64')
}
export function projectsUrl(base: string): string {
  return `${trim(base)}/_apis/projects?${API}`
}
export function teamsUrl(base: string, project: string): string {
  return `${trim(base)}/_apis/projects/${seg(project)}/teams?${API}`
}
export function iterationsUrl(base: string, project: string, team?: string): string {
  const t = team ? `/${seg(team)}` : ''
  return `${trim(base)}/${seg(project)}${t}/_apis/work/teamsettings/iterations?${API}`
}
export function statesUrl(base: string, project: string, type: string): string {
  return `${trim(base)}/${seg(project)}/_apis/wit/workitemtypes/${seg(type)}/states?${API}`
}
export function wiqlUrl(base: string, project: string): string {
  return `${trim(base)}/${seg(project)}/_apis/wit/wiql?${API}`
}
export function batchUrl(base: string): string {
  return `${trim(base)}/_apis/wit/workitemsbatch?${API}`
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run tests/adoUrls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ado/adoUrls.ts tests/adoUrls.test.ts
git commit -m "feat(lot4): URLs REST ADO + auth Basic (pur, teste)"
```

---

## Task 3 : Constructeur WIQL (pur)

**Files:**
- Create: `src/main/ado/wiql.ts`
- Test: `tests/wiql.test.ts`

- [ ] **Step 1: Écrire les tests**

```ts
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
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run tests/wiql.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
const esc = (v: string): string => v.replace(/'/g, "''")

export interface StoriesQueryParams {
  project: string
  storyType: string
  iterationPath?: string
}
export function storiesQuery(p: StoriesQueryParams): string {
  const where = [
    `[System.TeamProject] = '${esc(p.project)}'`,
    `[System.WorkItemType] = '${esc(p.storyType)}'`
  ]
  if (p.iterationPath) where.push(`[System.IterationPath] = '${esc(p.iterationPath)}'`)
  return `SELECT [System.Id] FROM WorkItems WHERE ${where.join(' AND ')} ORDER BY [System.Id]`
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run tests/wiql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ado/wiql.ts tests/wiql.test.ts
git commit -m "feat(lot4): constructeur WIQL US par sprint (pur, teste)"
```

---

## Task 4 : Interface `WorkItemProvider` (neutre)

**Files:**
- Create: `src/main/ado/WorkItemProvider.ts`

- [ ] **Step 1: Écrire l'interface** (pas de test — contrat de types)

```ts
import type { AdoProject, AdoTeam, AdoIteration, AdoBoard, AdoWorkItem } from '../../shared/ipc'

/** Contrat neutre d'accès à un backlog (ADO aujourd'hui, Jira plus tard). */
export interface WorkItemProvider {
  testConnection(): Promise<{ ok: boolean; status?: number; error?: string }>
  listProjects(): Promise<AdoProject[]>
  listTeams(project: string): Promise<AdoTeam[]>
  listIterations(project: string, team?: string): Promise<AdoIteration[]>
  listBoard(p: { project: string; team?: string; iterationPath?: string }): Promise<AdoBoard>
  getChildren(parentId: number): Promise<AdoWorkItem[]>
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/main/ado/WorkItemProvider.ts
git commit -m "feat(lot4): interface neutre WorkItemProvider"
```

---

## Task 5 : `AdoProvider` (REST, fetch injecté)

**Files:**
- Create: `src/main/ado/AdoProvider.ts`
- Test: `tests/AdoProvider.test.ts`

Le `fetch` est injecté pour tester sans réseau. Signature : `type FetchLike = (url: string, init?: { method?: string; headers?: Record<string,string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>`.

- [ ] **Step 1: Écrire les tests**

```ts
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
    expect(board.stories.map((s) => s.id)).toEqual([10, 11])
    expect(board.stories[0]).toMatchObject({ id: 10, title: 'US A', state: 'Active', type: 'User Story' })
  })
})
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run tests/AdoProvider.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
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
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run tests/AdoProvider.test.ts`
Expected: PASS (3 tests). Si `getChildren` est appelé pour 10/11 dans le test board, le mock renvoie `{ value: [] }` via la branche par défaut → `tasksByParent` vides, OK.

- [ ] **Step 5: Commit**

```bash
git add src/main/ado/AdoProvider.ts tests/AdoProvider.test.ts
git commit -m "feat(lot4): AdoProvider REST (testConnection/listBoard/children, fetch injecte)"
```

---

## Task 6 : `CredentialStore` (safeStorage injecté)

**Files:**
- Create: `src/main/ado/CredentialStore.ts`
- Test: `tests/CredentialStore.test.ts`

Le `safeStorage` Electron et le système de fichiers sont injectés pour tester en mémoire.

- [ ] **Step 1: Écrire les tests**

```ts
import { describe, it, expect } from 'vitest'
import { CredentialStore } from '../src/main/ado/CredentialStore'

function fakeSafe() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('enc:' + s),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}
function fakeFs() {
  const mem = new Map<string, string>()
  return {
    mem,
    readFileSync: (p: string) => { if (!mem.has(p)) throw new Error('ENOENT'); return mem.get(p)! },
    writeFileSync: (p: string, d: string) => { mem.set(p, d) }
  }
}

describe('CredentialStore', () => {
  it('round-trip set/get d\'un PAT', () => {
    const fs = fakeFs()
    const cs = new CredentialStore('C:/userData', fakeSafe() as never, fs as never)
    cs.set('c1', 'secret-pat')
    expect(new CredentialStore('C:/userData', fakeSafe() as never, fs as never).get('c1')).toBe('secret-pat')
  })
  it('delete retire le PAT', () => {
    const fs = fakeFs()
    const cs = new CredentialStore('C:/userData', fakeSafe() as never, fs as never)
    cs.set('c1', 'p'); cs.delete('c1')
    expect(cs.get('c1')).toBeNull()
  })
  it('get inconnu => null', () => {
    const cs = new CredentialStore('C:/userData', fakeSafe() as never, fakeFs() as never)
    expect(cs.get('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run tests/CredentialStore.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
import { join } from 'node:path'

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}
interface FsLike {
  readFileSync(p: string, enc?: string): string
  writeFileSync(p: string, data: string, enc?: string): void
}

const FILE = 'credentials.json'

/** PAT chiffrés via safeStorage, sérialisés en base64 dans credentials.json. */
export class CredentialStore {
  private map: Record<string, string> // connId -> base64(cipher)
  constructor(private dir: string, private safe: SafeStorageLike, private fs: FsLike) {
    this.map = this.read()
  }
  private path(): string { return join(this.dir, FILE) }
  private read(): Record<string, string> {
    try { return JSON.parse(this.fs.readFileSync(this.path(), 'utf8')) } catch { return {} }
  }
  private flush(): void {
    try { this.fs.writeFileSync(this.path(), JSON.stringify(this.map), 'utf8') } catch { /* ignore */ }
  }
  set(connId: string, pat: string): void {
    if (!this.safe.isEncryptionAvailable()) { this.map[connId] = 'plain:' + Buffer.from(pat).toString('base64'); this.flush(); return }
    this.map[connId] = this.safe.encryptString(pat).toString('base64')
    this.flush()
  }
  get(connId: string): string | null {
    const v = this.map[connId]
    if (!v) return null
    if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString('utf8')
    try { return this.safe.decryptString(Buffer.from(v, 'base64')) } catch { return null }
  }
  delete(connId: string): void { delete this.map[connId]; this.flush() }
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run tests/CredentialStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/ado/CredentialStore.ts tests/CredentialStore.test.ts
git commit -m "feat(lot4): CredentialStore (PAT chiffres safeStorage, injecte pour test)"
```

---

## Task 7 : `adoStore` — persistance des connexions (pur)

**Files:**
- Create: `src/main/adoStore.ts`
- Test: `tests/adoStore.test.ts`

Modèle `workspaceStore` : fonctions pures `parse`/`serialize` + `load`/`save` sur `ado.json`. Pas de PAT (géré par `CredentialStore`).

- [ ] **Step 1: Écrire les tests**

```ts
import { describe, it, expect } from 'vitest'
import { parseConnections, serializeConnections, upsertConnection } from '../src/main/adoStore'

describe('adoStore', () => {
  it('parse une liste valide', () => {
    const raw = JSON.stringify([{ id: 'c1', label: 'Acme', baseUrl: 'https://dev.azure.com/acme' }])
    expect(parseConnections(raw)).toEqual([{ id: 'c1', label: 'Acme', baseUrl: 'https://dev.azure.com/acme' }])
  })
  it('ignore les entrées invalides et le JSON cassé', () => {
    expect(parseConnections('nope')).toEqual([])
    expect(parseConnections(JSON.stringify([{ id: 'x' }, { id: 'c1', label: 'A', baseUrl: 'u' }]))).toEqual([{ id: 'c1', label: 'A', baseUrl: 'u' }])
  })
  it('upsert ajoute puis remplace par id', () => {
    let list = upsertConnection([], { id: 'c1', label: 'A', baseUrl: 'u' })
    expect(list).toHaveLength(1)
    list = upsertConnection(list, { id: 'c1', label: 'A2', baseUrl: 'u2' })
    expect(list).toEqual([{ id: 'c1', label: 'A2', baseUrl: 'u2' }])
  })
  it('round-trip serialize/parse', () => {
    const list = [{ id: 'c1', label: 'A', baseUrl: 'u' }]
    expect(parseConnections(serializeConnections(list))).toEqual(list)
  })
})
```

- [ ] **Step 2: Lancer le test → échec**

Run: `npx vitest run tests/adoStore.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdoConnection } from '../shared/ipc'

function normConn(x: unknown): AdoConnection | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.baseUrl !== 'string') return null
  return { id: o.id, label: o.label, baseUrl: o.baseUrl }
}
export function parseConnections(raw: string): AdoConnection[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr.map(normConn).filter(Boolean) as AdoConnection[]) : []
  } catch { return [] }
}
export function serializeConnections(list: AdoConnection[]): string {
  return JSON.stringify(list, null, 2)
}
export function upsertConnection(list: AdoConnection[], conn: AdoConnection): AdoConnection[] {
  const i = list.findIndex((c) => c.id === conn.id)
  if (i < 0) return [...list, conn]
  const copy = [...list]; copy[i] = conn; return copy
}

const FILE = 'ado.json'
export function loadConnections(dir: string): AdoConnection[] {
  try { return parseConnections(readFileSync(join(dir, FILE), 'utf8')) } catch { return [] }
}
export function saveConnections(dir: string, list: AdoConnection[]): void {
  try { writeFileSync(join(dir, FILE), serializeConnections(list), 'utf8') } catch { /* ignore */ }
}
```

- [ ] **Step 4: Lancer le test → succès**

Run: `npx vitest run tests/adoStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/adoStore.ts tests/adoStore.test.ts
git commit -m "feat(lot4): adoStore persistance connexions (pur, teste)"
```

---

## Task 8 : `adoModule` — câblage IPC

**Files:**
- Create: `src/main/modules/adoModule.ts`
- Modify: `src/main/AppContext.ts`
- Test: `tests/adoModule.test.ts`

- [ ] **Step 1: Étendre `AppContext`** (ajouter, dans l'interface `AppContext`)

```ts
  /** PAT chiffrés (lot 4). */
  credentials: {
    set(connId: string, pat: string): void
    get(connId: string): string | null
    delete(connId: string): void
  }
```

(Le `userDataDir` existant sert aussi à `adoStore`.)

- [ ] **Step 2: Écrire les tests** (modèle `tests/sessionModule.test.ts`)

```ts
import { describe, it, expect, vi } from 'vitest'
import { createAdoModule } from '../src/main/modules/adoModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const creds = new Map<string, string>()
  const ctx = {
    ipc: { handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h), on: vi.fn() },
    userDataDir: 'C:/ud',
    credentials: {
      set: (id: string, p: string) => creds.set(id, p),
      get: (id: string) => creds.get(id) ?? null,
      delete: (id: string) => { creds.delete(id) }
    }
  } as unknown as AppContext
  return { ctx, handlers, creds }
}

describe('adoModule', () => {
  it('conn-upsert enregistre la connexion et le PAT', async () => {
    const { ctx, handlers, creds } = fakeCtx()
    createAdoModule({ providerFor: vi.fn() }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' }, 'pat-123')
    expect(creds.get('c1')).toBe('pat-123')
    expect(await handlers.get(IPC.AdoConnList)!({})).toEqual([{ id: 'c1', label: 'A', baseUrl: 'u' }])
  })

  it('conn-test délègue au provider', async () => {
    const { ctx, handlers } = fakeCtx()
    const provider = { testConnection: vi.fn(async () => ({ ok: true })) }
    const providerFor = vi.fn(() => provider)
    createAdoModule({ providerFor: providerFor as never }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' }, 'pat')
    const r = await handlers.get(IPC.AdoConnTest)!({}, 'c1')
    expect(r).toEqual({ ok: true, data: true })
    expect(provider.testConnection).toHaveBeenCalled()
  })

  it('conn-test sans PAT => ok:false', async () => {
    const { ctx, handlers } = fakeCtx()
    createAdoModule({ providerFor: vi.fn() as never }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' })
    expect(await handlers.get(IPC.AdoConnTest)!({}, 'c1')).toMatchObject({ ok: false })
  })

  it('list-board délègue au provider et renvoie data', async () => {
    const { ctx, handlers } = fakeCtx()
    const board = { states: ['New'], stories: [], tasksByParent: {} }
    const provider = { testConnection: vi.fn(), listBoard: vi.fn(async () => board) }
    createAdoModule({ providerFor: (() => provider) as never }).register(ctx)
    await handlers.get(IPC.AdoConnUpsert)!({}, { id: 'c1', label: 'A', baseUrl: 'u' }, 'pat')
    const r = await handlers.get(IPC.AdoListBoard)!({}, { connId: 'c1', project: 'Proj' })
    expect(r).toEqual({ ok: true, data: board })
  })
})
```

- [ ] **Step 3: Lancer le test → échec**

Run: `npx vitest run tests/adoModule.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 4: Implémenter**

```ts
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { AdoConnection, AdoResponse } from '../../shared/ipc'
import type { WorkItemProvider } from '../ado/WorkItemProvider'
import { AdoProvider } from '../ado/AdoProvider'
import { loadConnections, saveConnections, upsertConnection } from '../adoStore'

export interface AdoModuleDeps {
  /** Fabrique un provider pour une connexion + PAT (injectable pour test). */
  providerFor: (conn: AdoConnection, pat: string) => WorkItemProvider
}

const defaultDeps: AdoModuleDeps = {
  providerFor: (conn, pat) => new AdoProvider(conn, pat)
}

export function createAdoModule(deps: AdoModuleDeps = defaultDeps): HubModule {
  return {
    name: 'ado',
    register(ctx: AppContext): void {
      let conns = loadConnections(ctx.userDataDir)

      const provider = (connId: string): WorkItemProvider | null => {
        const conn = conns.find((c) => c.id === connId)
        const pat = ctx.credentials.get(connId)
        if (!conn || !pat) return null
        return deps.providerFor(conn, pat)
      }
      const wrap = async <T>(connId: string, fn: (p: WorkItemProvider) => Promise<T>): Promise<AdoResponse<T>> => {
        const p = provider(connId)
        if (!p) return { ok: false, error: 'Connexion ou PAT introuvable' }
        try { return { ok: true, data: await fn(p) } }
        catch (e) { return { ok: false, error: (e as Error).message, status: (e as { status?: number }).status } }
      }

      ctx.ipc.handle(IPC.AdoConnList, () => conns)
      ctx.ipc.handle(IPC.AdoConnUpsert, (_e, conn: AdoConnection, pat?: string) => {
        conns = upsertConnection(conns, conn)
        saveConnections(ctx.userDataDir, conns)
        if (pat) ctx.credentials.set(conn.id, pat)
      })
      ctx.ipc.handle(IPC.AdoConnDelete, (_e, id: string) => {
        conns = conns.filter((c) => c.id !== id)
        saveConnections(ctx.userDataDir, conns)
        ctx.credentials.delete(id)
      })
      ctx.ipc.handle(IPC.AdoConnTest, (_e, id: string): Promise<AdoResponse<true>> =>
        wrap(id, async (p) => { const r = await p.testConnection(); if (!r.ok) throw Object.assign(new Error(r.error ?? 'échec'), { status: r.status }); return true as const }))
      ctx.ipc.handle(IPC.AdoListProjects, (_e, id: string) => wrap(id, (p) => p.listProjects()))
      ctx.ipc.handle(IPC.AdoListTeams, (_e, id: string, project: string) => wrap(id, (p) => p.listTeams(project)))
      ctx.ipc.handle(IPC.AdoListIterations, (_e, id: string, project: string, team?: string) => wrap(id, (p) => p.listIterations(project, team)))
      ctx.ipc.handle(IPC.AdoListBoard, (_e, q: { connId: string; project: string; team?: string; iterationPath?: string }) =>
        wrap(q.connId, (p) => p.listBoard(q)))
      ctx.ipc.handle(IPC.AdoGetChildren, (_e, id: string, parentId: number) => wrap(id, (p) => p.getChildren(parentId)))
    }
  }
}
```

- [ ] **Step 5: Lancer le test → succès**

Run: `npx vitest run tests/adoModule.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/modules/adoModule.ts src/main/AppContext.ts tests/adoModule.test.ts
git commit -m "feat(lot4): adoModule (IPC connexions + board, provider injecte)"
```

---

## Task 9 : Câblage main + preload

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Instancier `CredentialStore` + enregistrer le module** dans `src/main/index.ts`

Ajouter les imports :
```ts
import { safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { CredentialStore } from './ado/CredentialStore'
import { createAdoModule } from './modules/adoModule'
```
Après la création de `sender` (avant le `ctx`) :
```ts
const credentialStore = new CredentialStore(app.getPath('userData'), safeStorage, { readFileSync, writeFileSync } as never)
```
Dans l'objet `ctx`, ajouter le champ :
```ts
  credentials: credentialStore,
```
Et ajouter le module au tableau :
```ts
const modules: HubModule[] = [createSessionModule(), createAgentsModule(), createAdoModule()]
```

- [ ] **Step 2: Exposer les méthodes dans `src/preload/index.ts`** (dans l'objet `hub`)

```ts
  adoConnList: () => ipcRenderer.invoke(IPC.AdoConnList),
  adoConnUpsert: (conn, pat) => ipcRenderer.invoke(IPC.AdoConnUpsert, conn, pat),
  adoConnDelete: (id) => ipcRenderer.invoke(IPC.AdoConnDelete, id),
  adoConnTest: (id) => ipcRenderer.invoke(IPC.AdoConnTest, id),
  adoListProjects: (id) => ipcRenderer.invoke(IPC.AdoListProjects, id),
  adoListTeams: (id, project) => ipcRenderer.invoke(IPC.AdoListTeams, id, project),
  adoListIterations: (id, project, team) => ipcRenderer.invoke(IPC.AdoListIterations, id, project, team),
  adoListBoard: (p) => ipcRenderer.invoke(IPC.AdoListBoard, p),
  adoGetChildren: (id, parentId) => ipcRenderer.invoke(IPC.AdoGetChildren, id, parentId),
```

- [ ] **Step 3: Compiler + lancer toute la suite**

Run: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json && npm test`
Expected: compile OK ; tous les tests verts (existants + nouveaux).

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(lot4): cablage CredentialStore + adoModule (main) + preload ado*"
```

---

## Task 10 : Réglages — gestion des connexions ADO (UI, checkpoint humain)

**Files:**
- Create: `src/renderer/src/components/AdoConnections.tsx`
- Modify: `src/renderer/src/components/Settings.tsx`

> UI : pas de TDD automatisé (validé au checkpoint humain, comme xterm — cf. spec §11). Code complet attendu.

- [ ] **Step 1: Créer `AdoConnections.tsx`**

Composant autonome : liste des connexions (`hub.adoConnList`), formulaire d'ajout/édition (label, baseUrl, PAT masqué), bouton « Tester » (`hub.adoConnTest` → toast ok/erreur), suppression (via `confirm()` du lot 3). Génère un `id` `c-<rand>` à la création. Le PAT n'est envoyé qu'à l'upsert et jamais relu (champ vide = inchangé).

```tsx
import { useEffect, useState } from 'react'
import type { AdoConnection } from '../../../shared/ipc'
import { confirm } from '../confirm'

export function AdoConnections(): React.JSX.Element {
  const [list, setList] = useState<AdoConnection[]>([])
  const [edit, setEdit] = useState<{ id: string; label: string; baseUrl: string; pat: string } | null>(null)
  const [status, setStatus] = useState<Record<string, string>>({})

  const refresh = (): void => { window.hub.adoConnList().then(setList) }
  useEffect(refresh, [])

  const startNew = (): void => setEdit({ id: 'c-' + Math.random().toString(36).slice(2, 8), label: '', baseUrl: '', pat: '' })
  const save = async (): Promise<void> => {
    if (!edit || !edit.label.trim() || !edit.baseUrl.trim()) return
    await window.hub.adoConnUpsert({ id: edit.id, label: edit.label.trim(), baseUrl: edit.baseUrl.trim() }, edit.pat || undefined)
    setEdit(null); refresh()
  }
  const test = async (id: string): Promise<void> => {
    setStatus((s) => ({ ...s, [id]: '…' }))
    const r = await window.hub.adoConnTest(id)
    setStatus((s) => ({ ...s, [id]: r.ok ? 'OK' : 'Échec : ' + (r.error ?? r.status) }))
  }
  const del = async (c: AdoConnection): Promise<void> => {
    if (await confirm({ title: 'Supprimer la connexion', message: `Supprimer « ${c.label} » ?`, danger: true })) {
      await window.hub.adoConnDelete(c.id); refresh()
    }
  }

  return (
    <div className="ado-conns">
      <div className="settings-row"><strong>Connexions ADO</strong><button onClick={startNew}>+ Ajouter</button></div>
      {list.map((c) => (
        <div key={c.id} className="ado-conn-row">
          <span>{c.label}</span><span className="muted">{c.baseUrl}</span>
          <button onClick={() => test(c.id)}>Tester</button>
          <button onClick={() => setEdit({ id: c.id, label: c.label, baseUrl: c.baseUrl, pat: '' })}>Éditer</button>
          <button onClick={() => del(c)}>Suppr.</button>
          {status[c.id] && <span className="muted">{status[c.id]}</span>}
        </div>
      ))}
      {edit && (
        <div className="ado-conn-edit">
          <input placeholder="Libellé" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
          <input placeholder="https://dev.azure.com/org" value={edit.baseUrl} onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })} />
          <input type="password" placeholder="PAT (laisser vide = inchangé)" value={edit.pat} onChange={(e) => setEdit({ ...edit, pat: e.target.value })} />
          <button onClick={save}>Enregistrer</button><button onClick={() => setEdit(null)}>Annuler</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Monter la section dans `Settings.tsx`**

Importer et insérer `<AdoConnections/>` dans une nouvelle section du panneau Settings (après les réglages existants).
```tsx
import { AdoConnections } from './AdoConnections'
// ... dans le JSX du panneau :
<hr /><AdoConnections />
```

- [ ] **Step 3: Vérifier la compilation web**

Run: `npx tsc --noEmit -p tsconfig.web.json`
Expected: aucune erreur. (Si `window.hub` n'est pas typé, vérifier la déclaration globale existante du renderer.)

- [ ] **Step 4: Checkpoint humain**

Lancer `npm run dev`. Ajouter une connexion ADO réelle (cloud ou on-prem), saisir un PAT, cliquer « Tester » → doit afficher « OK ». Vérifier que `ado.json` (userData) contient la connexion **sans** le PAT, et que `credentials.json` contient un blob chiffré. Relancer l'app → la connexion persiste.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AdoConnections.tsx src/renderer/src/components/Settings.tsx
git commit -m "feat(lot4): Reglages - gestion des connexions ADO + test connexion"
```

---

## Roadmap 4.2 → 4.4 (à détailler en code complet après livraison de 4.1)

> Ces sous-lots seront étoffés en tâches TDD bite-sized une fois 4.1 mergé et les payloads REST réels capturés (fixtures), comme le master plan l'a fait après le POC. Cadrage fichiers + tâches ci-dessous.

### Sous-lot 4.2 — Type d'item `ado` + onglet + vue Tree (lecture)

**Fichiers :**
- `src/renderer/src/store.ts` — `TabKind` += `'ado'` ; `KIND_PREFIX.ado='d'` ; `parseRef` ; `Item.kind`/`Item.ado` ; `paneRefs` pousse les items `ado` (sans `tabId`) ; `addItem` route l'onglet actif vers `tabRef('ado', …)` si `kind==='ado'` ; action `setAdoView(itemId, view)`.
- `src/shared/ipc.ts` + `src/main/workspaceStore.ts` — `PersistItem.kind?`/`ado?` ; `PersistGroup.ado?` ; `normItem`/`normGroup` (défaut `kind='claude'`) ; `toPersistable`/`loadWorkspace`.
- `src/renderer/src/components/GroupColorModal.tsx` (modèle) → nouvelle modale `AdoBindModal.tsx` (choisir connexion/projet/équipe via `adoListProjects`/`adoListTeams`).
- Menu `+` onglets + menu `···` groupe — sous-menu « Session Claude » / « ADO – Azure ».
- `src/renderer/src/components/Workspace.tsx` / `Pane.tsx` — si onglet `kind==='ado'`, monter `<AdoBoard/>`.
- `src/renderer/src/components/AdoBoard.tsx` (vue Tree d'abord) + `tests/store.test.ts` (kind, paneRefs ado, persistance).

**Tâches :** (1) store `kind`+`TabKind 'ado'`+tests ; (2) persistance migration+tests ; (3) `AdoBindModal` ; (4) sous-menu création ; (5) intégration `Workspace`/`Pane` ; (6) `AdoBoard` vue Tree (lecture via `adoListBoard`) ; (7) checkpoint humain.

### Sous-lot 4.3 — Vue Board (lecture) + détail US

**Fichiers :** `AdoBoard.tsx` (toggle Tree/Board, colonnes par `states`, cards US), `AdoStoryDetail.tsx` (drawer : champs + tâches enfants via `adoGetChildren`), sélecteur de sprint (`adoListIterations`). CSS board dans `index.html`.

**Tâches :** (1) toggle + rendu colonnes/cards ; (2) sélecteur sprint ; (3) drawer détail + tâches ; (4) états de chargement/erreur (bannière+retry) ; (5) checkpoint humain.

### Sous-lot 4.4 — Écriture (CRUD)

**Fichiers :** étendre `WorkItemProvider`/`AdoProvider` (`createChild`/`updateState`/`assign`/`move` — PATCH/POST json-patch) + tests provider ; canaux IPC + preload + `adoModule` (handlers write) + tests ; `AdoBoard` drag d'une card → `updateState` (optimiste + rollback) ; `AdoStoryDetail` actions (créer tâche, assigner, changer statut).

**Tâches :** (1) provider write + tests ; (2) IPC/module write + tests ; (3) drag board → updateState ; (4) actions détail (create/assign/state) ; (5) checkpoint humain.

---

## Self-Review (sous-lot 4.1)

- **Couverture spec 4.1** : connexions (Task 1,7,10), CredentialStore/safeStorage (Task 6,9), binding au groupe → 4.2 ; provider neutre (Task 4,5), WIQL (Task 3), URLs/auth (Task 2), AdoModule IPC (Task 8), preload (Task 9), Réglages UI + test connexion (Task 10). ✔
- **Placeholders** : aucun TODO/TBD ; code complet à chaque step. ✔
- **Cohérence types** : `AdoResponse<T>` = `{ok:true,data}` | `AdoError` utilisé identiquement dans `HubApi` (Task 1), `adoModule.wrap` (Task 8) et l'UI (Task 10). `providerFor(conn, pat)` cohérent entre `AdoModuleDeps` (Task 8) et `AdoProvider` constructeur (Task 5). `STORY_TYPE='User Story'` (Agile) documenté comme override futur (Scrum=PBI). ✔
- **Risque levé en premier** : Task 2→9 valident auth+REST avant toute UICard (4.3/4.4). ✔
