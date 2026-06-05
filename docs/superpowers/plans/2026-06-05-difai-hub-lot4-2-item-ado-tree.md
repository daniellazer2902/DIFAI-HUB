# Lot 4.2 — Item type `ado` + onglet + vue Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Permettre d'ajouter un item de type `ado` (via le menu `+` d'un volet ou le menu `···`/`+` d'un groupe) qui ouvre un onglet affichant le backlog du groupe (US → tâches) en vue arborescente lecture seule, le groupe portant la config ADO `{connId, project, team}`.

**Architecture:** Le `Item` gagne un `kind` (`'claude'|'ado'`). Un item `ado` n'est pas un pty (pas de `tabId`). Le `Group` porte le binding `ado`. Nouveau `TabKind 'ado'` (préfixe `d:`). `Workspace`/`Pane` rendent `<AdoBoard/>` pour un onglet `ado`. Le board appelle les IPC `ado*` du lot 4.1 (REST direct).

**Tech Stack:** Zustand, React 19, TS, Vitest. S'appuie sur le lot 4.1 (provider/IPC ADO déjà livrés).

**Spec :** `docs/superpowers/specs/2026-06-05-difai-hub-lot4-ado-design.md` (§3, §4, §5).

**Modèle (décisions actées) :**
- `Item.kind: 'claude' | 'ado'` (défaut `'claude'`). Item `ado` : `tabId:null`, pas de pty, porte `ado: { view: 'tree'|'board'; iterationPath: string|null }`.
- `Group.ado: { connId: string; project: string; team: string | null } | null` (binding ; le sprint est dans l'item, pas le groupe).
- Vue Board réelle = sous-lot 4.3 ; en 4.2 le toggle existe mais la vue `board` affiche un placeholder « Vue board — sous-lot 4.3 ». La vue `tree` est fonctionnelle.
- `closeSession` reste inchangé pour `ado` (pas de pty à tuer ; pinned = persiste au redémarrage). L'icône ✕ appelle `closeSession` comme pour une session.

**Fichiers réels de référence :** `src/renderer/src/store.ts` (Item/Group/TabKind/paneRefs/addItem/tabRef), `src/main/workspaceStore.ts` (normItem/normGroup), `src/renderer/src/components/{Pane,Workspace,Sidebar,GroupColorModal}.tsx`, `src/shared/ipc.ts` (PersistItem/PersistGroup + types Ado*).

---

## Task 1 : Store — `kind`, binding groupe, TabKind `ado`, paneRefs, actions (TDD)

**Files:**
- Modify: `src/renderer/src/store.ts`
- Test: `tests/store.test.ts` (ajouter des cas)

- [ ] **Step 1: Écrire les tests** (ajouter à la fin du fichier `tests/store.test.ts`, AVANT la dernière accolade fermante du fichier ; réutilise le helper `mkItem` existant)

```ts
describe('store ADO (lot 4.2)', () => {
  beforeEach(() => useHub.getState().reset())

  const mkAdo = (id: string, over: Partial<Item> = {}): Item => ({
    id, name: id, cwd: '', pinned: false, tabId: null, state: 'done', agents: [], openAgentId: null,
    split: 1, findOpen: false, agentsOpen: false, searchQuery: '', kind: 'ado',
    ado: { view: 'tree', iterationPath: null }, ...over
  })

  it('addItem d\'un item ado active l\'onglet ado (ref d:)', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    const grp = useHub.getState().groups.find((x) => x.id === g)!
    expect(grp.leftActiveTab).toBe('d:a1')
  })

  it('paneRefs inclut un item ado sans tabId', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toContain('d:a1')
  })

  it('un item claude sans tabId reste absent des onglets', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('c1', { tabId: null, kind: 'claude' }))
    expect(useHub.getState().leftTabs().map((t) => t.ref)).not.toContain('s:c1')
  })

  it('setGroupAdo pose et retire le binding', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().setGroupAdo(g, { connId: 'c1', project: 'P', team: 'T' })
    expect(useHub.getState().groups.find((x) => x.id === g)!.ado).toEqual({ connId: 'c1', project: 'P', team: 'T' })
    useHub.getState().setGroupAdo(g, null)
    expect(useHub.getState().groups.find((x) => x.id === g)!.ado).toBeNull()
  })

  it('setAdoView et setAdoIteration mettent à jour l\'item', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkAdo('a1'))
    useHub.getState().setAdoView('a1', 'board')
    useHub.getState().setAdoIteration('a1', 'P\\Sprint 2')
    const it = useHub.getState().itemById('a1')!
    expect(it.ado).toEqual({ view: 'board', iterationPath: 'P\\Sprint 2' })
  })

  it('parseRef décode le préfixe d: en kind ado', () => {
    expect(parseRef('d:a1')).toEqual({ kind: 'ado', itemId: 'a1' })
    expect(tabRef('ado', 'a1')).toBe('d:a1')
  })
})
```

Ajouter `parseRef` à l'import en tête du fichier de test : `import { useHub, tabRef, parseRef } from '../src/renderer/src/store'`.

- [ ] **Step 2: Lancer → échec**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL (kind/ado/setGroupAdo/setAdoView/setAdoIteration/parseRef'd:' inexistants).

- [ ] **Step 3: Modifier `src/renderer/src/store.ts`**

3a. `TabKind` et types :
```ts
export type TabKind = 'session' | 'find' | 'agents' | 'ado'
export interface AdoView { view: 'tree' | 'board'; iterationPath: string | null }
export interface GroupAdo { connId: string; project: string; team: string | null }
```

3b. `Item` : ajouter deux champs (après `searchQuery`) :
```ts
  kind: 'claude' | 'ado'
  ado?: AdoView
```

3c. `Group` : ajouter (après `color`) :
```ts
  ado: GroupAdo | null
```

3d. `KIND_PREFIX` + `parseRef` :
```ts
const KIND_PREFIX: Record<TabKind, string> = { session: 's', find: 'f', agents: 'a', ado: 'd' }
```
Dans `parseRef`, étendre le mapping :
```ts
  const kind: TabKind = p === 's' ? 'session' : p === 'f' ? 'find' : p === 'a' ? 'agents' : p === 'd' ? 'ado' : 'session'
```

3e. `paneRefs` : pour les items du volet courant, gérer le kind `ado` (qui n'a pas de tabId). Remplacer la boucle :
```ts
function paneRefs(group: Group, pane: Pane): string[] {
  const refs: string[] = []
  const sessionSplit = pane === 'left' ? 1 : 2
  const auxOwnerSplit = pane === 'left' ? 2 : 1
  for (const i of group.items) {
    if (i.split === sessionSplit) {
      if (i.kind === 'ado') refs.push(tabRef('ado', i.id))
      else if (i.tabId) refs.push(tabRef('session', i.id))
    }
    if (i.split === auxOwnerSplit && i.findOpen) refs.push(tabRef('find', i.id))
    if (i.split === auxOwnerSplit && i.agentsOpen) refs.push(tabRef('agents', i.id))
  }
  return refs
}
```

3f. `addGroup` : ajouter `ado: null` dans l'objet groupe créé :
```ts
      groups: [...s.groups, { id, name, collapsed: false, defaultCwd: null, color: null, ado: null, items: [], leftActiveTab: null, rightActiveTab: null }],
```

3g. `addItem` : router l'onglet actif selon le kind :
```ts
  addItem: (groupId, item) =>
    set((s) => {
      const pane: Pane = item.split === 2 ? 'right' : 'left'
      const ref = item.kind === 'ado' ? tabRef('ado', item.id) : tabRef('session', item.id)
      const groups = s.groups.map((g) => {
        if (g.id !== groupId) return g
        const ng = { ...g, items: [...g.items, item] }
        return pane === 'left' ? { ...ng, leftActiveTab: ref } : { ...ng, rightActiveTab: ref }
      })
      return { groups: normalizeAll(groups), activeGroupId: groupId, activeItemId: item.id, focusedPane: pane }
    }),
```

3h. Nouvelles actions (ajouter à l'interface `HubState` ET à l'implémentation) :
```ts
  // interface HubState (près de setSplit)
  setGroupAdo: (groupId: string, ado: GroupAdo | null) => void
  setAdoView: (itemId: string, view: 'tree' | 'board') => void
  setAdoIteration: (itemId: string, iterationPath: string | null) => void
```
```ts
  // implémentation (près de setGroupColor / setSplit)
  setGroupAdo: (groupId, ado) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, ado } : g)) })),
  setAdoView: (itemId, view) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, ado: { view, iterationPath: i.ado?.iterationPath ?? null } })) })),
  setAdoIteration: (itemId, iterationPath) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, ado: { view: i.ado?.view ?? 'tree', iterationPath } })) })),
```

3i. `loadWorkspace` : les items reconstruits doivent recevoir `kind` et `ado`, et les groupes `ado`. Modifier le mapping (voir Task 2 pour la persistance ; ici, ajouter `kind: 'claude'` par défaut et `ado: null` au groupe pour que le type compile) :
- Dans le `groups.map` de `loadWorkspace`, ajouter `ado: g.ado ?? null` au groupe et `kind: (i.kind ?? 'claude')`, `ado: i.ado` à chaque item (Task 2 fournit `g.ado`/`i.kind`/`i.ado` côté PersistItem/PersistGroup ; si Task 2 n'est pas encore faite, utiliser `kind: 'claude'` et `ado: null` group, ce qui compile et sera complété en Task 2).

3j. Le helper `mkItem` des tests existants n'a pas `kind` : ajouter `kind: 'claude'` au littéral `mkItem` en tête de `tests/store.test.ts` pour que les items existants restent valides au type.

- [ ] **Step 4: Lancer → succès**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS (cas existants + 6 nouveaux). Corriger les erreurs de type éventuelles (champ `kind` requis sur `Item` → s'assurer que `mkItem` et tous les littéraux `Item` du fichier le portent).

- [ ] **Step 5: Compiler le renderer**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: des erreurs ATTENDUES là où des `Item`/`Group` sont construits sans `kind`/`ado` (Pane.tsx `openTab`, Sidebar.tsx `addItemTo`, store `addGroup` déjà corrigé). Les corriger **a minima pour compiler** : ajouter `kind: 'claude'` aux littéraux `Item` de `Pane.openTab` et `Sidebar.addItemTo`. NE PAS encore ajouter les entrées de menu ADO (Task 3). Confirmer compilation propre ensuite.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store.ts tests/store.test.ts src/renderer/src/components/Pane.tsx src/renderer/src/components/Sidebar.tsx
git commit -m "feat(lot4.2): store - Item.kind, binding groupe ado, TabKind ado, actions"
```
Repo style : pas de Co-Authored-By, pas de mention IA.

---

## Task 2 : Persistance — PersistItem/PersistGroup + migration (TDD)

**Files:**
- Modify: `src/shared/ipc.ts` (PersistItem, PersistGroup)
- Modify: `src/main/workspaceStore.ts` (normItem, normGroup)
- Modify: `src/renderer/src/store.ts` (toPersistable, loadWorkspace)
- Test: `tests/workspaceStore.test.ts`

- [ ] **Step 1: Étendre les types** dans `src/shared/ipc.ts` :
```ts
export interface PersistItem { id: string; name: string; cwd: string; split?: 1 | 2; kind?: 'claude' | 'ado'; ado?: { view: 'tree' | 'board'; iterationPath: string | null } }
export interface PersistGroup { id: string; name: string; collapsed: boolean; defaultCwd: string | null; color?: string | null; ado?: { connId: string; project: string; team: string | null } | null; items: PersistItem[] }
```

- [ ] **Step 2: Écrire les tests** (ajouter à `tests/workspaceStore.test.ts`)

```ts
import { parseWorkspace } from '../src/main/workspaceStore'
// ... (si déjà importé, ne pas redoubler)

describe('workspaceStore ADO (lot 4.2)', () => {
  it('parse un item ado (kind + ado)', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      ado: { connId: 'c1', project: 'P', team: 'T' },
      items: [{ id: 'a1', name: 'Board', cwd: '', kind: 'ado', ado: { view: 'tree', iterationPath: 'P\\S1' } }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].ado).toEqual({ connId: 'c1', project: 'P', team: 'T' })
    expect(t.groups[0].items[0]).toMatchObject({ id: 'a1', kind: 'ado', ado: { view: 'tree', iterationPath: 'P\\S1' } })
  })

  it('un item sans kind reste accepté (claude implicite)', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      items: [{ id: 'c1', name: 'Sess', cwd: 'C:/x' }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].items[0].id).toBe('c1')
    expect(t.groups[0].items[0].kind).toBeUndefined() // pas de kind => claude implicite côté store
    expect(t.groups[0].ado).toBeUndefined()
  })

  it('ignore un ado d\'item mal formé', () => {
    const raw = JSON.stringify({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'G', collapsed: false, defaultCwd: null,
      items: [{ id: 'a1', name: 'B', cwd: '', kind: 'ado', ado: { view: 'wrong' } }] }] })
    const t = parseWorkspace(raw)
    expect(t.groups[0].items[0].ado).toBeUndefined() // ado invalide droppé, item conservé
    expect(t.groups[0].items[0].kind).toBe('ado')
  })
})
```

- [ ] **Step 3: Lancer → échec**

Run: `npx vitest run tests/workspaceStore.test.ts`
Expected: FAIL.

- [ ] **Step 4: Modifier `src/main/workspaceStore.ts`**

`normItem` :
```ts
function normItem(x: unknown): PersistItem | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.cwd !== 'string') return null
  const split: 1 | 2 | undefined = o.split === 2 ? 2 : o.split === 1 ? 1 : undefined
  const kind: 'claude' | 'ado' | undefined = o.kind === 'ado' ? 'ado' : o.kind === 'claude' ? 'claude' : undefined
  let ado: PersistItem['ado'] | undefined
  const a = o.ado as Record<string, unknown> | undefined
  if (a && (a.view === 'tree' || a.view === 'board')) {
    ado = { view: a.view, iterationPath: typeof a.iterationPath === 'string' ? a.iterationPath : null }
  }
  return { id: o.id, name: o.name, cwd: o.cwd, ...(split ? { split } : {}), ...(kind ? { kind } : {}), ...(ado ? { ado } : {}) }
}
```

`normGroup` : ajouter la lecture du binding `ado` (n'y mettre que si bien formé) :
```ts
function normGroup(x: unknown): PersistGroup | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const items = Array.isArray(o.items) ? (o.items.map(normItem).filter(Boolean) as PersistItem[]) : []
  const defaultCwd = typeof o.defaultCwd === 'string' ? o.defaultCwd : null
  const color = typeof o.color === 'string' ? o.color : undefined
  const ab = o.ado as Record<string, unknown> | undefined
  const ado = ab && typeof ab.connId === 'string' && typeof ab.project === 'string'
    ? { connId: ab.connId, project: ab.project, team: typeof ab.team === 'string' ? ab.team : null }
    : undefined
  return { id: o.id, name: o.name, collapsed: o.collapsed === true, defaultCwd, items, ...(color ? { color } : {}), ...(ado ? { ado } : {}) }
}
```

- [ ] **Step 5: Modifier `src/renderer/src/store.ts`**

`toPersistable` : persister `kind`/`ado` des items et `ado` du groupe. Pour les items ado, l'épingle n'est pas requise pour persister (un board épinglé persiste ; sinon éphémère, comme les sessions). Garder le filtre `i.pinned` :
```ts
  toPersistable: () => {
    const s = get()
    return {
      activeGroupId: s.activeGroupId,
      groups: s.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd, color: g.color,
        ...(g.ado ? { ado: g.ado } : {}),
        items: g.items.filter((i) => i.pinned).map((i) => ({
          id: i.id, name: i.name, cwd: i.cwd, split: i.split, kind: i.kind,
          ...(i.kind === 'ado' && i.ado ? { ado: i.ado } : {})
        }))
      }))
    }
  },
