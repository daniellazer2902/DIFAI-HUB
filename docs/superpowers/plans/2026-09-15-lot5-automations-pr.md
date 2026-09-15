# Lot 5 — Automations de review de PR — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une automation configurée dans un groupe surveille les pull requests Azure DevOps où l'utilisateur est reviewer, lance pour chaque nouvelle PR une session Claude amorcée dans un onglet d'arrière-plan, et notifie par toast la fin du run ou l'attente d'une réponse.

**Architecture:** Un module main (`automationModule`) tient un ordonnanceur par automation ; la découverte des PR passe par l'API REST Azure DevOps (aucun git local) ; le lancement réutilise `PtyManager` et les états viennent du `HookServer` existant. Le renderer est la source de vérité de la configuration (persistée dans `workspace.json`) et la pousse au main ; il reçoit en retour les créations et changements d'état de runs.

**Tech Stack:** Electron + electron-vite, TypeScript, React 18, zustand, node-pty, vitest (environnement `node`).

**Spec:** `docs/superpowers/specs/2026-09-15-lot5-automations-review-pr-design.md`

## Global Constraints

- Branche de travail : `feat/lot5-automations-pr` (déjà créée depuis `main`). Commits locaux libres, **aucun push sans demande explicite**.
- Messages de commit en français, accents obligatoires. Sur Windows, écrire le message dans un fichier UTF-8 et utiliser `git commit -F`, jamais `-m` avec des accents.
- Aucune mention d'outillage dans les commits, les noms de fichiers/branches, les commentaires de code ou la documentation.
- Commentaires de code rares et sobres : uniquement le *pourquoi* non déductible du code. Jamais de paraphrase de la ligne suivante.
- Toute API ADO en `api-version=7.1`, via les fabriques d'URL de `src/main/ado/adoUrls.ts`.
- Tous les providers réseau prennent un `FetchLike` injectable (voir `AdoProvider`), pour que les tests ne touchent jamais le réseau.
- Le PAT n'est jamais journalisé, jamais écrit sur disque hors `CredentialStore`, jamais renvoyé au renderer.
- Lancer `npm test` après chaque tâche ; la base est verte (295 tests) et doit le rester.
- `npx tsc --noEmit -p tsconfig.json` avant chaque commit : esbuild ne typecheck pas.

---

## Structure des fichiers

**Créés — partagé**
- `src/shared/automationScope.ts` — résolution du périmètre effectif (groupe / override), utilisable main et renderer.

**Créés — main**
- `src/main/ado/PullRequestProvider.ts` — identité de l'utilisateur et liste des PR assignées.
- `src/main/automations/runStore.ts` — journal `automations.json` (clé, déduplication, troncature).
- `src/main/automations/renderPrompt.ts` — gabarit de prompt et substitution.
- `src/main/automations/runState.ts` — projection événement de hook → statut de run (pur).
- `src/main/automations/planTick.ts` — décisions d'un tick d'ordonnanceur (pur).
- `src/main/automations/AutomationRunner.ts` — construction des arguments et lancement du pty.
- `src/main/modules/automationModule.ts` — câblage IPC, timers, abonnements, notifications.

**Créés — renderer**
- `src/renderer/src/components/ToastHost.tsx` — pile de toasts en haut à droite.
- `src/renderer/src/components/AutomationStatusBar.tsx` — ligne d'état au-dessus de Paramètres.
- `src/renderer/src/components/AutomationModal.tsx` — configuration d'une automation.
- `src/renderer/src/toasts.ts` — store zustand des toasts (modèle `confirm.ts`).

**Modifiés**
- `src/shared/ipc.ts` — types partagés, canaux, `HubApi`.
- `src/main/ado/adoUrls.ts` — deux fabriques d'URL.
- `src/main/workspaceStore.ts` — lecture de `ado.watch` et de l'item `automation`.
- `src/main/index.ts` — enregistrement du module.
- `src/preload/index.ts` — exposition des nouveaux canaux.
- `src/renderer/src/store.ts` — `kind` d'item, runs, `toPersistable`.
- `src/renderer/src/App.tsx` — montage de `ToastHost`, abonnements, envoi de la configuration.
- `src/renderer/src/components/Sidebar.tsx` — item automation, badge, barre d'état.
- `src/renderer/src/components/icons.tsx` — icône d'automation.

---

### Task 1: Périmètre multi-projets porté par le groupe

**Files:**
- Modify: `src/shared/ipc.ts`
- Create: `src/shared/automationScope.ts`
- Modify: `src/main/workspaceStore.ts:41-49` (fonction `normGroup`)
- Test: `tests/automationScope.test.ts`, `tests/workspaceStore.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `AdoWatchScope`, `PersistAutomation`, `PersistGroup.ado.watch`, `effectiveScope(groupScope, override)`.

- [ ] **Step 1: Écrire le test du périmètre effectif**

Créer `tests/automationScope.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { effectiveScope } from '../src/shared/automationScope'

describe('effectiveScope', () => {
  it('hérite du périmètre du groupe quand l automation ne surcharge pas', () => {
    const group = [{ project: 'Socle', repos: [] }, { project: 'Catalogues', repos: ['api'] }]
    expect(effectiveScope(group, undefined)).toEqual(group)
  })

  it('utilise la surcharge de l automation quand elle est non vide', () => {
    const group = [{ project: 'Socle', repos: [] }]
    const over = [{ project: 'Prescription', repos: ['front'] }]
    expect(effectiveScope(group, over)).toEqual(over)
  })

  it('traite une surcharge vide comme une absence de surcharge', () => {
    const group = [{ project: 'Socle', repos: [] }]
    expect(effectiveScope(group, [])).toEqual(group)
  })

  it('renvoie une liste vide quand le groupe n a aucun périmètre', () => {
    expect(effectiveScope([], undefined)).toEqual([])
  })

  it('garde une PR quand la liste de repos est vide (tous les repos du projet)', () => {
    const { matchesScope } = require('../src/shared/automationScope')
    expect(matchesScope([{ project: 'Socle', repos: [] }], 'Socle', 'nimporte')).toBe(true)
  })

  it('filtre par repo quand la liste est renseignée', () => {
    const { matchesScope } = require('../src/shared/automationScope')
    const scope = [{ project: 'Socle', repos: ['api', 'front'] }]
    expect(matchesScope(scope, 'Socle', 'api')).toBe(true)
    expect(matchesScope(scope, 'Socle', 'batch')).toBe(false)
    expect(matchesScope(scope, 'Autre', 'api')).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/automationScope.test.ts`
Expected: FAIL — `Cannot find module '../src/shared/automationScope'`

- [ ] **Step 3: Ajouter les types partagés**

Dans `src/shared/ipc.ts`, après le bloc `// --- ADO (lot 4) ---` :

```ts
// --- Automations (lot 5) ---
/** Un projet ADO surveillé ; `repos` vide = tous les repos du projet. */
export interface AdoWatchScope { project: string; repos: string[] }

export interface PersistAutomation {
  trigger: 'reviewer-assigned'
  pollSeconds: number
  prompt: string
  allowedTools: string[]
  watch?: AdoWatchScope[]
  enabled: boolean
}
```

Étendre `PersistGroup.ado` et `PersistItem` (mêmes lignes qu'aujourd'hui, champs ajoutés) :

```ts
export interface PersistItem {
  id: string; name: string; cwd: string; split?: 1 | 2
  kind?: 'claude' | 'ado' | 'cmd' | 'note' | 'automation' | 'run'
  claudeArgs?: string[]
  ado?: { view: 'tree' | 'board'; iterationPath: string | null }
  note?: PersistNote
  automation?: PersistAutomation
}
export interface PersistGroup {
  id: string; name: string; collapsed: boolean; defaultCwd: string | null; color?: string | null
  ado?: { connId: string; project: string; team: string | null; watch?: AdoWatchScope[] } | null
  items: PersistItem[]
}
```

- [ ] **Step 4: Écrire `src/shared/automationScope.ts`**

```ts
import type { AdoWatchScope } from './ipc'

/** Périmètre appliqué à une automation : sa surcharge si elle en a une, sinon celui du groupe. */
export function effectiveScope(groupScope: AdoWatchScope[], override?: AdoWatchScope[]): AdoWatchScope[] {
  return override && override.length > 0 ? override : groupScope
}

/** Vrai si (project, repo) entre dans le périmètre. Une entrée sans repos couvre tout le projet. */
export function matchesScope(scope: AdoWatchScope[], project: string, repo: string): boolean {
  return scope.some((s) => s.project === project && (s.repos.length === 0 || s.repos.includes(repo)))
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/automationScope.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Écrire le test de persistance**

Ajouter dans `tests/workspaceStore.test.ts` :

```ts
it('relit le périmètre watch du groupe', () => {
  const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{
    id: 'g1', name: 'Cerba', collapsed: false, defaultCwd: null,
    ado: { connId: 'c1', project: 'Socle', team: null, watch: [
      { project: 'Socle', repos: [] }, { project: 'Catalogues', repos: ['api'] }
    ] },
    items: []
  }] })
  const t = parseWorkspace(raw)
  expect(t.groups[0].ado?.watch).toEqual([
    { project: 'Socle', repos: [] }, { project: 'Catalogues', repos: ['api'] }
  ])
})

it('ignore un watch mal formé sans perdre le bind ADO', () => {
  const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{
    id: 'g1', name: 'X', collapsed: false, defaultCwd: null,
    ado: { connId: 'c1', project: 'P', team: null, watch: 'nimporte quoi' }, items: []
  }] })
  const t = parseWorkspace(raw)
  expect(t.groups[0].ado?.connId).toBe('c1')
  expect(t.groups[0].ado?.watch).toBeUndefined()
})

it('relit un item automation avec sa configuration', () => {
  const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{
    id: 'g1', name: 'X', collapsed: false, defaultCwd: null,
    items: [{ id: 'i1', name: 'Review PR', cwd: 'C:/x', kind: 'automation', automation: {
      trigger: 'reviewer-assigned', pollSeconds: 300, prompt: 'p',
      allowedTools: ['Read'], enabled: true
    } }]
  }] })
  expect(parseWorkspace(raw).groups[0].items[0].automation?.pollSeconds).toBe(300)
})
```

- [ ] **Step 7: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/workspaceStore.test.ts`
Expected: FAIL — `watch` vaut `undefined` sur le premier test, `automation` vaut `undefined` sur le troisième.

- [ ] **Step 8: Étendre `normGroup` et `normItem`**

Dans `src/main/workspaceStore.ts`, remplacer la construction de `ado` dans `normGroup` :

```ts
  const ab = o.ado as Record<string, unknown> | undefined
  const watch = Array.isArray(ab?.watch)
    ? (ab!.watch as unknown[])
        .map((w) => {
          const e = w as Record<string, unknown>
          if (!e || typeof e.project !== 'string') return null
          const repos = Array.isArray(e.repos) ? e.repos.filter((r): r is string => typeof r === 'string') : []
          return { project: e.project, repos }
        })
        .filter(Boolean) as { project: string; repos: string[] }[]
    : undefined
  const ado = ab && typeof ab.connId === 'string' && typeof ab.project === 'string'
    ? {
        connId: ab.connId, project: ab.project,
        team: typeof ab.team === 'string' ? ab.team : null,
        ...(watch && watch.length ? { watch } : {})
      }
    : undefined
```

