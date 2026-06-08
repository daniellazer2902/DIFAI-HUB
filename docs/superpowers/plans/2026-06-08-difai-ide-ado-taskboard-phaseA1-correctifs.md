# ADO Taskboard — Correctifs (Phase A.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Corriger/améliorer le Sprint Taskboard (Phase A) : vraies colonnes du taskboard (custom), trou en haut, swimlane repliée sur une ligne, expander global, filtre par personne, suppression de la bande sombre de la colonne US.

**Branche :** `feat/lot4-ado-board` (continuité de la Phase A). Fond de référence du board = `#1e1e1e`.

**Contexte clé (découverte) :** les colonnes du Taskboard Azure (New/Active/IN PR/Resolved/IN TEST/Closed) ne sont **pas** les états du type Task — ce sont des **colonnes personnalisées** (`work/taskboardcolumns`), chacune avec un mapping `{ workItemType, state }`. On récupérait `workitemtypes/Task/states`, d'où les colonnes manquantes. On bascule sur l'API taskboardcolumns, avec **repli** sur les états Task si pas d'équipe / échec.

---

### Task 1 : Source des colonnes = taskboardcolumns (+ fallback états Task)

**Files:**
- Modify: `src/main/ado/adoUrls.ts` (+ test `tests/adoUrls.test.ts`)
- Modify: `src/shared/ipc.ts` (`AdoBoard`, nouveau `AdoTaskColumn`)
- Modify: `src/main/ado/AdoProvider.ts` (`listBoard` + helper privé)
- Test: `tests/AdoProvider.test.ts`