```

`loadWorkspace` : restaurer `kind`/`ado` item + `ado` groupe :
```ts
      groups: normalizeAll(
        tree.groups.map((g) => ({
          id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd ?? null, color: g.color ?? null,
          ado: g.ado ?? null, leftActiveTab: null, rightActiveTab: null,
          items: g.items.map((i) => ({
            id: i.id, name: i.name, cwd: i.cwd, pinned: true, tabId: null, state: 'done', agents: [], openAgentId: null,
            split: i.split ?? 1, findOpen: false, agentsOpen: false, searchQuery: '',
            kind: i.kind ?? 'claude', ...(i.kind === 'ado' ? { ado: i.ado ?? { view: 'tree', iterationPath: null } } : {})
          }))
        }))
      )
```

- [ ] **Step 6: Lancer les deux suites + tsc**

Run: `npx vitest run tests/workspaceStore.test.ts tests/store.test.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.node.json` → propre.
Run: `npm test` → tout vert.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/main/workspaceStore.ts src/renderer/src/store.ts tests/workspaceStore.test.ts
git commit -m "feat(lot4.2): persistance kind/ado item + binding ado groupe (migration douce)"
```

---

## Task 3 : Modale de binding ADO + entrées de création (UI, checkpoint humain)

**Files:**
- Create: `src/renderer/src/components/AdoBindModal.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx` (menu groupe « Configurer ADO… » + création item ADO)
- Modify: `src/renderer/src/components/Pane.tsx` (entrée « ADO – Azure » dans le menu `+`)
- Modify: `src/renderer/index.html` (styles si besoin, classes préfixées)

