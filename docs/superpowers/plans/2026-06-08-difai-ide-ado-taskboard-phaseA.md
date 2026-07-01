# ADO Taskboard (Phase A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la vue « Board » du type d'onglet `ado` par un Sprint Taskboard façon Azure DevOps (swimlane par US, colonnes = états des tâches), tout en préservant la vue cartes-par-état actuelle pour de futurs types.

**Architecture :** Le main expose déjà les US d'un sprint + leurs tâches enfants via `listBoard`. On ajoute uniquement la liste ordonnée des **états du type Task** (`taskStates`) au payload `AdoBoard`. Côté renderer, on extrait l'ancienne `BoardView` dans `StateBoardView` (conservée, orpheline), on factorise le composant de surlignage `Hl`, et on ajoute un `TaskBoardView` purement présentationnel qui s'appuie sur un helper testable `tasksByState`.

**Tech Stack :** Electron + React 18 + TypeScript, Zustand, xterm (hors-scope ici), vitest. REST Azure DevOps direct (pas de SDK).

**Branche :** créer `feat/lot4-ado-board` depuis le HEAD courant **avant** de commencer (ne pas committer sur `feat/cmd-terminal` qui porte la PR #10).

```bash
git checkout -b feat/lot4-ado-board
```

**Référence :** spec `docs/superpowers/specs/2026-06-08-difai-ide-ado-taskboard-detail-design.md` (section « Phase A »).

---

### Task 1 : `taskStates` dans le payload board (main)

**Files:**
- Modify: `src/shared/ipc.ts:76-80` (interface `AdoBoard`)
- Modify: `src/main/ado/AdoProvider.ts:44-60` (`listBoard`)
- Test: `tests/AdoProvider.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter ce test dans `tests/AdoProvider.test.ts`, à l'intérieur du `describe('AdoProvider', …)`, après le test `listBoard` existant :

```ts
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
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- AdoProvider`
Expected: FAIL — `board.taskStates` est `undefined` (et erreur de type TS sur `taskStates`).

- [ ] **Step 3 : Ajouter le champ au type `AdoBoard`**

Dans `src/shared/ipc.ts`, modifier l'interface `AdoBoard` :

```ts
/** Board d'un sprint : colonnes (états du process) + US, chacune avec ses tâches. */
export interface AdoBoard {
  states: string[]                 // ordre des colonnes (états User Story) — vue cartes-par-état
  taskStates: string[]             // ordre des colonnes du taskboard (états du type Task)
  stories: AdoWorkItem[]           // cards (User Stories)
  tasksByParent: Record<number, AdoWorkItem[]>
}
```

- [ ] **Step 4 : Récupérer les états Task dans `listBoard`**

Dans `src/main/ado/AdoProvider.ts`, méthode `listBoard`, juste après la ligne qui calcule `states` (`const states: string[] = …`), insérer :

```ts
    const taskStatesRaw = (await this.get(statesUrl(this.conn.baseUrl, p.project, 'Task'))).value ?? []
    const taskStates: string[] = [...taskStatesRaw].sort((a, b) => a.order - b.order).map((s: any) => s.name)
```

Puis modifier le `return` final de `listBoard` :

```ts
    return { states, taskStates, stories, tasksByParent }
```

- [ ] **Step 5 : Lancer le test, vérifier le succès**

Run: `npm test -- AdoProvider`
Expected: PASS (tous les tests AdoProvider verts, y compris le nouveau).

- [ ] **Step 6 : Commit**

```bash
git add src/shared/ipc.ts src/main/ado/AdoProvider.ts tests/AdoProvider.test.ts
git commit -m "feat(ado): expose les etats du type Task (taskStates) dans le payload board"
```

---

### Task 2 : Helper `tasksByState` (renderer, pur, testé)

**Files:**
- Create: `src/renderer/src/adoBoard.ts`
- Test: `tests/adoBoard.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/adoBoard.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { tasksByState } from '../src/renderer/src/adoBoard'
import type { AdoWorkItem } from '../src/shared/ipc'

const wi = (id: number, state: string): AdoWorkItem =>
  ({ id, type: 'Task', title: `T${id}`, state, assignedTo: null, parentId: 1, childCount: 0 })

describe('tasksByState', () => {
  it('répartit les tâches dans la colonne de leur état', () => {
    const out = tasksByState([wi(1, 'New'), wi(2, 'Closed'), wi(3, 'New')], ['New', 'Active', 'Closed'])
    expect(out['New'].map((t) => t.id)).toEqual([1, 3])
    expect(out['Active']).toEqual([])
    expect(out['Closed'].map((t) => t.id)).toEqual([2])
  })

  it('garantit une entrée (tableau) pour chaque état, même vide', () => {
    const out = tasksByState([], ['New', 'Closed'])
    expect(Object.keys(out)).toEqual(['New', 'Closed'])
    expect(out['New']).toEqual([])
  })

  it('ignore les tâches dont l\'état n\'est dans aucune colonne', () => {
    const out = tasksByState([wi(1, 'Removed'), wi(2, 'New')], ['New', 'Closed'])
    expect(out['New'].map((t) => t.id)).toEqual([2])
    expect(Object.values(out).flat().map((t) => t.id)).toEqual([2])
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- adoBoard`
Expected: FAIL — module `adoBoard` introuvable.

- [ ] **Step 3 : Implémenter le helper**

Créer `src/renderer/src/adoBoard.ts` :

```ts
import type { AdoWorkItem } from '../../shared/ipc'

/**
 * Répartit les tâches dans la colonne correspondant à leur état.
 * Garantit une entrée (tableau, éventuellement vide) pour CHAQUE état fourni.
 * Les tâches dont l'état n'est dans aucune colonne sont ignorées (cas rare : Removed).
 */
export function tasksByState(
  tasks: AdoWorkItem[],
  taskStates: string[]
): Record<string, AdoWorkItem[]> {
  const out: Record<string, AdoWorkItem[]> = {}
  for (const st of taskStates) out[st] = []
  for (const t of tasks) {
    if (out[t.state]) out[t.state].push(t)
  }
  return out
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- adoBoard`
Expected: PASS (3 tests verts).

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/adoBoard.ts tests/adoBoard.test.ts
git commit -m "feat(ado): helper tasksByState (repartition des taches par etat)"
```

---

### Task 3 : Extraire `Hl` et `StateBoardView` (refactor, comportement inchangé)

**But :** sortir le composant `Hl` et l'ancienne `BoardView` d'`AdoBoard.tsx` dans des fichiers dédiés. `StateBoardView` est conservée pour les futurs types `validation UX` / `validation devtest`. Aucun changement visible : la vue « Board » rend `StateBoardView` (identique à l'ancienne `BoardView`).

**Files:**
- Create: `src/renderer/src/components/Hl.tsx`
- Create: `src/renderer/src/components/StateBoardView.tsx`
- Modify: `src/renderer/src/components/AdoBoard.tsx`

- [ ] **Step 1 : Créer le composant `Hl`**

Créer `src/renderer/src/components/Hl.tsx` :

```tsx
import { splitHighlight } from '../adoFind'

/** Texte avec occurrences de `q` surlignées (mark.ado-hl, repéré par la recherche). */
export function Hl({ text, q }: { text: string; q: string }): React.JSX.Element {
  if (!q) return <>{text}</>
  return (
    <>
      {splitHighlight(text, q).map((s, i) =>
        s.hit ? <mark key={i} className="ado-hl">{s.text}</mark> : <span key={i}>{s.text}</span>
      )}
    </>
  )
}
```

- [ ] **Step 2 : Créer `StateBoardView` (copie conforme de l'ancienne `BoardView`)**

Créer `src/renderer/src/components/StateBoardView.tsx` :

```tsx
import type { AdoBoard as Board } from '../../../shared/ipc'
import { Hl } from './Hl'
import { storyVisible } from '../adoFind'

interface Props { board: Board; q: string; filter: boolean; onOpen: (id: number) => void }

/**
 * Vue cartes : une carte par US, groupées par état d'US.
 * Conservée pour les futurs types validation UX / devtest (lot ultérieur).
 */
export function StateBoardView({ board, q, filter, onOpen }: Props): React.JSX.Element {
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  return (
    <div className="ado-cols">
      {board.states.map((state) => {
        const cards = stories.filter((s) => s.state === state)
        return (
          <div key={state} className="ado-col">
            <div className="ado-col-head">{state} <span className="ado-col-count">{cards.length}</span></div>
            <div className="ado-col-body">
              {cards.map((s) => (
                <button key={s.id} className="ado-card" onClick={() => onOpen(s.id)}>
                  <div className="ado-card-title"><Hl text={s.title} q={q} /></div>
                  <div className="ado-card-meta">
                    <span className="ado-id"><Hl text={`#${s.id}`} q={q} /></span>
                    <span className="ado-card-tasks">{s.childCount} tâche{s.childCount > 1 ? 's' : ''}</span>
                    <span className="ado-assignee"><Hl text={s.assignedTo ?? '—'} q={q} /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3 : Nettoyer `AdoBoard.tsx` et router vers `StateBoardView`**

Dans `src/renderer/src/components/AdoBoard.tsx` :

1. Ajouter les imports en tête (après l'import existant `import { AdoStoryDetail } …`) :

```tsx
import { Hl } from './Hl'
import { StateBoardView } from './StateBoardView'
```

2. **Supprimer** la fonction locale `Hl` (le bloc `function Hl({ text, q }… )` et son commentaire `/** Texte avec occurrences… */`).

3. **Supprimer** la fonction locale `BoardView` entière (le bloc `function BoardView({ board, q, filter, onOpen }: ViewProps & { onOpen: (id: number) => void }) { … }`).

4. Dans le rendu, remplacer l'appel à `<BoardView … />` par `<StateBoardView … />` :

```tsx
        {board
          ? (ado.view === 'board'
              ? <StateBoardView board={board} q={query} filter={filter} onOpen={setDetailId} />
              : <TreeView board={board} q={query} filter={filter} />)
          : refreshing
            ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
            : !err && <div className="ado-center">Aucune donnée.</div>}
```

(Conserver `TreeView`, `StoryRow`, `EyeIcon` et l'interface `ViewProps` — `TreeView` et `StoryRow` utilisent désormais le `Hl` importé.)

- [ ] **Step 4 : Vérifier build + tests (aucune régression)**

Run: `npm run build`
Expected: build OK, aucune erreur TS (pas d'import inutilisé, `Hl`/`StateBoardView` résolus).

Run: `npm test`
Expected: PASS — la totalité de la suite reste verte.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/components/Hl.tsx src/renderer/src/components/StateBoardView.tsx src/renderer/src/components/AdoBoard.tsx
git commit -m "refactor(ado): extrait Hl + StateBoardView (conservee pour types validation)"
```

---

### Task 4 : `TaskBoardView` (swimlanes × états Task) + CSS + branchement

**But :** créer le taskboard et le brancher sur la vue « Board » du type `ado`.

**Files:**
- Create: `src/renderer/src/components/TaskBoardView.tsx`
- Modify: `src/renderer/index.html` (styles)
- Modify: `src/renderer/src/components/AdoBoard.tsx` (route + import)

- [ ] **Step 1 : Créer `TaskBoardView`**

Créer `src/renderer/src/components/TaskBoardView.tsx` :

```tsx
import { useState } from 'react'
import type { AdoBoard as Board, AdoWorkItem } from '../../../shared/ipc'
import { Hl } from './Hl'
import { tasksByState } from '../adoBoard'
import { itemMatches, storyVisible } from '../adoFind'

interface Props { board: Board; q: string; filter: boolean; onOpen: (id: number) => void }

/** Sprint Taskboard façon Azure DevOps : une swimlane par US, colonnes = états des tâches. */
export function TaskBoardView({ board, q, filter, onOpen }: Props): React.JSX.Element {
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  // Colonne US figée (220px) + une colonne par état de tâche.
  const cols = `220px repeat(${board.taskStates.length}, minmax(180px, 1fr))`
  return (
    <div className="ado-taskboard">
      <div className="ado-tb-head" style={{ gridTemplateColumns: cols }}>
        <div className="ado-tb-head-cell swim">User Story</div>
        {board.taskStates.map((st) => <div key={st} className="ado-tb-head-cell">{st}</div>)}
      </div>
      {stories.map((s) => (
        <Swimlane
          key={s.id}
          story={s}
          tasks={board.tasksByParent[s.id] ?? []}
          taskStates={board.taskStates}
          cols={cols}
          q={q}
          filter={filter}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function Swimlane({ story, tasks, taskStates, cols, q, filter, onOpen }: {
  story: AdoWorkItem; tasks: AdoWorkItem[]; taskStates: string[]; cols: string
  q: string; filter: boolean; onOpen: (id: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  // En mode filtre, si l'US ne matche pas, on ne garde que ses tâches qui matchent (comme TreeView).
  const visTasks = filter && q && !itemMatches(story, q) ? tasks.filter((t) => itemMatches(t, q)) : tasks
  const byState = tasksByState(visTasks, taskStates)
  return (
    <div className="ado-swimlane" style={{ gridTemplateColumns: cols }}>
      <div className="ado-swim-head">
        <button className="ado-caret" title={open ? 'Replier' : 'Déplier'} onClick={() => setOpen((o) => !o)}>
          {visTasks.length ? (open ? '▾' : '▸') : '·'}
        </button>
        <button className="ado-card ado-us-card" onClick={() => onOpen(story.id)}>
          <div className="ado-card-title"><Hl text={story.title} q={q} /></div>
          <div className="ado-card-meta">
            <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
            <span className="ado-state"><Hl text={story.state} q={q} /></span>
            <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
          </div>
        </button>
      </div>
      {taskStates.map((st) => (
        <div key={st} className="ado-tb-cell">
          {open && byState[st].map((t) => (
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

- [ ] **Step 2 : Ajouter les styles du taskboard**

Dans `src/renderer/index.html`, juste après la ligne `.term-screen { … }` (ligne ~108), insérer ce bloc :

```css
      /* Taskboard ADO : grille swimlanes (US figée à gauche) × colonnes d'états de tâches */
      .ado-taskboard { height: 100%; overflow: auto; padding: 8px 10px; }
      .ado-tb-head { display: grid; gap: 8px; position: sticky; top: 0; z-index: 2; background: #1b1b1b; padding: 2px 0 6px; }
      .ado-tb-head-cell { font-size: 12px; color: #9c9; padding: 4px 6px; border-bottom: 1px solid #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ado-tb-head-cell.swim { position: sticky; left: 0; background: #1b1b1b; z-index: 1; }
      .ado-swimlane { display: grid; gap: 8px; align-items: start; padding: 8px 0; border-bottom: 1px solid #262626; }
      .ado-swim-head { position: sticky; left: 0; z-index: 1; background: #1b1b1b; display: flex; gap: 4px; align-items: flex-start; }
      .ado-caret { background: none; border: none; color: #9ab; cursor: pointer; font-size: 12px; line-height: 1; padding: 4px 2px; }
      .ado-tb-cell { display: flex; flex-direction: column; gap: 6px; min-height: 8px; }
      .ado-us-card { flex: 1; min-width: 0; border-left: 3px solid #c80; text-align: left; }
      .ado-task-card { text-align: left; }
```

(Les cartes réutilisent la classe existante `.ado-card`.)

- [ ] **Step 3 : Brancher `TaskBoardView` dans `AdoBoard.tsx`**

Dans `src/renderer/src/components/AdoBoard.tsx` :

1. Remplacer l'import `import { StateBoardView } from './StateBoardView'` par :

```tsx
import { TaskBoardView } from './TaskBoardView'
```

(`StateBoardView` reste un fichier orphelin volontairement conservé — il n'est plus importé par `AdoBoard`.)

2. Dans le rendu, remplacer `<StateBoardView … />` par `<TaskBoardView … />` :

```tsx
        {board
          ? (ado.view === 'board'
              ? <TaskBoardView board={board} q={query} filter={filter} onOpen={setDetailId} />
              : <TreeView board={board} q={query} filter={filter} />)
          : refreshing
            ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
            : !err && <div className="ado-center">Aucune donnée.</div>}
```

- [ ] **Step 4 : Vérifier build + tests**

Run: `npm run build`
Expected: build OK (aucune erreur TS ; `StateBoardView` orpheline ne déclenche pas d'erreur car les exports inutilisés ne sont pas signalés).

Run: `npm test`
Expected: PASS — suite complète verte.

- [ ] **Step 5 : Vérification manuelle**

Run: `npm run dev`
Vérifier sur un onglet ADO configuré, vue « Board » :
1. Une ligne par US ; colonnes = états des tâches (New / Active / IN PR / Resolved / IN TEST / Closed selon Cerba).
2. Carte US figée à gauche (reste visible au scroll horizontal) ; caret qui replie/déplie la swimlane.
3. Cartes-tâches placées dans la colonne de leur état ; clic sur une carte (US ou tâche) ouvre le drawer détail existant.
4. Recherche (Ctrl+F) : surlignage + filtre œil masquent les swimlanes sans correspondance.

- [ ] **Step 6 : Commit**

```bash
git add src/renderer/src/components/TaskBoardView.tsx src/renderer/index.html src/renderer/src/components/AdoBoard.tsx
git commit -m "feat(ado): vue Board = Sprint Taskboard (swimlanes US x etats taches)"
```

---

## Notes de fin de Phase A

- La vue détail reste le **drawer existant** (`AdoStoryDetail`) — son enrichissement (description, AC, story points, priorité, commentaires, images, plein écran) est la **Phase B**, plan séparé.
- `StateBoardView` est volontairement non câblée : elle sera branchée sur les types `validation UX` / `validation devtest` quand ils existeront.