- [ ] **Step 1 — URL helper + test.** Dans `tests/adoUrls.test.ts`, ajouter un test :
```ts
  it('taskboardColumnsUrl cible work/taskboardcolumns (preview) avec équipe', () => {
    const u = taskboardColumnsUrl('https://dev.azure.com/acme', 'Proj', 'Team A')
    expect(u).toContain('/Proj/')
    expect(u).toContain('/Team%20A/_apis/work/taskboardcolumns')
    expect(u).toContain('api-version=7.1-preview.1')
  })
```
(adapter l'import : `import { taskboardColumnsUrl } from '../src/main/ado/adoUrls'`).

- [ ] **Step 2 — run, FAIL.** `npm test -- adoUrls`.

- [ ] **Step 3 — implémenter l'URL.** Dans `src/main/ado/adoUrls.ts`, ajouter :
```ts
export function taskboardColumnsUrl(base: string, project: string, team: string): string {
  return `${trim(base)}/${seg(project)}/${seg(team)}/_apis/work/taskboardcolumns?api-version=7.1-preview.1`
}
```

- [ ] **Step 4 — types IPC.** Dans `src/shared/ipc.ts`, remplacer `taskStates: string[]` par `taskColumns` et ajouter le type :
```ts
/** Une colonne du Taskboard (custom) : nom + mapping état→colonne par type de work item. */
export interface AdoTaskColumn {
  name: string
  mappings: { workItemType: string; state: string }[]
}
export interface AdoBoard {
  states: string[]                 // états User Story — vue cartes-par-état (StateBoardView)
  taskColumns: AdoTaskColumn[]     // colonnes du Taskboard (ordre d'affichage)
  stories: AdoWorkItem[]
  tasksByParent: Record<number, AdoWorkItem[]>
}
```

- [ ] **Step 5 — test provider.** Dans `tests/AdoProvider.test.ts`, REMPLACER le test `taskStates` par :
```ts
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
```
Aussi : dans le test existant `'listBoard récupère les US (WIQL+batch)…'`, REMPLACER l'assertion `expect(board.taskStates)…` par `expect(board.taskColumns.map((c) => c.name)).toEqual(['New', 'Active', 'Closed'])` (le mock `/states` renvoie ces 3 états → fallback sans équipe).

- [ ] **Step 6 — run, FAIL.** `npm test -- AdoProvider`.

- [ ] **Step 7 — implémenter `listBoard`.** Dans `src/main/ado/AdoProvider.ts` :
  - importer `taskboardColumnsUrl` depuis `./adoUrls`.
  - remplacer le calcul de `taskStates` par la résolution des colonnes ; nouveau `return { states, taskColumns, stories, tasksByParent }`.
  - ajouter un helper privé. Code :
```ts
    // Colonnes du Taskboard : API dédiée si une équipe est connue, sinon repli sur les états Task.
    let taskColumns: AdoTaskColumn[]
    try {
      if (p.team) {
        const raw = await this.get(taskboardColumnsUrl(this.conn.baseUrl, p.project, p.team))
        const cols = [...(raw.columns ?? [])].sort((a: any, b: any) => a.order - b.order)
        taskColumns = cols.map((c: any) => ({
          name: c.name,
          mappings: (c.mappings ?? []).map((m: any) => ({ workItemType: m.workItemType, state: m.state }))
        }))
        if (taskColumns.length === 0) taskColumns = await this.taskColumnsFromStates(p.project)
      } else {
        taskColumns = await this.taskColumnsFromStates(p.project)
      }
    } catch {
      taskColumns = await this.taskColumnsFromStates(p.project)
    }
```
  et le helper privé (après `listBoard`) :
```ts
  /** Repli : une colonne par état du type Task (mapping 1:1). */
  private async taskColumnsFromStates(project: string): Promise<AdoTaskColumn[]> {
    const raw = (await this.get(statesUrl(this.conn.baseUrl, project, TASK_TYPE))).value ?? []
    return [...raw].sort((a: any, b: any) => a.order - b.order)
      .map((s: any) => ({ name: s.name, mappings: [{ workItemType: TASK_TYPE, state: s.name }] }))
  }
```
  (importer le type `AdoTaskColumn` dans le fichier ; `TASK_TYPE` existe déjà.)

- [ ] **Step 8 — run, PASS.** `npm test -- AdoProvider` puis `npm test` (suite complète — d'autres tests qui référencent `taskStates` doivent être mis à jour si présents ; chercher `taskStates` dans `tests/`).

- [ ] **Step 9 — commit.**
```bash
git add src/main/ado/adoUrls.ts src/shared/ipc.ts src/main/ado/AdoProvider.ts tests/adoUrls.test.ts tests/AdoProvider.test.ts
git commit -m "feat(ado): colonnes du taskboard via API taskboardcolumns (fallback etats Task)"
```

---

### Task 2 : Helpers `tasksByColumn` + `filterBoardByAssignee`

**Files:** Modify `src/renderer/src/adoBoard.ts` ; Test `tests/adoBoard.test.ts`.

- [ ] **Step 1 — tests (remplacer le contenu de `tests/adoBoard.test.ts`).**
```ts
import { describe, it, expect } from 'vitest'
import { tasksByColumn, filterBoardByAssignee } from '../src/renderer/src/adoBoard'
import type { AdoBoard, AdoTaskColumn, AdoWorkItem } from '../src/shared/ipc'

const task = (id: number, state: string, assignedTo: string | null = null): AdoWorkItem =>
  ({ id, type: 'Task', title: `T${id}`, state, assignedTo, parentId: 1, childCount: 0 })
const us = (id: number, assignedTo: string | null = null): AdoWorkItem =>
  ({ id, type: 'User Story', title: `US${id}`, state: 'Active', assignedTo, parentId: null, childCount: 0 })
const cols: AdoTaskColumn[] = [
  { name: 'New', mappings: [{ workItemType: 'Task', state: 'New' }] },
  { name: 'IN PR', mappings: [{ workItemType: 'Task', state: 'Active' }] },
  { name: 'Closed', mappings: [{ workItemType: 'Task', state: 'Closed' }] }
]

describe('tasksByColumn', () => {
  it('place chaque tâche dans la colonne dont le mapping (type,état) correspond', () => {
    const out = tasksByColumn([task(1, 'New'), task(2, 'Active'), task(3, 'New')], cols)
    expect(out['New'].map((t) => t.id)).toEqual([1, 3])
    expect(out['IN PR'].map((t) => t.id)).toEqual([2])
    expect(out['Closed']).toEqual([])
  })
  it('ignore les tâches sans colonne correspondante', () => {
    const out = tasksByColumn([task(1, 'Removed'), task(2, 'New')], cols)
    expect(Object.values(out).flat().map((t) => t.id)).toEqual([2])
  })
})

describe('filterBoardByAssignee', () => {
  const board: AdoBoard = {
    states: [], taskColumns: cols,
    stories: [us(10, 'Daniel'), us(11, 'Bob'), us(12, null)],
    tasksByParent: { 10: [task(100, 'New', 'Bob')], 11: [task(110, 'New', 'Daniel')], 12: [task(120, 'New', 'Eve')] }
  }
  it('null/"" : board inchangé', () => {
    expect(filterBoardByAssignee(board, null)).toBe(board)
  })
  it('garde une US si elle OU une de ses tâches est assignée à la personne, et ne montre que ses tâches', () => {
    const r = filterBoardByAssignee(board, 'Daniel')
    expect(r.stories.map((s) => s.id)).toEqual([10, 11]) // 10 (US Daniel), 11 (tâche Daniel) ; 12 exclu
    expect(r.tasksByParent[10]).toEqual([])              // US 10 = Daniel mais sa tâche est à Bob
    expect(r.tasksByParent[11].map((t) => t.id)).toEqual([110])
    expect(r.taskColumns).toBe(board.taskColumns)
  })
})
```

- [ ] **Step 2 — run, FAIL.** `npm test -- adoBoard`.

- [ ] **Step 3 — implémenter (remplacer `tasksByState` par ces deux exports dans `src/renderer/src/adoBoard.ts`).**
```ts
import type { AdoBoard, AdoTaskColumn, AdoWorkItem } from '../../shared/ipc'

/** Place les tâches dans la colonne dont un mapping correspond à (type, état). 1ère colonne gagnante ; non-mappées ignorées. */
export function tasksByColumn(
  tasks: AdoWorkItem[],
  taskColumns: AdoTaskColumn[]
): Record<string, AdoWorkItem[]> {
  const out: Record<string, AdoWorkItem[]> = {}
  for (const c of taskColumns) out[c.name] = []
  for (const t of tasks) {
    const col = taskColumns.find((c) => c.mappings.some((m) => m.workItemType === t.type && m.state === t.state))
    if (col) out[col.name].push(t)
  }
  return out
}

/** Filtre le board sur une personne : US visible si elle OU une tâche lui est assignée ; ne garde que SES tâches. */
export function filterBoardByAssignee(board: AdoBoard, assignee: string | null): AdoBoard {
  if (!assignee) return board
  const stories = board.stories.filter(
    (s) => s.assignedTo === assignee || (board.tasksByParent[s.id] ?? []).some((t) => t.assignedTo === assignee)
  )
  const tasksByParent: Record<number, AdoWorkItem[]> = {}
  for (const s of stories) tasksByParent[s.id] = (board.tasksByParent[s.id] ?? []).filter((t) => t.assignedTo === assignee)
  return { ...board, stories, tasksByParent }
}
```
(Supprimer l'ancien `tasksByState` si présent — plus utilisé.)

- [ ] **Step 4 — run, PASS.** `npm test -- adoBoard`.

- [ ] **Step 5 — commit.**
```bash
git add src/renderer/src/adoBoard.ts tests/adoBoard.test.ts
git commit -m "feat(ado): helpers tasksByColumn + filterBoardByAssignee"
```

---

### Task 3 : TaskBoardView — colonnes, repli sur une ligne, expander global + CSS (trou, bande sombre)

**Files:** Modify `src/renderer/src/components/TaskBoardView.tsx` ; Modify `src/renderer/index.html` (CSS).

- [ ] **Step 1 — réécrire `TaskBoardView.tsx`.** Remplacer le contenu par :
```tsx
import React, { useState } from 'react'
import type { AdoBoard as Board, AdoWorkItem } from '../../../shared/ipc'
import { Hl } from './Hl'
import { tasksByColumn } from '../adoBoard'
import { itemMatches, storyVisible } from '../adoFind'

interface Props { board: Board; q: string; filter: boolean; onOpen: (id: number) => void }

/** Sprint Taskboard façon Azure DevOps : une swimlane par US, colonnes = colonnes du taskboard. */
export function TaskBoardView({ board, q, filter, onOpen }: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  if (board.taskColumns.length === 0) return <div className="ado-center">Aucune colonne de taskboard configurée.</div>

  const cols = `220px repeat(${board.taskColumns.length}, minmax(180px, 1fr))`
  const allCollapsed = stories.every((s) => collapsed.has(s.id))
  const toggleAll = (): void => setCollapsed(allCollapsed ? new Set() : new Set(stories.map((s) => s.id)))
  const toggleOne = (id: number): void => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="ado-taskboard">
      <div className="ado-tb-head" style={{ gridTemplateColumns: cols }}>
        <div className="ado-tb-head-cell swim">
          <button className="ado-tb-expander" title={allCollapsed ? 'Tout déplier' : 'Tout replier'} onClick={toggleAll}>
            {allCollapsed ? '⌄' : '⌃'} {allCollapsed ? 'Tout déplier' : 'Tout replier'}
          </button>
        </div>
        {board.taskColumns.map((c) => <div key={c.name} className="ado-tb-head-cell">{c.name}</div>)}
      </div>
      {stories.map((s) => (
        <Swimlane
          key={s.id}
          story={s}
          tasks={board.tasksByParent[s.id] ?? []}
          taskColumns={board.taskColumns}
          cols={cols}
          open={!collapsed.has(s.id)}
          onToggle={() => toggleOne(s.id)}
          q={q}
          filter={filter}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function Swimlane({ story, tasks, taskColumns, cols, open, onToggle, q, filter, onOpen }: {
  story: AdoWorkItem; tasks: AdoWorkItem[]; taskColumns: Board['taskColumns']; cols: string
  open: boolean; onToggle: () => void; q: string; filter: boolean; onOpen: (id: number) => void
}): React.JSX.Element {
  const visTasks = filter && q && !itemMatches(story, q) ? tasks.filter((t) => itemMatches(t, q)) : tasks

  if (!open) {
    return (
      <div className="ado-swimlane collapsed">
        <button className="ado-tb-caret" title="Déplier" onClick={onToggle}>▸</button>
        <button className="ado-swim-line" onClick={() => onOpen(story.id)}>
          <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
          <span className="ado-title"><Hl text={story.title} q={q} /></span>
          <span className="ado-state"><Hl text={story.state} q={q} /></span>
          <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
        </button>
      </div>
    )
  }

  const byColumn = tasksByColumn(visTasks, taskColumns)
  return (
    <div className="ado-swimlane" style={{ gridTemplateColumns: cols }}>
      <div className="ado-swim-head">
        <button className="ado-tb-caret" title="Replier" onClick={onToggle}>{visTasks.length ? '▾' : '·'}</button>
        <button className="ado-card ado-us-card" onClick={() => onOpen(story.id)}>
          <div className="ado-card-title"><Hl text={story.title} q={q} /></div>
          <div className="ado-card-meta">
            <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
            <span className="ado-state"><Hl text={story.state} q={q} /></span>
            <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
          </div>
        </button>
      </div>
      {taskColumns.map((c) => (
        <div key={c.name} className="ado-tb-cell">
          {byColumn[c.name].map((t) => (
            <button key={t.id} className="ado-card ado-task-card" onClick={() => onOpen(t.id)}>
              <div className="ado-card-title"><Hl text={t.title} q={q} /></div>
              <div className="ado-card-meta">
                <span className="ado-id"><Hl text={`#${t.id}`} q={q} /></span>
                <span className="ado-assignee"><Hl text={t.assignedTo ?? '—'} q={q} /></span>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2 — CSS dans `src/renderer/index.html`.** Modifications du bloc taskboard (après `.term-screen`) :
  1. `.ado-taskboard` : retirer le padding-haut → `padding: 0 10px 8px;` (corrige le trou : l'en-tête figé couvre désormais tout le haut).
  2. `.ado-tb-head` : `background: #1b1b1b` → `background: #1e1e1e`.
  3. `.ado-tb-head-cell.swim` : `background: #1b1b1b` → `background: #1e1e1e` (conserver `z-index: 3`).
  4. `.ado-swim-head` : `background: #1b1b1b` → `background: #1e1e1e` (supprime la bande sombre de la colonne US).
  5. Ajouter à la fin du bloc :
```css
      .ado-tb-expander { background: none; border: none; color: #9c9; cursor: pointer; font-size: 12px; padding: 2px 4px; display: inline-flex; align-items: center; gap: 4px; }
      .ado-tb-expander:hover { color: #fc8; }
      .ado-swimlane.collapsed { display: flex; align-items: center; gap: 6px; padding: 6px 0; }
      .ado-swim-line { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; background: none; border: none; color: #ddd; cursor: pointer; font-family: inherit; font-size: 12px; text-align: left; overflow: hidden; }
      .ado-swim-line .ado-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

- [ ] **Step 3 — build + tests.** `npm run build` (OK) ; `npm test` (vert).

- [ ] **Step 4 — commit.**
```bash
git add src/renderer/src/components/TaskBoardView.tsx src/renderer/index.html
git commit -m "feat(ado): taskboard colonnes custom, repli ligne, expander global, fix trou + bande sombre"
```

---

### Task 4 : Filtre par personne (dropdown) appliqué Board + Arborescence

**Files:** Modify `src/renderer/src/components/AdoBoard.tsx` ; CSS réutilise `.ado-board-bar select`.

- [ ] **Step 1 — état + données filtrées dans `AdoBoard`.** Ajouter `useMemo` à l'import React. Après la ligne `const filter = …` (zone des hooks de recherche), ajouter :
```tsx
  const [assignee, setAssignee] = useState('')
  const assignees = React.useMemo(() => {
    if (!board) return [] as string[]
    const set = new Set<string>()
    for (const s of board.stories) if (s.assignedTo) set.add(s.assignedTo)
    for (const list of Object.values(board.tasksByParent)) for (const t of list) if (t.assignedTo) set.add(t.assignedTo)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [board])
  const viewBoard = React.useMemo(() => (board ? filterBoardByAssignee(board, assignee || null) : null), [board, assignee])
```
  Importer le helper : `import { filterBoardByAssignee } from '../adoBoard'` (ajouter aux imports). `useState` est déjà importé ; ajouter `useMemo` à l'import `react` si absent (sinon utiliser `React.useMemo` comme ci-dessus — cohérent).

- [ ] **Step 2 — dropdown dans la barre, à GAUCHE du refresh.** Dans `.ado-board-bar`, juste AVANT le `<button className="btn ado-refresh" …>`, insérer :
```tsx
        <select className="ado-assignee-filter" value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Filtrer par personne assignée">
          <option value="">— toutes les personnes —</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
```

- [ ] **Step 3 — utiliser `viewBoard` dans les vues (mais `board` pour le détail).** Dans le rendu de `.ado-content`, remplacer les passages `board={board}` des vues par `viewBoard` et la condition par `viewBoard` :
```tsx
        {viewBoard
          ? (ado.view === 'board'
              ? <TaskBoardView board={viewBoard} q={query} filter={filter} onOpen={setDetailId} />
              : <TreeView board={viewBoard} q={query} filter={filter} />)
          : refreshing
            ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
            : !err && <div className="ado-center">Aucune donnée.</div>}
```
  Laisser le bloc détail (`detailId !== null && board && …`) sur **`board`** (données complètes, non filtrées) — inchangé.

- [ ] **Step 4 — build + tests.** `npm run build` (OK) ; `npm test` (vert).

- [ ] **Step 5 — vérif manuelle (`npm run dev`).** 1) Colonnes = IN PR / IN TEST visibles. 2) Pas de trou en haut au scroll. 3) Repli d'une US → ligne compacte ; expander « Tout replier / Tout déplier » dans l'en-tête. 4) Dropdown personne → filtre US+tâches sur les 2 vues. 5) Plus de bande sombre à gauche.

- [ ] **Step 6 — commit.**
```bash
git add src/renderer/src/components/AdoBoard.tsx
git commit -m "feat(ado): filtre par personne assignee (dropdown) sur Board + Arborescence"
```

---

## Notes
- `api-version=7.1-preview.1` pour taskboardcolumns : si 404 au runtime, le repli sur les états Task s'active automatiquement (board jamais cassé) ; ajuster la version au besoin lors de la vérif manuelle.
- Ambiguïté possible si 2 colonnes mappent le même état Task → 1ère colonne gagnante (acceptable ; sinon, ajouter la colonne stockée par work item plus tard).
- Convention commits : pas de trailer Co-Authored-By, aucune mention IA.