- [ ] **Step 1: Créer `AdoBindModal.tsx`**

Modèle = `GroupColorModal.tsx` (via `Modal`). Charge les connexions (`window.hub.adoConnList`), puis projets (`adoListProjects`) à la sélection d'une connexion, puis équipes (`adoListTeams`). Sur Appliquer → `onApply({ connId, project, team })`.

```tsx
import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import type { AdoConnection, AdoProject, AdoTeam } from '../../../shared/ipc'
import type { GroupAdo } from '../store'

interface Props {
  current: GroupAdo | null
  onApply: (ado: GroupAdo) => void
  onClose: () => void
}

export function AdoBindModal({ current, onApply, onClose }: Props): React.JSX.Element {
  const [conns, setConns] = useState<AdoConnection[]>([])
  const [connId, setConnId] = useState(current?.connId ?? '')
  const [projects, setProjects] = useState<AdoProject[]>([])
  const [project, setProject] = useState(current?.project ?? '')
  const [teams, setTeams] = useState<AdoTeam[]>([])
  const [team, setTeam] = useState<string>(current?.team ?? '')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { window.hub.adoConnList().then(setConns) }, [])
  useEffect(() => {
    if (!connId) { setProjects([]); return }
    setErr(null)
    window.hub.adoListProjects(connId).then((r) => r.ok ? setProjects(r.data) : setErr(r.error ?? 'Erreur projets'))
  }, [connId])
  useEffect(() => {
    if (!connId || !project) { setTeams([]); return }
    window.hub.adoListTeams(connId, project).then((r) => r.ok ? setTeams(r.data) : setErr(r.error ?? 'Erreur équipes'))
  }, [connId, project])

  const valid = connId && project
  return (
    <Modal title="Configurer ADO (groupe)" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!valid} onClick={() => valid && onApply({ connId, project, team: team || null })}>Appliquer</button>
      </>}>
      <div className="setting-row"><label>Connexion</label>
        <select value={connId} onChange={(e) => { setConnId(e.target.value); setProject(''); setTeam('') }}>
          <option value="">— choisir —</option>
          {conns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select></div>
      <div className="setting-row"><label>Projet</label>
        <select value={project} onChange={(e) => { setProject(e.target.value); setTeam('') }} disabled={!connId}>
          <option value="">— choisir —</option>
          {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select></div>
      <div className="setting-row"><label>Équipe (option)</label>
        <select value={team} onChange={(e) => setTeam(e.target.value)} disabled={!project}>
          <option value="">— défaut —</option>
          {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select></div>
      {err && <div className="muted">{err}</div>}
    </Modal>
  )
}
```