Dans `normItem`, élargir le `kind` et lire `automation` :

```ts
  const kind: PersistItem['kind'] =
    o.kind === 'ado' ? 'ado' : o.kind === 'cmd' ? 'cmd' : o.kind === 'note' ? 'note'
    : o.kind === 'automation' ? 'automation' : o.kind === 'claude' ? 'claude' : undefined
  let automation: PersistItem['automation'] | undefined
  const au = o.automation as Record<string, unknown> | undefined
  if (au && au.trigger === 'reviewer-assigned' && typeof au.prompt === 'string') {
    automation = {
      trigger: 'reviewer-assigned',
      pollSeconds: typeof au.pollSeconds === 'number' && au.pollSeconds >= 60 ? au.pollSeconds : 300,
      prompt: au.prompt,
      allowedTools: Array.isArray(au.allowedTools) ? au.allowedTools.filter((t): t is string => typeof t === 'string') : [],
      watch: Array.isArray(au.watch) ? (au.watch as { project: string; repos: string[] }[]) : undefined,
      enabled: au.enabled !== false
    }
  }
```

Puis ajouter `...(automation ? { automation } : {})` au retour de `normItem`.

Note : `kind: 'run'` n'est volontairement pas reconnu à la lecture — un onglet de run ne doit jamais revenir d'un redémarrage.

- [ ] **Step 9: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: PASS, aucun test existant cassé.

- [ ] **Step 10: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/shared/ipc.ts src/shared/automationScope.ts src/main/workspaceStore.ts tests/automationScope.test.ts tests/workspaceStore.test.ts
cat > .git/COMMIT_MSG_TMP <<'EOF'
feat(lot5): perimetre multi-projets porte par le groupe

Un groupe declare desormais une liste de projets ADO surveilles (cas Cerba :
catalogues, prescription, socle, transverse) en plus du projet du board.
EOF
git commit -F .git/COMMIT_MSG_TMP && rm -f .git/COMMIT_MSG_TMP
```

Remplacer le message par sa version accentuée avant de valider : « périmètre multi-projets porté par le groupe », « désormais », « surveillés ». Le heredoc écrit en UTF-8, les accents passent.

---

### Task 2: Découverte des pull requests assignées

**Files:**
- Modify: `src/main/ado/adoUrls.ts`
- Create: `src/main/ado/PullRequestProvider.ts`
- Modify: `src/shared/ipc.ts`
- Test: `tests/adoUrls.test.ts`, `tests/PullRequestProvider.test.ts`

**Interfaces:**
- Consumes: `AdoWatchScope`, `matchesScope` (Task 1), `FetchLike` et `authHeader` existants.
- Produces: `AdoPullRequest`, `PullRequestProvider.resolveUserId(): Promise<string>`, `PullRequestProvider.listAssigned(scope: AdoWatchScope[]): Promise<AdoPullRequest[]>`.

- [ ] **Step 1: Écrire le test des URLs**

Ajouter dans `tests/adoUrls.test.ts` :

```ts
import { connectionDataUrl, assignedPullRequestsUrl } from '../src/main/ado/adoUrls'

it('connectionDataUrl cible _apis/connectionData', () => {
  expect(connectionDataUrl('https://dev.azure.com/acme/'))
    .toBe('https://dev.azure.com/acme/_apis/connectionData?api-version=7.1')
})

it('assignedPullRequestsUrl filtre par reviewer et statut actif', () => {
  const u = assignedPullRequestsUrl('https://dev.azure.com/acme', 'Socle Tech', 'user-1')
  expect(u).toContain('/Socle%20Tech/_apis/git/pullrequests?')
  expect(u).toContain('searchCriteria.reviewerId=user-1')
  expect(u).toContain('searchCriteria.status=active')
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/adoUrls.test.ts`
Expected: FAIL — `connectionDataUrl is not a function`

- [ ] **Step 3: Ajouter les fabriques d'URL**

Dans `src/main/ado/adoUrls.ts` :

```ts
export function connectionDataUrl(base: string): string {
  return `${trim(base)}/_apis/connectionData?${API}`
}
export function assignedPullRequestsUrl(base: string, project: string, reviewerId: string): string {
  return `${trim(base)}/${seg(project)}/_apis/git/pullrequests`
    + `?searchCriteria.reviewerId=${seg(reviewerId)}&searchCriteria.status=active&${API}`
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/adoUrls.test.ts`
Expected: PASS

- [ ] **Step 5: Écrire le test du provider**

Créer `tests/PullRequestProvider.test.ts` :

```ts
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
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/PullRequestProvider.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 7: Ajouter le type partagé**

Dans `src/shared/ipc.ts`, section Automations :

```ts
export interface AdoPullRequest {
  prId: number
  project: string
  repo: string
  title: string
  author: string
  sourceBranch: string   // sans le préfixe refs/heads/
  targetBranch: string
  url: string            // URL web de la PR
}
```

- [ ] **Step 8: Écrire `src/main/ado/PullRequestProvider.ts`**

```ts
import type { AdoConnection, AdoPullRequest, AdoWatchScope } from '../../shared/ipc'
import { authHeader, connectionDataUrl, assignedPullRequestsUrl } from './adoUrls'
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

  /** PR actives où l'utilisateur est reviewer, sur tous les projets du périmètre. */
  async listAssigned(scope: AdoWatchScope[]): Promise<AdoPullRequest[]> {
    const uid = await this.resolveUserId()
    if (!uid) return []
    const base = this.conn.baseUrl.replace(/\/+$/, '')
    const out: AdoPullRequest[] = []
    for (const entry of scope) {
      let raw: any
      // Un projet inaccessible (droits, projet renommé) ne doit pas priver des autres.
      try { raw = await this.get(assignedPullRequestsUrl(base, entry.project, uid)) } catch { continue }
      for (const p of raw?.value ?? []) {
        const project = p?.repository?.project?.name ?? entry.project
        const repo = p?.repository?.name ?? ''
        if (!matchesScope(scope, project, repo)) continue
        out.push({
          prId: p.pullRequestId,
          project,
          repo,
          title: p.title ?? '',
          author: p?.createdBy?.displayName ?? '—',
          sourceBranch: shortBranch(p.sourceRefName),
          targetBranch: shortBranch(p.targetRefName),
          url: `${base}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}/pullrequest/${p.pullRequestId}`
        })
      }
    }
    return out
  }
}
```

- [ ] **Step 9: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/main/ado/adoUrls.ts src/main/ado/PullRequestProvider.ts src/shared/ipc.ts tests/adoUrls.test.ts tests/PullRequestProvider.test.ts
```

Message (fichier UTF-8, accents conservés) : `feat(lot5): découverte des PR où je suis reviewer`, corps : « Liste les PR actives par projet du périmètre, filtre par repo, et tolère un projet inaccessible sans perdre les autres. »

---

### Task 3: Journal des runs

**Files:**
- Create: `src/main/automations/runStore.ts`
- Modify: `src/shared/ipc.ts`
- Test: `tests/runStore.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `RunStatus`, `RunRecord`, `runKey(project, repo, prId, iterationId)`, `parseRuns(raw)`, `serializeRuns(list)`, `upsertRun(list, run)`, `hasKey(list, key)`, `loadRuns(dir)`, `saveRuns(dir, list)`, constante `MAX_RUNS = 200`.

- [ ] **Step 1: Écrire le test**

Créer `tests/runStore.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { runKey, parseRuns, serializeRuns, upsertRun, hasKey, MAX_RUNS } from '../src/main/automations/runStore'
import type { RunRecord } from '../src/shared/ipc'

const rec = (id: string, key: string): RunRecord => ({
  id, automationId: 'a1', key, project: 'P', repo: 'R', prId: 1, title: 't', url: 'u',
  startedAt: 1, endedAt: null, status: 'running', error: null, tabId: null
})

describe('runStore', () => {
  it('runKey combine projet, repo, PR et itération', () => {
    expect(runKey('Socle', 'api', 1842, 3)).toBe('Socle/api#1842@3')
  })

  it('hasKey détecte un run déjà enregistré', () => {
    const list = [rec('r1', 'Socle/api#1@0')]
    expect(hasKey(list, 'Socle/api#1@0')).toBe(true)
    expect(hasKey(list, 'Socle/api#2@0')).toBe(false)
  })

  it('upsertRun remplace un run existant par son id', () => {
    const list = [rec('r1', 'k1')]
    const out = upsertRun(list, { ...rec('r1', 'k1'), status: 'done' })
    expect(out.length).toBe(1)
    expect(out[0].status).toBe('done')
  })

  it('upsertRun ajoute un run inconnu en tête', () => {
    const out = upsertRun([rec('r1', 'k1')], rec('r2', 'k2'))
    expect(out.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('upsertRun tronque au-delà de MAX_RUNS', () => {
    let list: RunRecord[] = []
    for (let i = 0; i < MAX_RUNS + 5; i++) list = upsertRun(list, rec(`r${i}`, `k${i}`))
    expect(list.length).toBe(MAX_RUNS)
    expect(list[0].id).toBe(`r${MAX_RUNS + 4}`)
  })

  it('parseRuns rend une liste vide sur JSON invalide', () => {
    expect(parseRuns('{pas du json')).toEqual([])
  })

  it('parseRuns écarte les entrées sans id ni key', () => {
    const raw = JSON.stringify([rec('r1', 'k1'), { nope: true }])
    expect(parseRuns(raw).map((r) => r.id)).toEqual(['r1'])
  })

  it('serializeRuns puis parseRuns conserve les données', () => {
    const list = [rec('r1', 'k1')]
    expect(parseRuns(serializeRuns(list))).toEqual(list)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/runStore.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Ajouter les types partagés**

Dans `src/shared/ipc.ts`, section Automations :

```ts
export type RunStatus = 'pending' | 'queued' | 'running' | 'attention' | 'done' | 'failed'

export interface RunRecord {
  id: string
  automationId: string
  key: string            // `${project}/${repo}#${prId}@${iterationId}`
  project: string
  repo: string
  prId: number
  title: string
  url: string
  startedAt: number
  endedAt: number | null
  status: RunStatus
  error: string | null
  tabId: string | null
}
```

- [ ] **Step 4: Écrire `src/main/automations/runStore.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RunRecord, RunStatus } from '../../shared/ipc'

export const MAX_RUNS = 200
const FILE = 'automations.json'
const STATUSES: RunStatus[] = ['pending', 'queued', 'running', 'attention', 'done', 'failed']

/** Clé de déduplication d'un run. L'itération permettra plus tard le re-run sur push. */
export function runKey(project: string, repo: string, prId: number, iterationId: number): string {
  return `${project}/${repo}#${prId}@${iterationId}`
}

function normRun(x: unknown): RunRecord | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.key !== 'string') return null
  return {
    id: o.id,
    automationId: typeof o.automationId === 'string' ? o.automationId : '',
    key: o.key,
    project: typeof o.project === 'string' ? o.project : '',
    repo: typeof o.repo === 'string' ? o.repo : '',
    prId: typeof o.prId === 'number' ? o.prId : 0,
    title: typeof o.title === 'string' ? o.title : '',
    url: typeof o.url === 'string' ? o.url : '',
    startedAt: typeof o.startedAt === 'number' ? o.startedAt : 0,
    endedAt: typeof o.endedAt === 'number' ? o.endedAt : null,
    status: STATUSES.includes(o.status as RunStatus) ? (o.status as RunStatus) : 'failed',
    error: typeof o.error === 'string' ? o.error : null,
    tabId: typeof o.tabId === 'string' ? o.tabId : null
  }
}

