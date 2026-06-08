# Lot 4.3 — Vue Board (lecture) + drawer détail US Implementation Plan

**Goal:** Remplacer le placeholder de la vue « Board » par un vrai board Kanban en lecture seule : colonnes = statuts du process, cards = User Stories ; clic sur une card → drawer de détail (champs US + tâches enfants).

**Architecture:** Pur rendu à partir des données déjà chargées par `adoListBoard` (`AdoBoard.states`, `stories`, `tasksByParent`) — aucun nouvel appel IPC. Réutilise le cache SWR / le sélecteur de sprint / le refresh existants. L'écriture (drag → updateState, créer tâche, assigner) est explicitement hors scope (lot 4.4).

**Tech Stack:** React 19, TS, CSS dans `index.html`. Données : types `AdoBoard`/`AdoWorkItem` (shared/ipc).

**Fichiers :**
- Modify: `src/renderer/src/components/AdoBoard.tsx` (remplacer le placeholder par `<BoardView/>`, gérer l'état `detailId`, monter le drawer).
- Create: `src/renderer/src/components/AdoStoryDetail.tsx` (drawer détail US + tâches).
- Modify: `src/renderer/index.html` (styles `.ado-cols`, `.ado-col`, `.ado-card`, `.ado-drawer`).

---

## Task 1 : Vue Board (colonnes par statut, cards US) + drawer détail (UI, checkpoint humain)

**Files:** voir ci-dessus.

- [ ] **Step 1 : Créer `src/renderer/src/components/AdoStoryDetail.tsx`**

Drawer présentationnel, lecture seule, fermé sur ✕/Échap. Reçoit la story + ses tâches (déjà dans le board) ; pas d'appel réseau.

```tsx
import { useEffect } from 'react'
import type { AdoWorkItem } from '../../../shared/ipc'

interface Props { story: AdoWorkItem; tasks: AdoWorkItem[]; onClose: () => void }

export function AdoStoryDetail({ story, tasks, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ado-drawer-backdrop" onClick={onClose}>
      <div className="ado-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="ado-drawer-head">
          <span className="ado-id">#{story.id}</span>
          <span className="ado-state">{story.state}</span>
          <button className="ado-drawer-x" title="Fermer" onClick={onClose}>✕</button>
        </div>
        <h3 className="ado-drawer-title">{story.title}</h3>
        <div className="ado-drawer-meta">
          <span>{story.type}</span>
          <span>Assigné : {story.assignedTo ?? '—'}</span>
        </div>
        <div className="ado-drawer-section">Tâches ({tasks.length})</div>
        {tasks.length === 0 && <div className="ado-center">Aucune tâche.</div>}
        {tasks.map((t) => (
          <div key={t.id} className="ado-drawer-task">
            <span className="ado-id">#{t.id}</span>
            <span className="ado-title">{t.title}</span>
            <span className="ado-state">{t.state}</span>
            <span className="ado-assignee">{t.assignedTo ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : `AdoBoard.tsx` — état détail + vue Board + montage drawer**

(a) Importer le drawer : `import { AdoStoryDetail } from './AdoStoryDetail'`.
(b) Ajouter l'état : `const [detailId, setDetailId] = useState<number | null>(null)`.
(c) Remplacer la branche board placeholder :
```tsx
        {ado.view === 'board'
          ? <div className="ado-center">Vue board — sous-lot 4.3</div>
          : board ? <TreeView board={board} /> : refreshing ? ... : ...}
```
par un rendu unifié : si `board` existe, on rend selon `ado.view` ; sinon spinner/empty comme aujourd'hui. Structure :
```tsx
      <div className="ado-content">
        {board
          ? (ado.view === 'board'
              ? <BoardView board={board} onOpen={(id) => setDetailId(id)} />
              : <TreeView board={board} />)
          : refreshing
            ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
            : !err && <div className="ado-center">Aucune donnée.</div>}
      </div>
```
(d) Monter le drawer à la fin du `<div className="ado-board">`, après `</div>` de `.ado-content` :
```tsx
      {detailId !== null && board && (() => {
        const s = board.stories.find((x) => x.id === detailId)
        return s ? <AdoStoryDetail story={s} tasks={board.tasksByParent[s.id] ?? []} onClose={() => setDetailId(null)} /> : null
      })()}
```
(e) Ajouter le composant `BoardView` dans le même fichier (après `TreeView`) :
```tsx
function BoardView({ board, onOpen }: { board: Board; onOpen: (id: number) => void }): React.JSX.Element {
  if (board.stories.length === 0) return <div className="ado-center">Aucune User Story dans ce sprint.</div>
  return (
    <div className="ado-cols">
      {board.states.map((state) => {
        const cards = board.stories.filter((s) => s.state === state)
        return (
          <div key={state} className="ado-col">
            <div className="ado-col-head">{state} <span className="ado-col-count">{cards.length}</span></div>
            <div className="ado-col-body">
              {cards.map((s) => (
                <button key={s.id} className="ado-card" onClick={() => onOpen(s.id)}>
                  <div className="ado-card-title">{s.title}</div>
                  <div className="ado-card-meta">
                    <span className="ado-id">#{s.id}</span>
                    <span className="ado-card-tasks">{s.childCount} tâche{s.childCount > 1 ? 's' : ''}</span>
                    <span className="ado-assignee">{s.assignedTo ?? '—'}</span>
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
Note : une US dont l'état n'est dans aucune colonne (improbable, états du même process) n'apparaît pas — acceptable en lecture 4.3.

- [ ] **Step 3 : Styles `index.html`** (bloc `<style>`, classes `ado-`)

Ajouter, cohérent avec le thème sombre (réutiliser `.ado-id`/`.ado-state`/`.ado-assignee` existants) :
- `.ado-cols { flex:1; display:flex; gap:10px; overflow-x:auto; padding:10px; align-items:flex-start; }`
- `.ado-col { flex:0 0 240px; display:flex; flex-direction:column; background:#1b1b1b; border:1px solid #2a2a2a; border-radius:8px; max-height:100%; }`
- `.ado-col-head { flex:none; padding:8px 10px; font-size:12px; font-weight:600; color:#ddd; border-bottom:1px solid #2a2a2a; display:flex; align-items:center; gap:6px; }`
- `.ado-col-count { font-size:11px; color:#888; background:#262626; border-radius:8px; padding:0 6px; }`
- `.ado-col-body { overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:8px; }`
- `.ado-card { text-align:left; background:#232323; border:1px solid #333; border-radius:6px; padding:8px; cursor:pointer; color:#ddd; font-family:inherit; }`
- `.ado-card:hover { background:#2a2d33; border-color:#444; }`
- `.ado-card-title { font-size:12px; margin-bottom:6px; line-height:1.3; }`
- `.ado-card-meta { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }`
- `.ado-card-tasks { font-size:11px; color:#9bd; }`
- Drawer : `.ado-drawer-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.35); display:flex; justify-content:flex-end; z-index:5; }`
- `.ado-drawer { width:360px; max-width:80%; background:#1e1e1e; border-left:1px solid #333; height:100%; overflow-y:auto; padding:14px; box-shadow:-4px 0 16px rgba(0,0,0,.4); }`
- `.ado-drawer-head { display:flex; align-items:center; gap:8px; }`
- `.ado-drawer-x { margin-left:auto; background:none; border:none; color:#aaa; cursor:pointer; font-size:14px; }`
- `.ado-drawer-title { font-size:14px; color:#eee; margin:10px 0 6px; }`
- `.ado-drawer-meta { display:flex; gap:12px; color:#888; font-size:11px; margin-bottom:12px; }`
- `.ado-drawer-section { font-size:12px; font-weight:600; color:#ccc; border-top:1px solid #2a2a2a; padding-top:10px; margin-bottom:6px; }`
- `.ado-drawer-task { display:flex; align-items:center; gap:8px; padding:5px 0; font-size:12px; border-bottom:1px solid #232323; }`

- [ ] **Step 4 : Checks**
- `npx tsc --noEmit -p tsconfig.json` → propre.
- `npm test` → vert.
- `npm run build` → succès.

- [ ] **Step 5 : Checkpoint humain**
`npm run dev` → onglet ADO → toggle **Board** : colonnes par statut, cards US avec nb de tâches ; clic sur une card → drawer (champs + tâches), fermeture ✕/Échap/clic backdrop ; changement de sprint et refresh fonctionnent ; bascule Arbo/Board OK.

- [ ] **Step 6 : Commit**
```bash
git add src/renderer/src/components/AdoBoard.tsx src/renderer/src/components/AdoStoryDetail.tsx src/renderer/index.html
git commit -m "feat(lot4.3): vue Board (colonnes par statut, cards US) + drawer detail US/taches"
```

## Self-Review
- Lecture seule : aucun appel d'écriture, aucune action mutative (drag/assign/state → lot 4.4).
- Réutilise board/cache/sprint/refresh existants ; le drawer lit `board` (reste synchro après refresh).
- `childCount` des cards est fiable (backfillé en 4.1). Pas de placeholder restant : le texte « sous-lot 4.3 » disparaît.