- [ ] **Step 2: Sidebar — menu groupe « Configurer ADO… » + ajout item ADO**

Dans `Sidebar.tsx` : importer `AdoBindModal`, ajouter un state `const [adoFor, setAdoFor] = useState<string | null>(null)`. Dans le menu `···` du groupe, ajouter une entrée après « Attribuer une couleur » :
```tsx
                  <div onClick={() => { setMenu(null); setAdoFor(g.id) }}><FolderIcon /> Configurer ADO…</div>
```
Ajouter une fonction de création d'item ADO (exige le binding ; sinon ouvre la modale) :
```tsx
  function addAdoItem(group: Group): void {
    setMenu(null)
    if (!group.ado) { setAdoFor(group.id); return }
    const item: Item = {
      id: crypto.randomUUID(), name: `Board ${group.ado.project}`, cwd: '', pinned: false, tabId: null,
      state: 'done', agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'ado', ado: { view: 'tree', iterationPath: null }
    }
    useHub.getState().addItem(group.id, item)
  }
```
Ajouter une entrée « Ajouter un board ADO » dans le menu `···` du groupe (après « Configurer ADO… ») :
```tsx
                  <div onClick={() => addAdoItem(g)}><FolderIcon /> Ajouter un board ADO</div>
```
Monter la modale près de `GroupColorModal` (dans le JSX, à côté de `{colorFor && ...}`) :
```tsx
        {adoFor && (
          <AdoBindModal
            current={groups.find((x) => x.id === adoFor)?.ado ?? null}
            onApply={(ado) => { useHub.getState().setGroupAdo(adoFor, ado); setAdoFor(null) }}
            onClose={() => setAdoFor(null)}
          />
        )}
```