export function parseRuns(raw: string): RunRecord[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr.map(normRun).filter(Boolean) as RunRecord[]) : []
  } catch { return [] }
}
export function serializeRuns(list: RunRecord[]): string {
  return JSON.stringify(list, null, 2)
}
export function hasKey(list: RunRecord[], key: string): boolean {
  return list.some((r) => r.key === key)
}
export function upsertRun(list: RunRecord[], run: RunRecord): RunRecord[] {
  const i = list.findIndex((r) => r.id === run.id)
  if (i >= 0) { const copy = [...list]; copy[i] = run; return copy }
  return [run, ...list].slice(0, MAX_RUNS)
}
export function loadRuns(dir: string): RunRecord[] {
  try { return parseRuns(readFileSync(join(dir, FILE), 'utf8')) } catch { return [] }
}
export function saveRuns(dir: string, list: RunRecord[]): void {
  try { writeFileSync(join(dir, FILE), serializeRuns(list), 'utf8') } catch { /* disque indisponible */ }
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/runStore.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/main/automations/runStore.ts src/shared/ipc.ts tests/runStore.test.ts
```

Message : `feat(lot5): journal des runs d'automation` — corps : « Fichier automations.json dans userData : clé de déduplication par PR et itération, troncature aux 200 derniers, parsing tolérant. »

---

### Task 4: Gabarit de prompt

**Files:**
- Create: `src/main/automations/renderPrompt.ts`
- Test: `tests/renderPrompt.test.ts`

**Interfaces:**
- Consumes: `AdoPullRequest` (Task 2).
- Produces: `renderPrompt(template, vars): string`, `promptVars(pr, org): Record<string, string>`, `DEFAULT_REVIEW_PROMPT`, `DEFAULT_ALLOWED_TOOLS`.

- [ ] **Step 1: Écrire le test**

Créer `tests/renderPrompt.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { renderPrompt, promptVars, DEFAULT_REVIEW_PROMPT, DEFAULT_ALLOWED_TOOLS } from '../src/main/automations/renderPrompt'
import type { AdoPullRequest } from '../src/shared/ipc'

const pr: AdoPullRequest = {
  prId: 1842, project: 'BanqueAlim', repo: 'PortailAsso', title: 'feat(proxidon): activation dédiée',
  author: 'Dev A', sourceBranch: 'feat/x', targetBranch: 'develop',
  url: 'https://dev.azure.com/acme/BanqueAlim/_git/PortailAsso/pullrequest/1842'
}

describe('renderPrompt', () => {
  it('substitue les variables connues', () => {
    expect(renderPrompt('PR {{prId}} sur {{repo}}', promptVars(pr, 'acme')))
      .toBe('PR 1842 sur PortailAsso')
  })

  it('laisse intacte une variable inconnue', () => {
    expect(renderPrompt('x {{inconnue}} y', promptVars(pr, 'acme'))).toBe('x {{inconnue}} y')
  })

  it('n interprète pas le contenu substitué', () => {
    const hostile = { ...pr, title: '{{prId}} et $(rm -rf /)' }
    const out = renderPrompt('Titre : {{title}}', promptVars(hostile, 'acme'))
    expect(out).toBe('Titre : {{prId}} et $(rm -rf /)')
  })

  it('substitue toutes les occurrences d une même variable', () => {
    expect(renderPrompt('{{repo}}/{{repo}}', promptVars(pr, 'acme'))).toBe('PortailAsso/PortailAsso')
  })

  it('le gabarit par défaut renseigne les quatre reponses du Step 0', () => {
    const out = renderPrompt(DEFAULT_REVIEW_PROMPT, promptVars(pr, 'acme'))
    expect(out).toContain('/difai-tech-devops-ado-code-review')
    expect(out).toContain('Organisation : acme')
    expect(out).toContain('Projet : BanqueAlim')
    expect(out).toContain('Repository : PortailAsso')
    expect(out).toContain('PR : 1842')
    expect(out).toContain('$ADO_PAT')
    expect(out).not.toContain('{{')
  })

  it('le préréglage d outils exclut l écriture de fichiers', () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Read')
    expect(DEFAULT_ALLOWED_TOOLS).not.toContain('Edit')
    expect(DEFAULT_ALLOWED_TOOLS).not.toContain('Write')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/renderPrompt.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/main/automations/renderPrompt.ts`**

```ts
import type { AdoPullRequest } from '../../shared/ipc'

/** Réponses du Step 0 de la skill de review, pour que le run ne se fige pas sur ses questions. */
export const DEFAULT_REVIEW_PROMPT = `/difai-tech-devops-ado-code-review

Revue de PR (mode 2 — commentaires postés sur la PR).
Organisation : {{org}} | Projet : {{project}} | Repository : {{repo}} | PR : {{prId}}
Titre : {{title}}
Authentification : utilise le PAT présent dans $ADO_PAT (en-tête Basic). N'utilise pas az CLI.
Ne vote pas et ne poste rien sur Teams sans me demander.`

export const DEFAULT_ALLOWED_TOOLS = [
  'Read', 'Grep', 'Glob', 'WebFetch', 'Skill',
  'Bash(curl:*)', 'Bash(git log:*)', 'Bash(git show:*)'
]

export function promptVars(pr: AdoPullRequest, org: string): Record<string, string> {
  return {
    org,
    project: pr.project,
    repo: pr.repo,
    prId: String(pr.prId),
    title: pr.title,
    author: pr.author,
    sourceBranch: pr.sourceBranch,
    targetBranch: pr.targetBranch,
    url: pr.url
  }
}

/**
 * Substitution littérale : la valeur remplacée n'est jamais relue, donc un titre de PR
 * contenant lui-même `{{...}}` reste du texte.
 */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : whole)
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/renderPrompt.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/main/automations/renderPrompt.ts tests/renderPrompt.test.ts
```

Message : `feat(lot5): gabarit du prompt d'amorçage` — corps : « Substitution littérale des variables de PR, gabarit par défaut renseignant les réponses attendues au démarrage de la skill de review. »

---

### Task 5: Décisions d'un tick et projection des états

**Files:**
- Create: `src/main/automations/planTick.ts`
- Create: `src/main/automations/runState.ts`
- Test: `tests/planTick.test.ts`, `tests/runState.test.ts`

**Interfaces:**
- Consumes: `AdoPullRequest` (Task 2), `RunRecord`, `RunStatus`, `runKey`, `hasKey` (Task 3).
- Produces: `planTick(input): TickPlan` avec `TickPlan = { toStart: AdoPullRequest[]; toPend: AdoPullRequest[] }` ; `statusFromHook(eventName, toolName, current): RunStatus | null` ; `statusFromExit(code): RunStatus` ; constante `MAX_CONCURRENT = 2`.

- [ ] **Step 1: Écrire le test des décisions de tick**

Créer `tests/planTick.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { planTick, MAX_CONCURRENT } from '../src/main/automations/planTick'
import type { AdoPullRequest, RunRecord } from '../src/shared/ipc'

const pr = (id: number): AdoPullRequest => ({
  prId: id, project: 'P', repo: 'R', title: `t${id}`, author: 'a',
  sourceBranch: 's', targetBranch: 'd', url: 'u'
})
const run = (key: string, status: RunRecord['status']): RunRecord => ({
  id: 'x' + key, automationId: 'a1', key, project: 'P', repo: 'R', prId: 0, title: '', url: '',
  startedAt: 0, endedAt: null, status, error: null, tabId: null
})

describe('planTick', () => {
  it('au premier tick, aucune PR ne démarre : toutes passent en attente de feu vert', () => {
    const plan = planTick({ prs: [pr(1), pr(2)], journal: [], firstTick: true, activeCount: 0 })
    expect(plan.toStart).toEqual([])
    expect(plan.toPend.map((p) => p.prId)).toEqual([1, 2])
  })

  it('aux ticks suivants, une PR inconnue démarre', () => {
    const plan = planTick({ prs: [pr(1)], journal: [], firstTick: false, activeCount: 0 })
    expect(plan.toStart.map((p) => p.prId)).toEqual([1])
    expect(plan.toPend).toEqual([])
  })

  it('ignore une PR déjà présente au journal, quel que soit son statut', () => {
    const journal = [run('P/R#1@0', 'done'), run('P/R#2@0', 'pending')]
    const plan = planTick({ prs: [pr(1), pr(2), pr(3)], journal, firstTick: false, activeCount: 0 })
    expect(plan.toStart.map((p) => p.prId)).toEqual([3])
  })

  it('respecte le plafond de concurrence', () => {
    const plan = planTick({ prs: [pr(1), pr(2), pr(3)], journal: [], firstTick: false, activeCount: 1 })
    expect(plan.toStart.length).toBe(MAX_CONCURRENT - 1)
    expect(plan.toPend).toEqual([])
  })

  it('ne démarre rien quand le plafond est atteint, sans rien mettre en attente', () => {
    const plan = planTick({ prs: [pr(1)], journal: [], firstTick: false, activeCount: MAX_CONCURRENT })
    expect(plan.toStart).toEqual([])
    expect(plan.toPend).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/planTick.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/main/automations/planTick.ts`**

```ts
import type { AdoPullRequest, RunRecord } from '../../shared/ipc'
import { runKey, hasKey } from './runStore'

export const MAX_CONCURRENT = 2

export interface TickInput {
  prs: AdoPullRequest[]
  journal: RunRecord[]
  firstTick: boolean
  activeCount: number
}
export interface TickPlan {
  toStart: AdoPullRequest[]
  toPend: AdoPullRequest[]
}

/**
 * Au premier tick suivant l'ouverture de l'application, les PR déjà assignées ne lancent pas de
 * run rétroactif : elles attendent un feu vert, sinon ouvrir l'IDE le matin lancerait toutes les
 * sessions de la journée d'un coup.
 */
export function planTick({ prs, journal, firstTick, activeCount }: TickInput): TickPlan {
  const inconnues = prs.filter((p) => !hasKey(journal, runKey(p.project, p.repo, p.prId, 0)))
  if (firstTick) return { toStart: [], toPend: inconnues }
  const creneaux = Math.max(0, MAX_CONCURRENT - activeCount)
  return { toStart: inconnues.slice(0, creneaux), toPend: [] }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/planTick.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Écrire le test de projection des états**

Créer `tests/runState.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { statusFromHook, statusFromExit } from '../src/main/automations/runState'

describe('statusFromHook', () => {
  it('UserPromptSubmit remet le run en cours', () => {
    expect(statusFromHook('UserPromptSubmit', undefined, 'attention')).toBe('running')
  })

  it('Stop met le run en attente : la session a fini de parler mais reste ouverte', () => {
    expect(statusFromHook('Stop', undefined, 'running')).toBe('attention')
  })

  it('Notification met le run en attente', () => {
    expect(statusFromHook('Notification', undefined, 'running')).toBe('attention')
  })

  it('PreToolUse sur AskUserQuestion met le run en attente', () => {
    expect(statusFromHook('PreToolUse', 'AskUserQuestion', 'running')).toBe('attention')
  })

  it('PreToolUse sur ExitPlanMode met le run en attente', () => {
    expect(statusFromHook('PreToolUse', 'ExitPlanMode', 'running')).toBe('attention')
  })

  it('PreToolUse sur un outil ordinaire ne change rien', () => {
    expect(statusFromHook('PreToolUse', 'Read', 'running')).toBeNull()
  })

  it('PostToolUse sur un outil interactif relance le run', () => {
    expect(statusFromHook('PostToolUse', 'AskUserQuestion', 'attention')).toBe('running')
  })

  it('un run terminé n est plus modifié par un hook tardif', () => {
    expect(statusFromHook('Stop', undefined, 'done')).toBeNull()
    expect(statusFromHook('Stop', undefined, 'failed')).toBeNull()
  })
})

describe('statusFromExit', () => {
  it('code 0 termine le run', () => { expect(statusFromExit(0)).toBe('done') })
  it('code non nul fait échouer le run', () => { expect(statusFromExit(1)).toBe('failed') })
})
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/runState.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 7: Écrire `src/main/automations/runState.ts`**

```ts
import type { RunStatus } from '../../shared/ipc'

const INTERACTIFS = new Set(['AskUserQuestion', 'ExitPlanMode'])
const TERMINES = new Set<RunStatus>(['done', 'failed'])

/**
 * Traduit un événement de hook en statut de run. `null` = pas de changement.
 * `Stop` signale la fin d'un tour, pas la fin du run : la session reste ouverte et attend.
 * Seule la sortie du processus termine un run (voir statusFromExit).
 */
export function statusFromHook(eventName: string, toolName: string | undefined, current: RunStatus): RunStatus | null {
  if (TERMINES.has(current)) return null
  switch (eventName) {
    case 'UserPromptSubmit':
      return 'running'
    case 'Stop':
    case 'Notification':
      return 'attention'
    case 'PreToolUse':
      return INTERACTIFS.has(toolName ?? '') ? 'attention' : null
    case 'PostToolUse':
      return INTERACTIFS.has(toolName ?? '') ? 'running' : null
    default:
      return null
  }
}

export function statusFromExit(code: number): RunStatus {
  return code === 0 ? 'done' : 'failed'
}
```

- [ ] **Step 8: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/main/automations/planTick.ts src/main/automations/runState.ts tests/planTick.test.ts tests/runState.test.ts
```

Message : `feat(lot5): décisions de tick et projection des états de run` — corps : « Garde-fou anti-rafale au démarrage, plafond de deux runs simultanés, et traduction des événements de hook en statut de run. »

---

### Task 6: Lancement d'un run

**Files:**
- Create: `src/main/automations/AutomationRunner.ts`
- Test: `tests/AutomationRunner.test.ts`

**Interfaces:**
- Consumes: `renderPrompt`, `promptVars` (Task 4), `PtyManager` existant, `AdoPullRequest`.
- Produces: `buildRunArgs(opts): string[]`, `AutomationRunner.start(opts): string` (renvoie le `tabId`), type `RunLaunchOptions`.

- [ ] **Step 1: Écrire le test**

Créer `tests/AutomationRunner.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'
import { AutomationRunner, buildRunArgs } from '../src/main/automations/AutomationRunner'
import { PtyManager } from '../src/main/PtyManager'
import type { AdoPullRequest } from '../src/shared/ipc'

const pr: AdoPullRequest = {
  prId: 1842, project: 'BanqueAlim', repo: 'PortailAsso', title: 'feat: x', author: 'Dev A',
  sourceBranch: 'feat/x', targetBranch: 'develop', url: 'u'
}

function fakePty() {
  const spawn = vi.fn(() => ({
    write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: vi.fn(), onExit: vi.fn()
  }))
  return { spawn, pty: new PtyManager({ spawn: spawn as never, claudePath: 'C:/claude.cmd' }) }
}

describe('buildRunArgs', () => {
  it('place le prompt en dernier, après les réglages et les outils', () => {
    const args = buildRunArgs({ settingsPath: 'S', allowedTools: ['Read', 'Grep'], prompt: 'P' })
    expect(args).toEqual(['--settings', 'S', '--allowedTools', 'Read,Grep', 'P'])
  })

  it('omet --allowedTools quand la liste est vide', () => {
    expect(buildRunArgs({ settingsPath: 'S', allowedTools: [], prompt: 'P' }))
      .toEqual(['--settings', 'S', 'P'])
  })
})

describe('AutomationRunner', () => {
  it('lance le pty dans le cwd demandé et renvoie un tabId', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 7000 })
    const tabId = runner.start({
      cwd: 'C:/travail/banque', org: 'acme', pat: 'secret',
      prompt: 'Revue {{prId}}', allowedTools: ['Read'], pr
    })
    expect(typeof tabId).toBe('string')
    const [, args, opts] = spawn.mock.calls[0]
    expect((opts as { cwd: string }).cwd).toBe('C:/travail/banque')
    expect((args as string[]).at(-1)).toBe('Revue 1842')
  })

  it('injecte le PAT et le port de hooks dans l environnement', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 7000 })
    runner.start({ cwd: 'C:/x', org: 'acme', pat: 'secret', prompt: 'p', allowedTools: [], pr })
    const env = (spawn.mock.calls[0][2] as { env: Record<string, string> }).env
    expect(env.ADO_PAT).toBe('secret')
    expect(env.DIFAI_HUB_PORT).toBe('7000')
    expect(env.DIFAI_HUB_TAB).toBeTruthy()
  })

  it('ne laisse aucune variable non substituée dans le prompt transmis', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 1 })
    runner.start({
      cwd: 'C:/x', org: 'acme', pat: 'p',
      prompt: '{{org}}/{{project}}/{{repo}}#{{prId}} {{title}}', allowedTools: [], pr
    })
    expect((spawn.mock.calls[0][1] as string[]).at(-1))
      .toBe('acme/BanqueAlim/PortailAsso#1842 feat: x')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/AutomationRunner.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/main/automations/AutomationRunner.ts`**

```ts
import type { PtyManager } from '../PtyManager'
import type { AdoPullRequest } from '../../shared/ipc'
import { renderPrompt, promptVars } from './renderPrompt'