- [ ] **Step 3: Pane `+` menu — entrée « ADO – Azure »**

Dans `Pane.tsx`, le menu `addMenu` (et l'overflow `ovf-add`) propose aujourd'hui « Dossier par défaut » / « Choisir un dossier… ». Ajouter une entrée ADO. Le binding vit sur le groupe (`group.ado`). Ajouter une fonction :
```tsx
  function addAdo(): void {
    closeMenus()
    if (!group.ado) {
      // pas de binding : on délègue à la sidebar (config groupe). Message simple.
      useHub.getState() // no-op
      alert("Configurez d'abord ADO sur le groupe (menu ··· du groupe › Configurer ADO…).")
      return
    }
    const id = crypto.randomUUID()
    useHub.getState().addItem(group.id, {
      id, name: `Board ${group.ado.project}`, cwd: '', pinned: false, tabId: null, state: 'done',
      agents: [], openAgentId: null, split: side === 'right' ? 2 : 1, findOpen: false, agentsOpen: false,
      searchQuery: '', kind: 'ado', ado: { view: 'tree', iterationPath: null }
    })
  }
```
NB : `alert` fonctionne dans Electron renderer pour un message simple ; si une regression connue l'interdit (cf. lot 2 : `window.prompt`/`alert` KO), remplacer par un petit état de message inline dans le menu. **Vérifier** : si `alert` ne s'affiche pas, utiliser à la place un `confirm()` maison (lot 3) en mode information, OU ouvrir directement rien et ne rien faire en laissant le menu signaler « ADO non configuré ». Choisir l'option qui fonctionne et la noter dans le rapport.

Ajouter l'entrée dans `addMenu` (et idéalement dans l'overflow) :
```tsx
          <div onClick={addAdo}><FolderIcon /> ADO – Azure</div>
```

- [ ] **Step 4: tsc + build**

Run: `npx tsc --noEmit -p tsconfig.json` → propre.
Run: `npm test` → vert. `npm run build` → succès.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AdoBindModal.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/components/Pane.tsx src/renderer/index.html
git commit -m "feat(lot4.2): modale binding ADO groupe + entrees creation item ADO"
```

---

## Task 4 : Onglet ADO + vue Tree (`AdoBoard`) + rendu Pane (UI, checkpoint humain)

**Files:**
- Create: `src/renderer/src/components/AdoBoard.tsx`
- Modify: `src/renderer/src/components/Pane.tsx` (rendu de l'onglet `ado` : chip + body)
- Modify: `src/renderer/src/components/icons.tsx` (ajouter un `BoardIcon` SVG si absent ; sinon réutiliser un icône existant)
- Modify: `src/renderer/index.html` (styles board/tree, classes préfixées `.ado-board*`)

- [ ] **Step 1: Créer `AdoBoard.tsx` (vue Tree fonctionnelle, toggle, sélecteur sprint)**

```tsx
import { useEffect, useState, useCallback } from 'react'
import { useHub, type Item, type Group } from '../store'
import type { AdoBoard as Board, AdoIteration, AdoWorkItem } from '../../../shared/ipc'

interface Props { item: Item; group: Group }