export interface RunnerDeps {
  pty: PtyManager
  settingsPath: () => string
  hookPort: () => number
}

export interface RunLaunchOptions {
  cwd: string
  org: string
  pat: string
  prompt: string
  allowedTools: string[]
  pr: AdoPullRequest
}

export function buildRunArgs(o: { settingsPath: string; allowedTools: string[]; prompt: string }): string[] {
  return [
    '--settings', o.settingsPath,
    ...(o.allowedTools.length ? ['--allowedTools', o.allowedTools.join(',')] : []),
    o.prompt
  ]
}

export class AutomationRunner {
  constructor(private deps: RunnerDeps) {}

  /** Lance la session amorcée ; renvoie le tabId du pty créé. */
  start(o: RunLaunchOptions): string {
    const prompt = renderPrompt(o.prompt, promptVars(o.pr, o.org))
    return this.deps.pty.create(o.cwd, {
      args: buildRunArgs({ settingsPath: this.deps.settingsPath(), allowedTools: o.allowedTools, prompt }),
      env: { DIFAI_HUB_PORT: String(this.deps.hookPort()), ADO_PAT: o.pat }
    })
  }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/main/automations/AutomationRunner.ts tests/AutomationRunner.test.ts
```

Message : `feat(lot5): lancement d'une session de review amorcée` — corps : « Le prompt rendu est passé en argument positionnel ; le PAT et le port de hooks transitent par l'environnement du processus. »

---

### Task 7: Module main — câblage IPC, ordonnanceur, notifications

**Files:**
- Create: `src/main/modules/automationModule.ts`
- Modify: `src/shared/ipc.ts` (canaux et types de transport)
- Modify: `src/main/index.ts:19-52`
- Test: `tests/automationModule.test.ts`

**Interfaces:**
- Consumes: tout ce qui précède — `PullRequestProvider`, `runStore`, `planTick`, `runState`, `AutomationRunner`, `effectiveScope`.
- Produces: `createAutomationModule(deps?)`, canaux `IPC.AutomationSetConfig`, `IPC.AutomationRunNow`, `IPC.AutomationApprovePending`, `IPC.AutomationDismissPending`, `IPC.AutomationListRuns`, `IPC.AutomationRunStarted`, `IPC.AutomationRunUpdated`, `IPC.AutomationNotify`, types `AutomationConfig`, `AutomationToast`, `RunStartedPayload`.

- [ ] **Step 1: Ajouter les canaux et types partagés**

Dans `src/shared/ipc.ts`, dans l'objet `IPC` :

```ts
  // Automations (renderer -> main)
  AutomationSetConfig: 'automation:set-config',
  AutomationRunNow: 'automation:run-now',
  AutomationApprovePending: 'automation:approve-pending',
  AutomationDismissPending: 'automation:dismiss-pending',
  AutomationListRuns: 'automation:list-runs',
  // Automations (main -> renderer)
  AutomationRunStarted: 'automation:run-started',
  AutomationRunUpdated: 'automation:run-updated',
  AutomationNotify: 'automation:notify',
```

Et dans la section Automations :

```ts
/** Configuration poussée par le renderer : le périmètre est déjà résolu (héritage appliqué). */
export interface AutomationConfig {
  id: string
  groupId: string
  name: string
  cwd: string
  connId: string
  scope: AdoWatchScope[]
  trigger: 'reviewer-assigned'
  pollSeconds: number
  prompt: string
  allowedTools: string[]
  enabled: boolean
}

export type ToastLevel = 'done' | 'attention' | 'failed'
export interface AutomationToast {
  runId: string
  level: ToastLevel
  title: string
  body: string
}
export interface RunStartedPayload {
  runId: string
  groupId: string
  automationId: string
  tabId: string
  title: string
  cwd: string
}
```

- [ ] **Step 2: Écrire le test du module**

Créer `tests/automationModule.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutomationModule } from '../src/main/modules/automationModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'
import type { AdoPullRequest, AutomationConfig } from '../src/shared/ipc'

const pr = (id: number): AdoPullRequest => ({
  prId: id, project: 'P', repo: 'R', title: `t${id}`, author: 'a',
  sourceBranch: 's', targetBranch: 'd', url: `u${id}`
})

const config = (over: Partial<AutomationConfig> = {}): AutomationConfig => ({
  id: 'auto-1', groupId: 'g1', name: 'Review PR', cwd: 'C:/x', connId: 'c1',
  scope: [{ project: 'P', repos: [] }], trigger: 'reviewer-assigned', pollSeconds: 60,
  prompt: 'Revue {{prId}}', allowedTools: ['Read'], enabled: true, ...over
})

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const sent: { channel: string; args: unknown[] }[] = []
  let hookCb: ((e: unknown) => void) | null = null
  let exitCb: ((tabId: string, code: number) => void) | null = null
  const ctx = {
    ipc: {
      handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h),
      on: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h)
    },
    sender: { send: (channel: string, ...args: unknown[]) => { sent.push({ channel, args }) } },
    pty: { onExit: (cb: (t: string, c: number) => void) => { exitCb = cb; return () => {} } },
    registry: { register: vi.fn() },
    hookServer: { onEvent: (cb: (e: unknown) => void) => { hookCb = cb; return () => {} }, port: 7000 },
    hooksSettingsPath: () => 'S',
    userDataDir: 'C:/ud',
    credentials: { get: () => 'pat-secret', set: vi.fn(), delete: vi.fn() }
  } as unknown as AppContext
  return { ctx, handlers, sent, hook: () => hookCb!, exit: () => exitCb! }
}

function deps(prs: AdoPullRequest[], startedTabId = 'tab-1') {
  return {
    providerFor: () => ({ listAssigned: vi.fn(async () => prs), resolveUserId: vi.fn(async () => 'u') }),
    runnerFor: () => ({ start: vi.fn(() => startedTabId) }),
    connectionFor: () => ({ id: 'c1', label: 'acme', baseUrl: 'https://dev.azure.com/acme' }),
    loadRuns: () => [],
    saveRuns: vi.fn()
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('automationModule', () => {
  it('ne démarre aucun run au premier tick et notifie les PR en attente', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1), pr(2)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent.filter((s) => s.channel === IPC.AutomationRunStarted).length).toBe(0)
    const toast = sent.find((s) => s.channel === IPC.AutomationNotify)
    expect(toast).toBeTruthy()
    expect(JSON.stringify(toast!.args)).toContain('2')
  })

  it('une PR mise en attente ne démarre pas d elle-même au tick suivant', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)   // premier tick : mise en attente
    await vi.advanceTimersByTimeAsync(60_000)   // second tick : la PR reste en attente, pas de run
    expect(sent.filter((s) => s.channel === IPC.AutomationRunStarted).length).toBe(0)
  })

  it('approuver les PR en attente lance les runs', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    const started = sent.filter((s) => s.channel === IPC.AutomationRunStarted)
    expect(started.length).toBe(1)
    expect((started[0].args[0] as { tabId: string }).tabId).toBe('tab-1')
  })

  it('une automation désactivée ne tourne pas', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config({ enabled: false })])
    await vi.advanceTimersByTimeAsync(300_000)
    expect(sent.length).toBe(0)
  })

  it('un hook AskUserQuestion passe le run en attention et notifie', async () => {
    const { ctx, handlers, sent, hook } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    sent.length = 0
    hook()({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tabId: 'tab-1' })
    const notif = sent.find((s) => s.channel === IPC.AutomationNotify)
    expect((notif!.args[0] as { level: string }).level).toBe('attention')
  })

  it('la sortie du pty termine le run et notifie', async () => {
    const { ctx, handlers, sent, exit } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    sent.length = 0
    exit()('tab-1', 0)
    const notif = sent.find((s) => s.channel === IPC.AutomationNotify)
    expect((notif!.args[0] as { level: string }).level).toBe('done')
  })

  it('le PAT ne part jamais vers le renderer', async () => {
    const { ctx, handlers, sent } = fakeCtx()
    createAutomationModule(deps([pr(1)]) as never).register(ctx)
    await handlers.get(IPC.AutomationSetConfig)!({}, [config()])
    await vi.advanceTimersByTimeAsync(60_000)
    await handlers.get(IPC.AutomationApprovePending)!({})
    expect(JSON.stringify(sent)).not.toContain('pat-secret')
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/automationModule.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 4: Écrire `src/main/modules/automationModule.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { AdoConnection, AdoPullRequest, AutomationConfig, AutomationToast, RunRecord, RunStatus } from '../../shared/ipc'
import { PullRequestProvider } from '../ado/PullRequestProvider'
import { AutomationRunner } from '../automations/AutomationRunner'
import { loadRuns, saveRuns, runKey, upsertRun } from '../automations/runStore'
import { planTick, MAX_CONCURRENT } from '../automations/planTick'
import { statusFromHook, statusFromExit } from '../automations/runState'
import { loadConnections } from '../adoStore'
import type { HookEvent } from '../hookEvents'

export interface AutomationDeps {
  providerFor: (conn: AdoConnection, pat: string) => { listAssigned(scope: AutomationConfig['scope']): Promise<AdoPullRequest[]> }
  runnerFor: (ctx: AppContext) => { start(o: { cwd: string; org: string; pat: string; prompt: string; allowedTools: string[]; pr: AdoPullRequest }): string }
  connectionFor: (ctx: AppContext, connId: string) => AdoConnection | null
  loadRuns: (dir: string) => RunRecord[]
  saveRuns: (dir: string, list: RunRecord[]) => void
}

const defaultDeps: AutomationDeps = {
  providerFor: (conn, pat) => new PullRequestProvider(conn, pat),
  runnerFor: (ctx) => new AutomationRunner({
    pty: ctx.pty, settingsPath: () => ctx.hooksSettingsPath(), hookPort: () => ctx.hookServer.port
  }),
  connectionFor: (ctx, connId) => loadConnections(ctx.userDataDir).find((c) => c.id === connId) ?? null,
  loadRuns, saveRuns
}

/** Nom d'organisation lisible, extrait de l'URL de base de la connexion. */
function orgOf(conn: AdoConnection): string {
  return conn.baseUrl.replace(/\/+$/, '').split('/').pop() ?? conn.label
}

const ACTIFS = new Set<RunStatus>(['queued', 'running', 'attention'])

export function createAutomationModule(deps: AutomationDeps = defaultDeps): HubModule {
  return {
    name: 'automation',
    register(ctx: AppContext): void {
      let configs: AutomationConfig[] = []
      let runs: RunRecord[] = deps.loadRuns(ctx.userDataDir)
      const timers = new Map<string, ReturnType<typeof setInterval>>()
      const firstTickDone = new Set<string>()
      const pending = new Map<string, { config: AutomationConfig; pr: AdoPullRequest }>()

      const persist = (): void => deps.saveRuns(ctx.userDataDir, runs)
      const notify = (t: AutomationToast): void => ctx.sender.send(IPC.AutomationNotify, t)

      const setStatus = (runId: string, status: RunStatus, error: string | null = null): RunRecord | null => {
        const run = runs.find((r) => r.id === runId)
        if (!run) return null
        const next: RunRecord = {
          ...run, status, error,
          endedAt: status === 'done' || status === 'failed' ? Date.now() : run.endedAt
        }
        runs = upsertRun(runs, next)
        persist()
        ctx.sender.send(IPC.AutomationRunUpdated, next)
        return next
      }

      const startRun = (config: AutomationConfig, pr: AdoPullRequest, existingId?: string): void => {
        const conn = deps.connectionFor(ctx, config.connId)
        const pat = ctx.credentials.get(config.connId)
        const runId = existingId ?? randomUUID()
        if (!conn || !pat) {
          const record: RunRecord = {
            id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
            project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
            startedAt: Date.now(), endedAt: Date.now(), status: 'failed',
            error: 'Connexion ou PAT introuvable', tabId: null
          }
          runs = upsertRun(runs, record); persist()
          notify({ runId, level: 'failed', title: `Run impossible — !${pr.prId}`, body: 'Connexion ou PAT introuvable. Rien n\'a été posté.' })
          return
        }
        const tabId = deps.runnerFor(ctx).start({
          cwd: config.cwd, org: orgOf(conn), pat, prompt: config.prompt,
          allowedTools: config.allowedTools, pr
        })
        ctx.registry.register(tabId, config.cwd)
        const record: RunRecord = {
          id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
          project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
          startedAt: Date.now(), endedAt: null, status: 'running', error: null, tabId
        }
        runs = upsertRun(runs, record); persist()
        ctx.sender.send(IPC.AutomationRunStarted, {
          runId, groupId: config.groupId, automationId: config.id, tabId,
          title: `Review !${pr.prId}`, cwd: config.cwd
        })
      }

      const tick = async (config: AutomationConfig): Promise<void> => {
        const conn = deps.connectionFor(ctx, config.connId)
        const pat = ctx.credentials.get(config.connId)
        if (!conn || !pat) return
        let prs: AdoPullRequest[]
        try { prs = await deps.providerFor(conn, pat).listAssigned(config.scope) } catch { return }
        const first = !firstTickDone.has(config.id)
        const activeCount = runs.filter((r) => ACTIFS.has(r.status)).length
        const plan = planTick({ prs, journal: runs, firstTick: first, activeCount })
        firstTickDone.add(config.id)

        for (const pr of plan.toPend) {
          const runId = randomUUID()
          runs = upsertRun(runs, {
            id: runId, automationId: config.id, key: runKey(pr.project, pr.repo, pr.prId, 0),
            project: pr.project, repo: pr.repo, prId: pr.prId, title: pr.title, url: pr.url,
            startedAt: Date.now(), endedAt: null, status: 'pending', error: null, tabId: null
          })
          pending.set(runId, { config, pr })
        }
        if (plan.toPend.length > 0) {
          persist()
          notify({
            runId: '', level: 'attention',
            title: `${plan.toPend.length} PR en attente de review`,
            body: 'Détectées au démarrage. Lancer les reviews ?'
          })
        }
        for (const pr of plan.toStart) startRun(config, pr)
      }

      const rearm = (): void => {
        for (const t of timers.values()) clearInterval(t)
        timers.clear()
        for (const c of configs.filter((x) => x.enabled)) {
          timers.set(c.id, setInterval(() => { void tick(c) }, Math.max(60, c.pollSeconds) * 1000))
        }
      }

      ctx.ipc.handle(IPC.AutomationSetConfig, (_e, list: AutomationConfig[]) => {
        configs = Array.isArray(list) ? list : []
        rearm()
      })
      ctx.ipc.handle(IPC.AutomationListRuns, () => runs)
      ctx.ipc.handle(IPC.AutomationApprovePending, () => {
        const creneaux = MAX_CONCURRENT - runs.filter((r) => ACTIFS.has(r.status)).length
        for (const [runId, { config, pr }] of [...pending.entries()].slice(0, Math.max(0, creneaux))) {
          pending.delete(runId)
          startRun(config, pr, runId)
        }
      })
      ctx.ipc.handle(IPC.AutomationDismissPending, () => {
        for (const runId of pending.keys()) setStatus(runId, 'failed', 'Écarté au démarrage')
        pending.clear()
      })
      ctx.ipc.handle(IPC.AutomationRunNow, (_e, automationId: string, pr: AdoPullRequest) => {
        const config = configs.find((c) => c.id === automationId)
        if (config) startRun(config, pr)
      })

      ctx.hookServer.onEvent((raw) => {
        const e = raw as HookEvent
        const run = runs.find((r) => r.tabId && r.tabId === e.tabId)
        if (!run) return
        const next = statusFromHook(e.hook_event_name ?? '', e.tool_name, run.status)
        if (!next || next === run.status) return
        setStatus(run.id, next)
        if (next === 'attention') {
          notify({
            runId: run.id, level: 'attention',
            title: `Une réponse est attendue — !${run.prId}`,
            body: `${run.project} · ${run.repo} — la session t'attend.`
          })
        }
      })

      ctx.pty.onExit((tabId, code) => {
        const run = runs.find((r) => r.tabId === tabId)
        if (!run || run.status === 'done' || run.status === 'failed') return
        const status = statusFromExit(code)
        setStatus(run.id, status, status === 'failed' ? `Session terminée (code ${code})` : null)
        notify({
          runId: run.id, level: status === 'done' ? 'done' : 'failed',
          title: status === 'done' ? `Review terminée — !${run.prId}` : `Run interrompu — !${run.prId}`,
          body: `${run.project} · ${run.repo}`
        })
      })
    }
  }
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/automationModule.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Enregistrer le module**

Dans `src/main/index.ts`, ajouter l'import `import { createAutomationModule } from './modules/automationModule'` et `createAutomationModule()` à la fin du tableau `modules`.

- [ ] **Step 7: Lancer la suite complète**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/main/modules/automationModule.ts src/main/index.ts src/shared/ipc.ts tests/automationModule.test.ts
```

Message : `feat(lot5): module main des automations` — corps : « Ordonnanceur par automation, lancement des runs, suivi des états par les hooks et notifications vers le renderer. »

---

### Task 8: Pont preload et état renderer

**Files:**
- Modify: `src/shared/ipc.ts` (interface `HubApi`)
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: canaux et types de la Task 7.
- Produces: méthodes `HubApi.automationSetConfig`, `automationRunNow`, `automationApprovePending`, `automationDismissPending`, `automationListRuns`, `onAutomationRunStarted`, `onAutomationRunUpdated`, `onAutomationNotify` ; état de store `runs`, actions `addRunItem`, `setRun`, `automationConfigs()`.

- [ ] **Step 1: Écrire le test du store**

Ajouter dans `tests/store.test.ts` :

```ts
it('addRunItem crée un item de run dans le groupe, sans le sélectionner', () => {
  const s = useHub.getState()
  const gid = s.addGroup('G')
  useHub.getState().addRunItem({
    runId: 'r1', groupId: gid, automationId: 'a1', tabId: 'tab-1', title: 'Review !1842', cwd: 'C:/x'
  })
  const g = useHub.getState().groups.find((x) => x.id === gid)!
  const item = g.items.find((i) => i.kind === 'run')!
  expect(item.name).toBe('Review !1842')
  expect(item.tabId).toBe('tab-1')
  expect(g.leftActiveTab).not.toContain(item.id)
})

it('un item de run n est jamais persisté', () => {
  const s = useHub.getState()
  const gid = s.addGroup('G')
  useHub.getState().addRunItem({
    runId: 'r2', groupId: gid, automationId: 'a1', tabId: 'tab-2', title: 'Review !2', cwd: 'C:/x'
  })
  const tree = useHub.getState().toPersistable()
  const g = tree.groups.find((x) => x.id === gid)!
  expect(g.items.some((i) => i.kind === 'run')).toBe(false)
})

it('automationConfigs résout le périmètre hérité du groupe', () => {
  const s = useHub.getState()
  const gid = s.addGroup('Cerba')
  useHub.getState().setGroupAdo(gid, { connId: 'c1', project: 'Socle', team: null,
    watch: [{ project: 'Socle', repos: [] }, { project: 'Catalogues', repos: [] }] } as never)
  useHub.getState().addItem(gid, {
    id: 'auto-1', name: 'Review PR', cwd: 'C:/x', pinned: true, tabId: null, state: 'waiting',
    agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
    kind: 'automation',
    automation: { trigger: 'reviewer-assigned', pollSeconds: 300, prompt: 'p', allowedTools: ['Read'], enabled: true }
  } as never)
  const [cfg] = useHub.getState().automationConfigs()
  expect(cfg.scope.map((x) => x.project)).toEqual(['Socle', 'Catalogues'])
  expect(cfg.connId).toBe('c1')
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — `addRunItem is not a function`

- [ ] **Step 3: Étendre `HubApi` et le preload**

Dans `src/shared/ipc.ts`, interface `HubApi` :

```ts
  automationSetConfig(list: AutomationConfig[]): Promise<void>
  automationRunNow(automationId: string, pr: AdoPullRequest): Promise<void>
  automationApprovePending(): Promise<void>
  automationDismissPending(): Promise<void>
  automationListRuns(): Promise<RunRecord[]>
  onAutomationRunStarted(cb: (p: RunStartedPayload) => void): Unsub
  onAutomationRunUpdated(cb: (r: RunRecord) => void): Unsub
  onAutomationNotify(cb: (t: AutomationToast) => void): Unsub
```

Dans `src/preload/index.ts`, suivre exactement le style existant :

```ts
  automationSetConfig: (list) => ipcRenderer.invoke(IPC.AutomationSetConfig, list),
  automationRunNow: (automationId, pr) => ipcRenderer.invoke(IPC.AutomationRunNow, automationId, pr),
  automationApprovePending: () => ipcRenderer.invoke(IPC.AutomationApprovePending),
  automationDismissPending: () => ipcRenderer.invoke(IPC.AutomationDismissPending),
  automationListRuns: () => ipcRenderer.invoke(IPC.AutomationListRuns),
  onAutomationRunStarted: (cb) => {
    const h = (_e: unknown, p: RunStartedPayload): void => cb(p)
    ipcRenderer.on(IPC.AutomationRunStarted, h)
    return () => { ipcRenderer.removeListener(IPC.AutomationRunStarted, h) }
  },
  onAutomationRunUpdated: (cb) => {
    const h = (_e: unknown, r: RunRecord): void => cb(r)
    ipcRenderer.on(IPC.AutomationRunUpdated, h)
    return () => { ipcRenderer.removeListener(IPC.AutomationRunUpdated, h) }
  },
  onAutomationNotify: (cb) => {
    const h = (_e: unknown, t: AutomationToast): void => cb(t)
    ipcRenderer.on(IPC.AutomationNotify, h)
    return () => { ipcRenderer.removeListener(IPC.AutomationNotify, h) }
  },
```

- [ ] **Step 4: Étendre le store**

Dans `src/renderer/src/store.ts` :

1. Élargir `Item.kind` : `kind: 'claude' | 'ado' | 'cmd' | 'note' | 'automation' | 'run'`, et ajouter `automation?: PersistAutomation` et `runId?: string`.
2. Ajouter `GroupAdo` le champ `watch?: AdoWatchScope[]`.
3. Ajouter à l'état : `runs: Record<string, RunRecord>`.
4. Ajouter les actions :

```ts
  addRunItem: (p: RunStartedPayload) => void
  setRun: (r: RunRecord) => void
  automationConfigs: () => AutomationConfig[]
```

Implémentations :

```ts
  runs: {},

  addRunItem: (p) => set((s) => ({
    groups: s.groups.map((g) => g.id !== p.groupId ? g : {
      ...g,
      items: [...g.items, {
        id: uid('run'), name: p.title, cwd: p.cwd, pinned: false, tabId: p.tabId,
        state: 'active' as const, agents: [], openAgentId: null, split: 1,
        findOpen: false, agentsOpen: false, searchQuery: '', kind: 'run' as const, runId: p.runId
      }]
    })
  })),

  setRun: (r) => set((s) => ({ runs: { ...s.runs, [r.id]: r } })),

  automationConfigs: () => {
    const s = get()
    const out: AutomationConfig[] = []
    for (const g of s.groups) {
      if (!g.ado) continue
      const groupScope = g.ado.watch?.length ? g.ado.watch : [{ project: g.ado.project, repos: [] }]
      for (const i of g.items) {
        if (i.kind !== 'automation' || !i.automation) continue
        out.push({
          id: i.id, groupId: g.id, name: i.name,
          cwd: i.cwd || g.defaultCwd || '',
          connId: g.ado.connId,
          scope: effectiveScope(groupScope, i.automation.watch),
          trigger: i.automation.trigger,
          pollSeconds: i.automation.pollSeconds,
          prompt: i.automation.prompt,
          allowedTools: i.automation.allowedTools,
          enabled: i.automation.enabled
        })
      }
    }
    return out
  },
```

5. Dans `toPersistable` (`store.ts:497`), exclure explicitement les runs et persister la configuration d'automation :

```ts
        items: g.items.filter((i) => i.pinned && i.kind !== 'run').map((i) => ({
          id: i.id, name: i.name, cwd: i.cwd, split: i.split, kind: i.kind,
          ...(i.kind === 'ado' && i.ado ? { ado: i.ado } : {}),
          ...(i.kind === 'note' && i.note ? { note: i.note } : {}),
          ...(i.kind === 'automation' && i.automation ? { automation: i.automation } : {}),
          ...(i.claudeArgs && i.claudeArgs.length ? { claudeArgs: i.claudeArgs } : {})
        }))
```

Le filtre `pinned` suffirait, mais l'exclusion explicite documente l'invariant : un onglet de run ne revient jamais d'un redémarrage.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/shared/ipc.ts src/preload/index.ts src/renderer/src/store.ts tests/store.test.ts
```

Message : `feat(lot5): pont preload et état des automations` — corps : « Le renderer pousse la configuration résolue au main et reçoit les runs ; un onglet de run n'est jamais persisté. »

---

### Task 9: Toasts

**Files:**
- Create: `src/renderer/src/toasts.ts`
- Create: `src/renderer/src/components/ToastHost.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/toasts.test.ts`

**Interfaces:**
- Consumes: `AutomationToast`, `ToastLevel` (Task 7), store `useHub` (Task 8).
- Produces: `useToasts` (zustand), `pushToast(t)`, `dismissToast(id)`, `AUTO_DISMISS_MS = 6000`.

- [ ] **Step 1: Écrire le test**

Créer `tests/toasts.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useToasts, pushToast, dismissToast, isPersistent } from '../src/renderer/src/toasts'

beforeEach(() => { useToasts.setState({ list: [] }) })

describe('toasts', () => {
  it('empile les toasts, le plus récent en tête', () => {
    pushToast({ runId: 'r1', level: 'done', title: 'A', body: '' })
    pushToast({ runId: 'r2', level: 'done', title: 'B', body: '' })
    expect(useToasts.getState().list.map((t) => t.title)).toEqual(['B', 'A'])
  })

  it('remplace le toast existant du même run', () => {
    pushToast({ runId: 'r1', level: 'attention', title: 'Attente', body: '' })
    pushToast({ runId: 'r1', level: 'done', title: 'Terminé', body: '' })
    const list = useToasts.getState().list
    expect(list.length).toBe(1)
    expect(list[0].level).toBe('done')
  })

  it('un toast sans runId ne remplace rien', () => {
    pushToast({ runId: '', level: 'attention', title: 'Lot 1', body: '' })
    pushToast({ runId: '', level: 'attention', title: 'Lot 2', body: '' })
    expect(useToasts.getState().list.length).toBe(2)
  })

  it('dismissToast retire le toast ciblé', () => {
    pushToast({ runId: 'r1', level: 'done', title: 'A', body: '' })
    const id = useToasts.getState().list[0].id
    dismissToast(id)
    expect(useToasts.getState().list).toEqual([])
  })

  it('seul le niveau done disparaît tout seul', () => {
    expect(isPersistent('done')).toBe(false)
    expect(isPersistent('attention')).toBe(true)
    expect(isPersistent('failed')).toBe(true)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/toasts.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/renderer/src/toasts.ts`**

```ts
import { create } from 'zustand'
import type { AutomationToast, ToastLevel } from '../../shared/ipc'

export const AUTO_DISMISS_MS = 6000

export interface Toast extends AutomationToast { id: string }

interface ToastState { list: Toast[] }

export const useToasts = create<ToastState>(() => ({ list: [] }))

let seq = 0

/** Un toast de fin d'exécution remplace celui du même run : on ne garde pas l'attente résolue. */
export function pushToast(t: AutomationToast): void {
  seq += 1
  const toast: Toast = { ...t, id: `t-${seq}` }
  useToasts.setState((s) => ({
    list: [toast, ...(t.runId ? s.list.filter((x) => x.runId !== t.runId) : s.list)]
  }))
}

export function dismissToast(id: string): void {
  useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }))
}

export function isPersistent(level: ToastLevel): boolean {
  return level !== 'done'
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/toasts.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Écrire `ToastHost.tsx`**

```tsx
import React, { useEffect } from 'react'
import { useToasts, dismissToast, isPersistent, AUTO_DISMISS_MS, type Toast } from '../toasts'
import { useHub } from '../store'

function focusRun(runId: string): void {
  const s = useHub.getState()
  for (const g of s.groups) {
    const item = g.items.find((i) => i.kind === 'run' && i.runId === runId)
    if (!item) continue
    s.setActiveGroup(g.id)
    s.setActiveItem(item.id)
    return
  }
}

function ToastCard({ t }: { t: Toast }): React.JSX.Element {
  useEffect(() => {
    if (isPersistent(t.level)) return
    const h = setTimeout(() => dismissToast(t.id), AUTO_DISMISS_MS)
    return () => clearTimeout(h)
  }, [t.id, t.level])

  return (
    <div
      className={`toast ${t.level}`}
      role="status"
      tabIndex={0}
      onClick={() => { if (t.runId) focusRun(t.runId); dismissToast(t.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (t.runId) focusRun(t.runId); dismissToast(t.id) } }}
    >
      <div className="toast-title">{t.title}</div>
      {t.body && <div className="toast-body">{t.body}</div>}
    </div>
  )
}

/** Pile de notifications en haut à droite. Montée une fois à la racine. */
export function ToastHost(): React.JSX.Element | null {
  const list = useToasts((s) => s.list)
  if (list.length === 0) return null
  return <div className="toast-host">{list.map((t) => <ToastCard key={t.id} t={t} />)}</div>
}
```

- [ ] **Step 6: Câbler dans `App.tsx`**

Ajouter les imports, monter `<ToastHost />` à côté de `<ConfirmHost />`, et brancher les abonnements dans un `useEffect` :

```tsx
  useEffect(() => {
    const unsubs: Unsub[] = [
      window.hub.onAutomationRunStarted((p) => useHub.getState().addRunItem(p)),
      window.hub.onAutomationRunUpdated((r) => useHub.getState().setRun(r)),
      window.hub.onAutomationNotify((t) => {
        pushToast(t)
        if (t.level === 'attention' && readSoundEnabled()) playSound('waiting')
      })
    ]
    return () => { for (const u of unsubs) u() }
  }, [])
```

`playSound` n'accepte que `'waiting' | 'done'` (`sound.ts:17`) ; `'waiting'` est la tonalité d'alerte déjà employée pour l'état `attention` d'une session. Ne pas ajouter de variante.

Pousser la configuration au main à chaque changement, à côté de la sauvegarde du workspace déjà en place (`App.tsx:129`) :

```tsx
      window.hub.automationSetConfig(useHub.getState().automationConfigs())
```

- [ ] **Step 7: Ajouter les styles**

Dans la feuille de styles du renderer, à côté des styles de `Modal` :

```css
.toast-host { position: fixed; top: 44px; right: 14px; width: 260px; display: flex; flex-direction: column; gap: 9px; z-index: 40; }
.toast { background: var(--panel-2, #1b1e23); border: 1px solid var(--line, #282d34); border-left-width: 2px; border-radius: 4px; padding: 9px 11px; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,.45); }
.toast:focus-visible { outline: 2px solid var(--accent, #d9a14a); outline-offset: 2px; }
.toast.done { border-left-color: #5fb08a; }
.toast.attention { border-left-color: #e0b341; }
.toast.failed { border-left-color: #d4715f; }
.toast-title { font-size: 12.5px; font-weight: 600; margin-bottom: 2px; }
.toast-body { font-size: 11.5px; opacity: .75; }
```

`top: 44px` place la pile sous l'overlay de barre de titre (36 px, `index.ts:62`).

- [ ] **Step 8: Lancer la suite et vérifier le rendu**

Run: `npm test` puis `npm run build`
Expected: PASS, build sans erreur.

- [ ] **Step 9: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/renderer/src/toasts.ts src/renderer/src/components/ToastHost.tsx src/renderer/src/App.tsx tests/toasts.test.ts
```

Message : `feat(lot5): notifications en toast` — corps : « Pile en haut à droite ; la fin d'un run s'efface seule, une attente ou un échec reste jusqu'au clic, qui ouvre l'onglet du run. »

---

### Task 10: Item d'automation dans la sidebar et ligne d'état

**Files:**
- Create: `src/renderer/src/components/AutomationStatusBar.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`
- Modify: `src/renderer/src/components/icons.tsx`
- Test: `tests/automationSummary.test.ts`
- Create: `src/renderer/src/automationSummary.ts`

**Interfaces:**
- Consumes: store `runs` (Task 8).
- Produces: `summarizeRuns(runs): { active: number; attention: number }`, composant `AutomationStatusBar`.

- [ ] **Step 1: Écrire le test du résumé**

Créer `tests/automationSummary.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { summarizeRuns } from '../src/renderer/src/automationSummary'
import type { RunRecord, RunStatus } from '../src/shared/ipc'

const r = (id: string, status: RunStatus): RunRecord => ({
  id, automationId: 'a', key: id, project: 'P', repo: 'R', prId: 1, title: '', url: '',
  startedAt: 0, endedAt: null, status, error: null, tabId: null
})

describe('summarizeRuns', () => {
  it('compte les runs actifs et ceux qui attendent', () => {
    const runs = { a: r('a', 'running'), b: r('b', 'attention'), c: r('c', 'queued'), d: r('d', 'done') }
    expect(summarizeRuns(runs)).toEqual({ active: 3, attention: 1 })
  })

  it('un run en attente compte comme actif', () => {
    expect(summarizeRuns({ a: r('a', 'attention') })).toEqual({ active: 1, attention: 1 })
  })

  it('les runs terminés ou en échec ne comptent pas', () => {
    expect(summarizeRuns({ a: r('a', 'done'), b: r('b', 'failed') })).toEqual({ active: 0, attention: 0 })
  })

  it('un run en attente de feu vert n est pas actif', () => {
    expect(summarizeRuns({ a: r('a', 'pending') })).toEqual({ active: 0, attention: 0 })
  })

  it('aucun run donne un résumé nul', () => {
    expect(summarizeRuns({})).toEqual({ active: 0, attention: 0 })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/automationSummary.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/renderer/src/automationSummary.ts`**

```ts
import type { RunRecord, RunStatus } from '../../shared/ipc'

const ACTIFS: RunStatus[] = ['queued', 'running', 'attention']

export interface RunSummary { active: number; attention: number }

/** `pending` attend un feu vert humain : ce n'est pas une exécution en cours. */
export function summarizeRuns(runs: Record<string, RunRecord>): RunSummary {
  const list = Object.values(runs)
  return {
    active: list.filter((r) => ACTIFS.includes(r.status)).length,
    attention: list.filter((r) => r.status === 'attention').length
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/automationSummary.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Écrire `AutomationStatusBar.tsx`**

```tsx
import React, { useState } from 'react'
import { useHub } from '../store'
import { summarizeRuns } from '../automationSummary'

/** Ligne d'état des runs, juste au-dessus de Paramètres. Dérivée du store, sans modèle propre. */
export function AutomationStatusBar(): React.JSX.Element | null {
  const runs = useHub((s) => s.runs)
  const groups = useHub((s) => s.groups)
  const [open, setOpen] = useState(false)
  const { active, attention } = summarizeRuns(runs)
  if (active === 0) return null

  const actifs = Object.values(runs).filter((r) => r.status === 'running' || r.status === 'attention' || r.status === 'queued')
  const groupOf = (runId: string): string =>
    groups.find((g) => g.items.some((i) => i.kind === 'run' && i.runId === runId))?.name ?? ''

  return (
    <div className="auto-bar">
      <button className="auto-bar-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`auto-dot${attention > 0 ? ' warn' : ''}`} />
        <span>{active} run{active > 1 ? 's' : ''}{attention > 0 ? ` · ${attention} attention` : ''}</span>
      </button>
      {open && (
        <ul className="auto-bar-list">
          {actifs.map((r) => (
            <li key={r.id}>
              <button onClick={() => {
                const s = useHub.getState()
                for (const g of s.groups) {
                  const item = g.items.find((i) => i.kind === 'run' && i.runId === r.id)
                  if (item) { s.setActiveGroup(g.id); s.setActiveItem(item.id); return }
                }
              }}>
                <span className={`auto-dot${r.status === 'attention' ? ' warn' : ''}`} />
                {groupOf(r.id)} · !{r.prId}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Monter la barre et l'item dans la sidebar**

Dans `Sidebar.tsx` : rendre `<AutomationStatusBar />` juste avant le bloc « Paramètres » en bas de la sidebar. Ajouter le rendu d'un item `kind === 'automation'` avec l'icône dédiée et un badge indiquant le nombre de runs actifs de cette automation ; un clic ouvre la modale de configuration (Task 11). Un item `kind === 'run'` se rend comme un item de session (il a un `tabId`), avec l'icône d'automation.

Dans `icons.tsx`, ajouter un `AutomationIcon` sur le modèle des icônes existantes (svg 14×14, `currentColor`, `fill="none"` et `stroke-width="1.5"` comme `ActivityIcon`).

- [ ] **Step 7: Ajouter les styles**

```css
.auto-bar { border-top: 1px solid var(--line, #1f2329); }
.auto-bar-head { display: flex; align-items: center; gap: 7px; width: 100%; padding: 7px 9px; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.auto-bar-list { list-style: none; margin: 0; padding: 0 0 6px; }
.auto-bar-list button { display: flex; align-items: center; gap: 7px; width: 100%; padding: 3px 9px 3px 22px; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.auto-dot { width: 7px; height: 7px; border-radius: 50%; background: #5fb08a; flex: 0 0 7px; }
.auto-dot.warn { background: #e0b341; }
```

- [ ] **Step 8: Lancer la suite**

Run: `npm test` puis `npm run build`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/renderer/src/automationSummary.ts src/renderer/src/components/AutomationStatusBar.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/components/icons.tsx tests/automationSummary.test.ts
```

Message : `feat(lot5): item d'automation et ligne d'état des runs` — corps : « L'automation vit dans son groupe ; une ligne au-dessus de Paramètres agrège les runs de tous les groupes et permet d'y sauter. »

---

### Task 11: Modale de configuration

**Files:**
- Create: `src/renderer/src/components/AutomationModal.tsx`
- Modify: `src/renderer/src/components/AdoBindModal.tsx` (saisie du périmètre du groupe)
- Modify: `src/renderer/src/components/Sidebar.tsx` (ouverture de la modale, création d'une automation)
- Test: `tests/automationForm.test.ts`
- Create: `src/renderer/src/automationForm.ts`

**Interfaces:**
- Consumes: `PersistAutomation`, `AdoWatchScope`, `DEFAULT_REVIEW_PROMPT`, `DEFAULT_ALLOWED_TOOLS` (Task 4).
- Produces: `newAutomation(): PersistAutomation`, `validateAutomation(a): string | null`, `parseToolList(text): string[]`.

Note : `DEFAULT_REVIEW_PROMPT` et `DEFAULT_ALLOWED_TOOLS` vivent dans `src/main/automations/renderPrompt.ts`. Comme le renderer en a besoin, **les déplacer d'abord** vers `src/shared/automationDefaults.ts` et les réexporter depuis `renderPrompt.ts` pour ne pas casser la Task 4 :

```ts
// src/shared/automationDefaults.ts  — contenu déplacé tel quel depuis renderPrompt.ts
export const DEFAULT_REVIEW_PROMPT = `…`
export const DEFAULT_ALLOWED_TOOLS = [ … ]
```
```ts
// src/main/automations/renderPrompt.ts — en tête
export { DEFAULT_REVIEW_PROMPT, DEFAULT_ALLOWED_TOOLS } from '../../shared/automationDefaults'
```

- [ ] **Step 1: Écrire le test du formulaire**

Créer `tests/automationForm.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { newAutomation, validateAutomation, parseToolList } from '../src/renderer/src/automationForm'

describe('automationForm', () => {
  it('une nouvelle automation part activée, avec le gabarit et les outils par défaut', () => {
    const a = newAutomation()
    expect(a.enabled).toBe(true)
    expect(a.trigger).toBe('reviewer-assigned')
    expect(a.pollSeconds).toBe(300)
    expect(a.prompt).toContain('/difai-tech-devops-ado-code-review')
    expect(a.allowedTools).toContain('Read')
  })

  it('refuse un prompt vide', () => {
    expect(validateAutomation({ ...newAutomation(), prompt: '   ' }))
      .toBe('Le prompt ne peut pas être vide.')
  })

  it('refuse un intervalle inférieur à une minute', () => {
    expect(validateAutomation({ ...newAutomation(), pollSeconds: 30 }))
      .toBe('L intervalle minimum est de 60 secondes.')
  })

  it('accepte une automation correcte', () => {
    expect(validateAutomation(newAutomation())).toBeNull()
  })

  it('parseToolList découpe sur les virgules et les retours à la ligne', () => {
    expect(parseToolList('Read, Grep\nBash(curl:*) ,')).toEqual(['Read', 'Grep', 'Bash(curl:*)'])
  })

  it('parseToolList sur une chaîne vide rend une liste vide', () => {
    expect(parseToolList('  ')).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/automationForm.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Écrire `src/renderer/src/automationForm.ts`**

```ts
import type { PersistAutomation } from '../../shared/ipc'
import { DEFAULT_REVIEW_PROMPT, DEFAULT_ALLOWED_TOOLS } from '../../shared/automationDefaults'

export function newAutomation(): PersistAutomation {
  return {
    trigger: 'reviewer-assigned',
    pollSeconds: 300,
    prompt: DEFAULT_REVIEW_PROMPT,
    allowedTools: [...DEFAULT_ALLOWED_TOOLS],
    enabled: true
  }
}

export function validateAutomation(a: PersistAutomation): string | null {
  if (!a.prompt.trim()) return 'Le prompt ne peut pas être vide.'
  if (a.pollSeconds < 60) return 'L intervalle minimum est de 60 secondes.'
  return null
}

export function parseToolList(text: string): string[] {
  return text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean)
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run tests/automationForm.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Étendre `AdoBindModal` pour saisir le périmètre du groupe**

Sans cela, un groupe ne peut pas déclarer ses projets surveillés et le cas Cerba reste inatteignable.
Dans `src/renderer/src/components/AdoBindModal.tsx`, ajouter un état et un champ, après le sélecteur d'équipe :

```tsx
  const [watch, setWatch] = useState<string[]>(current?.watch?.map((w) => w.project) ?? [])

  const toggleWatch = (name: string): void =>
    setWatch((w) => (w.includes(name) ? w.filter((x) => x !== name) : [...w, name]))
```

```tsx
      <div className="setting-row col">
        <label>Projets surveillés (automations)</label>
        <div className="check-list">
          {projects.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={watch.includes(p.name)} onChange={() => toggleWatch(p.name)} />
              {p.name}
            </label>
          ))}
        </div>
        <span className="muted">Aucun coché : seul le projet ci-dessus est surveillé.</span>
      </div>
```

Et transmettre le périmètre dans `onApply` :

```tsx
        onClick={() => valid && onApply({
          connId, project, team: team || null,
          ...(watch.length ? { watch: watch.map((name) => ({ project: name, repos: [] })) } : {})
        })}
```

Le filtrage par repo n'est pas exposé ici : une entrée `repos: []` couvre tout le projet, ce qui
est le cas d'usage. Un périmètre plus fin se saisit au niveau de l'automation.

Styles à ajouter :

```css
.setting-row.col { flex-direction: column; align-items: flex-start; gap: 6px; }
.check-list { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.check { display: flex; align-items: center; gap: 5px; font-weight: 400; }
```

- [ ] **Step 6: Écrire `AutomationModal.tsx`**

Créer `src/renderer/src/components/AutomationModal.tsx` :

```tsx
import React, { useState } from 'react'
import { Modal } from './Modal'
import type { PersistAutomation, AdoWatchScope } from '../../../shared/ipc'
import { validateAutomation, parseToolList } from '../automationForm'

interface Props {
  name: string
  current: PersistAutomation
  /** Projets du périmètre du groupe, proposés en restriction. */
  groupProjects: string[]
  onApply: (name: string, a: PersistAutomation) => void
  onClose: () => void
}

export function AutomationModal({ name, current, groupProjects, onApply, onClose }: Props): React.JSX.Element {
  const [label, setLabel] = useState(name)
  const [a, setA] = useState<PersistAutomation>(current)
  const [tools, setTools] = useState(current.allowedTools.join('\n'))
  const [err, setErr] = useState<string | null>(null)

  const restricted = a.watch?.map((w) => w.project) ?? []
  const toggle = (p: string): void => {
    const next = restricted.includes(p) ? restricted.filter((x) => x !== p) : [...restricted, p]
    const watch: AdoWatchScope[] | undefined = next.length ? next.map((x) => ({ project: x, repos: [] })) : undefined
    setA({ ...a, watch })
  }

  const apply = (): void => {
    const candidate = { ...a, allowedTools: parseToolList(tools) }
    const problem = validateAutomation(candidate)
    if (problem) { setErr(problem); return }
    onApply(label.trim() || 'Review PR', candidate)
  }

  return (
    <Modal
      title="Automation — review de PR"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={apply}>Appliquer</button>
        </>
      }
    >
      <div className="setting-row"><label>Nom</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} /></div>

      <div className="setting-row"><label>Activée</label>
        <input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} /></div>

      <div className="setting-row"><label>Intervalle (s)</label>
        <input type="number" min={60} step={60} value={a.pollSeconds}
          onChange={(e) => setA({ ...a, pollSeconds: Number(e.target.value) })} /></div>

      <div className="setting-row col">
        <label>Restreindre à certains projets</label>
        <div className="check-list">
          {groupProjects.map((p) => (
            <label key={p} className="check">
              <input type="checkbox" checked={restricted.includes(p)} onChange={() => toggle(p)} />
              {p}
            </label>
          ))}
        </div>
        <span className="muted">Aucun coché : tout le périmètre du groupe.</span>
      </div>

      <div className="setting-row col">
        <label>Prompt envoyé à la session</label>
        <textarea rows={12} value={a.prompt} onChange={(e) => setA({ ...a, prompt: e.target.value })} />
      </div>

      <div className="setting-row col">
        <label>Outils autorisés (un par ligne)</label>
        <textarea rows={5} value={tools} onChange={(e) => setTools(e.target.value)} />
      </div>

      {err && <div className="muted">{err}</div>}
    </Modal>
  )
}
```

Au retour de `onApply`, l'appelant écrit l'item dans le store puis pousse la configuration :
`window.hub.automationSetConfig(useHub.getState().automationConfigs())`.

Styles complémentaires :

```css
.setting-row.col textarea { width: 100%; font-family: var(--mono, monospace); font-size: 12px; resize: vertical; }
```

- [ ] **Step 7: Câbler la création depuis la sidebar**

Dans le menu contextuel d'un groupe de `Sidebar.tsx`, ajouter « Nouvelle automation » — visible seulement si `group.ado` est défini, puisque l'automation a besoin d'une connexion. L'entrée crée un item `kind: 'automation'` épinglé, avec `newAutomation()`, puis ouvre la modale.

Ajouter au menu contextuel d'un item d'automation : « Configurer », « Activer / Désactiver », « Supprimer ».

- [ ] **Step 8: Lancer la suite**

Run: `npm test` puis `npm run build`
Expected: PASS

- [ ] **Step 9: Vérification manuelle**

Lancer `npm run dev`, puis :
1. Sur un groupe lié à une connexion ADO, créer une automation, vérifier que le prompt par défaut est pré-rempli.
2. La désactiver, vérifier qu'aucun appel réseau ne part (onglet réseau des outils de développement).
3. La réactiver et attendre un tick : si des PR sont assignées, le toast « N PR en attente de review » doit apparaître sans qu'aucune session ne démarre.
4. Accepter : un onglet de run apparaît dans le groupe sans voler le focus, et le terminal contient le prompt rendu.
5. Fermer et rouvrir l'application : l'automation est toujours là, l'onglet de run a disparu.

- [ ] **Step 10: Commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/shared/automationDefaults.ts src/main/automations/renderPrompt.ts src/renderer/src/automationForm.ts src/renderer/src/components/AutomationModal.tsx src/renderer/src/components/AdoBindModal.tsx src/renderer/src/components/Sidebar.tsx tests/automationForm.test.ts
```

Message : `feat(lot5): configuration d'une automation` — corps : « Modale de création et d'édition : périmètre hérité ou restreint, prompt éditable, outils autorisés, intervalle et activation. »

---

## Vérification finale

- [ ] `npm test` — la suite complète passe, y compris les 295 tests antérieurs.
- [ ] `npx tsc --noEmit -p tsconfig.json` — aucune erreur.
- [ ] `npm run build` — les trois bundles se construisent.
- [ ] Relire `git log --oneline main..HEAD` : aucun message ne porte de trace d'outillage, tous les accents sont intacts.
- [ ] Relire le diff complet à la recherche d'un `console.log` contenant un PAT.