export function AdoBoard({ item, group }: Props): React.JSX.Element {
  const ado = item.ado ?? { view: 'tree', iterationPath: null }
  const bind = group.ado
  const [iterations, setIterations] = useState<AdoIteration[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!bind) return
    setLoading(true); setErr(null)
    const r = await window.hub.adoListBoard({ connId: bind.connId, project: bind.project, team: bind.team ?? undefined, iterationPath: ado.iterationPath ?? undefined })
    setLoading(false)
    if (r.ok) setBoard(r.data); else setErr(r.error ?? 'Erreur de chargement')
  }, [bind, ado.iterationPath])

  useEffect(() => {
    if (!bind) return
    window.hub.adoListIterations(bind.connId, bind.project, bind.team ?? undefined).then((r) => {
      if (r.ok) {
        setIterations(r.data)
        if (!ado.iterationPath) {
          const cur = r.data.find((i) => i.current)
          if (cur) useHub.getState().setAdoIteration(item.id, cur.path)
        }
      }
    })
  }, [bind, item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  if (!bind) return <div className="ado-board empty">Groupe non configuré pour ADO. Menu ··· du groupe › Configurer ADO…</div>

  return (
    <div className="ado-board">
      <div className="ado-board-bar">
        <div className="ado-view-toggle">
          <button className={ado.view === 'tree' ? 'sel' : ''} onClick={() => useHub.getState().setAdoView(item.id, 'tree')}>Arborescence</button>
          <button className={ado.view === 'board' ? 'sel' : ''} onClick={() => useHub.getState().setAdoView(item.id, 'board')}>Board</button>
        </div>
        <select value={ado.iterationPath ?? ''} onChange={(e) => useHub.getState().setAdoIteration(item.id, e.target.value || null)}>
          <option value="">— tout le projet —</option>
          {iterations.map((i) => <option key={i.id} value={i.path}>{i.name}{i.current ? ' (courant)' : ''}</option>)}
        </select>
        <button className="btn" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
      </div>
      {err && <div className="ado-board-err">{err} <button className="btn" onClick={load}>Réessayer</button></div>}
      {ado.view === 'board'
        ? <div className="ado-board empty">Vue board — sous-lot 4.3</div>
        : <TreeView board={board} />}
    </div>
  )
}

function TreeView({ board }: { board: Board | null }): React.JSX.Element {
  if (!board) return <div className="ado-tree-empty">Aucune donnée.</div>
  return (
    <div className="ado-tree">
      {board.stories.map((s) => <StoryRow key={s.id} story={s} tasks={board.tasksByParent[s.id] ?? []} />)}
      {board.stories.length === 0 && <div className="ado-tree-empty">Aucune User Story dans ce sprint.</div>}
    </div>
  )
}

function StoryRow({ story, tasks }: { story: AdoWorkItem; tasks: AdoWorkItem[] }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="ado-story">
      <div className="ado-row story" onClick={() => setOpen((o) => !o)}>
        <span className="ado-caret">{tasks.length ? (open ? '▾' : '▸') : '·'}</span>
        <span className="ado-id">#{story.id}</span>
        <span className="ado-title">{story.title}</span>
        <span className="ado-state">{story.state}</span>
        <span className="ado-assignee">{story.assignedTo ?? '—'}</span>
      </div>
      {open && tasks.map((t) => (
        <div key={t.id} className="ado-row task">
          <span className="ado-caret" />
          <span className="ado-id">#{t.id}</span>
          <span className="ado-title">{t.title}</span>
          <span className="ado-state">{t.state}</span>
          <span className="ado-assignee">{t.assignedTo ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Pane.tsx — rendu de l'onglet `ado`**

2a. Import : `import { AdoBoard } from './AdoBoard'` et un icône (ex. `FolderIcon` déjà importé, ou ajouter `BoardIcon`).

2b. `tabLabel` : un onglet `ado` affiche le nom de l'item :
```ts
function tabLabel(t: PaneTab): string {
  if (t.kind === 'session' || t.kind === 'ado') return t.item.name
  return `${t.item.name} - ${t.kind === 'find' ? 'Find' : 'Agents'}`
}
```

2c. Dans `tabs.map`, ajouter une branche pour `t.kind === 'ado'` AVANT la branche aux (similaire à la chip session mais sans StateDot/agents, draggable, avec ✕). Insérer après le `if (t.kind === 'session') { ... }` :
```tsx
            if (t.kind === 'ado') {
              return (
                <div
                  key={t.ref}
                  className={`tab${sel ? ' act' : ''}`}
                  draggable
                  onDragStart={(e) => { setAddMenu(null); setCtx(null); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.item.id); const id = t.item.id; setTimeout(() => setDragId(id), 0) }}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); onDropTab(t.item.id) }}
                  onClick={() => useHub.getState().selectTab(side, t.ref)}
                  onContextMenu={(e) => { e.preventDefault(); const x = Math.max(4, Math.min(e.clientX, window.innerWidth - 190)); const y = Math.min(e.clientY, window.innerHeight - 150); setCtx(ctx?.id === t.item.id ? null : { id: t.item.id, x, y }) }}
                >
                  <span className="tab-ic"><FolderIcon /></span>
                  <span className="tab-title">{t.item.name}</span>
                  {t.item.pinned && <span className="tab-pin"><PinIcon /></span>}
                  <span className="tab-close" title="Fermer l'onglet" onClick={(e) => { e.stopPropagation(); useHub.getState().closeSession(t.item.id) }}>✕</span>
                </div>
              )
            }
```

2d. `pane-body` : rendre `AdoBoard` quand l'onglet actif est `ado`. Les boards `ado` peuvent rester montés comme les terminaux (display none/block) ; pour rester simple en 4.2, rendre seulement l'actif :
```tsx
        {active?.kind === 'ado' && (() => {
          const it = group.items.find((i) => i.id === active.itemId)
          return it ? <AdoBoard item={it} group={group} /> : null
        })()}
```
(Placer cette ligne dans `pane-body`, à côté des rendus find/agents.)

2e. Le menu contextuel `ctx` (renommer/épingler/supprimer) s'applique aussi aux items `ado` : il référence `ctxItem` (par id) — l'entrée « Afficher Agents » n'a pas de sens pour un ado ; la masquer si `ctxItem.kind === 'ado'`. Adapter :
```tsx
          {ctxItem.kind !== 'ado' && (
            <div onClick={() => { if (ctxItem.agentsOpen) useHub.getState().closeAgentsTab(ctxItem.id); else useHub.getState().openAgentsTab(ctxItem.id); setCtx(null) }}><TerminalIcon /> {ctxItem.agentsOpen ? 'Cacher Agents' : 'Afficher Agents'}</div>
          )}
```

- [ ] **Step 3: Styles** dans `src/renderer/index.html` (bloc `<style>`), classes `.ado-board`, `.ado-board-bar`, `.ado-view-toggle`, `.ado-tree`, `.ado-row`, `.ado-id`, `.ado-title`, `.ado-state`, `.ado-assignee`, `.ado-board-err`, cohérentes avec le thème sombre existant. (Le détail visuel est validé au checkpoint humain.)

- [ ] **Step 4: tsc + build**

Run: `npx tsc --noEmit -p tsconfig.json` → propre.
Run: `npm test` → vert. `npm run build` → succès.

- [ ] **Step 5: Checkpoint humain**

`npm run dev` : sur un groupe, menu ··· › Configurer ADO… (choisir connexion/projet/équipe), puis « Ajouter un board ADO » OU `+` du volet › ADO – Azure. Un onglet s'ouvre, la vue arborescence liste les US du sprint courant avec leurs tâches. Tester le sélecteur de sprint et le refresh. Épingler l'item, redémarrer l'app → le board réapparaît.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/AdoBoard.tsx src/renderer/src/components/Pane.tsx src/renderer/src/components/icons.tsx src/renderer/index.html
git commit -m "feat(lot4.2): onglet ADO + vue arborescence US/taches (AdoBoard) + rendu Pane"
```

---

## Self-Review (à exécuter en fin de rédaction)

- **Couverture** : kind/binding/tab (Task 1), persistance/migration (Task 2), création + binding modal (Task 3), onglet + tree (Task 4). Toggle board → placeholder 4.3 (assumé).
- **Cohérence types** : `AdoView`/`GroupAdo` définis et **exportés** depuis `store.ts` (Task 1) — source unique. `AdoBindModal` importe `GroupAdo` depuis `../store` (corrigé). `PersistItem.ado`/`PersistGroup.ado` (ipc, Task 2) sont structurellement identiques mais restent des types distincts côté persistance (pas d'import croisé main↔renderer).
- **Placeholders** : la vue board est un placeholder explicite assumé (4.3), pas un TODO oublié.
- **Risque** : `alert` en Task 3 step 3 — fallback prévu si KO.
