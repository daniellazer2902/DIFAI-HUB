# DIFAI-HUB Lot 2 — Sidebar de groupes + items Claude + persistance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans. Étapes en checkbox (`- [ ]`).

**Goal:** Organiser les sessions Claude dans une sidebar de groupes (projets/sprint) avec items Claude Code, persistance sur disque, et synchronisation sidebar ↔ onglets.

**Architecture:** Le store Zustand passe d'une liste plate `tabs[]` à `groups[] → items[]` + `activeGroupId` + `activeItemId`. Un **item** porte sa config (nom, dossier, épinglé) et son état runtime de session (`tabId` non-null = session vivante). La barre d'onglets est filtrée par groupe actif ; une **Sidebar** affiche groupes + items avec état, épingle, menus, drag & drop. Un module main `workspaceStore` persiste l'arborescence (groupes + items épinglés) dans `workspace.json` (userData) ; au démarrage les items épinglés sont relancés dans leur dossier.

**Tech Stack:** TypeScript, Electron, React 18, Zustand, node-pty, Vitest. Convention modulaire (canaux dans `src/shared/ipc.ts`, handlers dans modules main, store + composants).

**Branche:** `feat/lot2-sidebar`.

**Note d'exécution :** la Task 3 (refactor du store) casse temporairement le typecheck des composants Lot 1 ; il se résorbe au fil des Tasks 5-10 et revient à 0 erreur en Task 10 (comme le refactor du Lot 1). Les tests unitaires (logique pure + store) restent verts à chaque tâche.

**Convention identifiants :** `itemId` = identifiant stable d'un item (uuid renderer, persistant). `tabId` = identifiant de session vivante (renvoyé par `window.hub.newSession`, utilisé par l'IPC). Un item vivant a `item.tabId != null` ; un item éteint a `item.tabId === null`.

---

## Task 1 : Contrat IPC — types Workspace + canaux Load/Save

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/api.d.ts` (aucun changement nécessaire — `HubApi` déjà global ; vérifier)

- [ ] **Step 1: Ajouter dans `src/shared/ipc.ts`** — canaux (dans l'objet `IPC`, après `SearchTranscript`) :
```ts
  LoadWorkspace: 'workspace:load',
  SaveWorkspace: 'workspace:save',
```
Types partagés (après `TranscriptMatch`) :
```ts
/** Sous-ensemble persistable d'un item (config, sans état runtime de session). */
export interface PersistItem { id: string; name: string; cwd: string }
export interface PersistGroup { id: string; name: string; collapsed: boolean; items: PersistItem[] }
/** Arborescence persistée sur disque (groupes + items épinglés). */
export interface WorkspaceTree { activeGroupId: string | null; groups: PersistGroup[] }
```
Méthodes `HubApi` (après `searchTranscript`) :
```ts
  loadWorkspace(): Promise<WorkspaceTree>
  saveWorkspace(tree: WorkspaceTree): void
```

- [ ] **Step 2: Implémenter dans le preload `src/preload/index.ts`** (après `searchTranscript`) :
```ts
  loadWorkspace: () => ipcRenderer.invoke(IPC.LoadWorkspace),
  saveWorkspace: (tree) => ipcRenderer.send(IPC.SaveWorkspace, tree),
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur.

- [ ] **Step 4: Commit**
```powershell
git add src/shared/ipc.ts src/preload/index.ts
git commit -m "feat(lot2): contrat IPC Workspace (Load/Save + types persistables)"
```

---

## Task 2 : `workspaceStore` (main) — lecture/écriture JSON + handlers

**Files:**
- Create: `src/main/workspaceStore.ts`
- Test: `tests/workspaceStore.test.ts`
- Modify: `src/main/AppContext.ts`
- Modify: `src/main/modules/sessionModule.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/workspaceStore.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { parseWorkspace, defaultWorkspace, serializeWorkspace } from '../src/main/workspaceStore'
import type { WorkspaceTree } from '../src/shared/ipc'

describe('workspaceStore (pur)', () => {
  it('defaultWorkspace : un groupe « Sessions », aucun item', () => {
    const w = defaultWorkspace()
    expect(w.groups).toHaveLength(1)
    expect(w.groups[0].name).toBe('Sessions')
    expect(w.groups[0].items).toEqual([])
    expect(w.activeGroupId).toBe(w.groups[0].id)
  })

  it('parseWorkspace : JSON valide => arbre', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'Messika', collapsed: false, items: [{ id: 'i1', name: 'api', cwd: 'C:/p' }] }] }
    expect(parseWorkspace(JSON.stringify(tree))).toEqual(tree)
  })

  it('parseWorkspace : JSON invalide => défaut', () => {
    const w = parseWorkspace('pas du json')
    expect(w.groups[0].name).toBe('Sessions')
  })

  it('parseWorkspace : structure incomplète => défaut (robustesse)', () => {
    expect(parseWorkspace('{"groups": "oops"}').groups[0].name).toBe('Sessions')
  })

  it('serializeWorkspace : round-trip stable', () => {
    const tree: WorkspaceTree = { activeGroupId: 'g1', groups: [{ id: 'g1', name: 'X', collapsed: true, items: [] }] }
    expect(parseWorkspace(serializeWorkspace(tree))).toEqual(tree)
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- workspaceStore` → FAIL.

- [ ] **Step 3: Implémenter `src/main/workspaceStore.ts`**
```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkspaceTree, PersistGroup, PersistItem } from '../shared/ipc'

function uid(prefix: string): string {
  return prefix + '-' + Math.abs(Date.now() ^ (Math.floor(performance.now() * 1000) || 0)).toString(36)
}

export function defaultWorkspace(): WorkspaceTree {
  const g: PersistGroup = { id: 'g-default', name: 'Sessions', collapsed: false, items: [] }
  return { activeGroupId: g.id, groups: [g] }
}

function normItem(x: unknown): PersistItem | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.cwd !== 'string') return null
  return { id: o.id, name: o.name, cwd: o.cwd }
}

function normGroup(x: unknown): PersistGroup | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const items = Array.isArray(o.items) ? (o.items.map(normItem).filter(Boolean) as PersistItem[]) : []
  return { id: o.id, name: o.name, collapsed: o.collapsed === true, items }
}

/** Parse le contenu JSON ; renvoie l'arbre par défaut si invalide/incomplet. */
export function parseWorkspace(raw: string): WorkspaceTree {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const groups = Array.isArray(o.groups) ? (o.groups.map(normGroup).filter(Boolean) as PersistGroup[]) : []
    if (groups.length === 0) return defaultWorkspace()
    const activeGroupId = typeof o.activeGroupId === 'string' && groups.some((g) => g.id === o.activeGroupId)
      ? o.activeGroupId
      : groups[0].id
    return { activeGroupId, groups }
  } catch {
    return defaultWorkspace()
  }
}

export function serializeWorkspace(tree: WorkspaceTree): string {
  return JSON.stringify(tree, null, 2)
}

const FILE = 'workspace.json'

/** Lit workspace.json dans userDataDir ; défaut si absent/illisible. */
export function loadWorkspace(userDataDir: string): WorkspaceTree {
  try {
    return parseWorkspace(readFileSync(join(userDataDir, FILE), 'utf8'))
  } catch {
    return defaultWorkspace()
  }
}

/** Écrit workspace.json dans userDataDir. */
export function saveWorkspace(userDataDir: string, tree: WorkspaceTree): void {
  try {
    writeFileSync(join(userDataDir, FILE), serializeWorkspace(tree), 'utf8')
  } catch { /* disque indisponible : ignore */ }
}

export { uid }
```
(Le `uid` n'est pas testé ; il sert au défaut. `performance` est dispo en Node 22.)

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- workspaceStore` → PASS.

- [ ] **Step 5: Étendre `AppContext`** — dans `src/main/AppContext.ts`, ajouter à l'interface `AppContext` :
```ts
  /** Dossier userData (pour la persistance du workspace). */
  userDataDir: string
```

- [ ] **Step 6: Handlers dans `src/main/modules/sessionModule.ts`** — ajouter l'import en tête :
```ts
import { loadWorkspace, saveWorkspace } from '../workspaceStore'
import type { WorkspaceTree } from '../../shared/ipc'
```
et dans `register`, après le handler `SearchTranscript` :
```ts
      ctx.ipc.handle(IPC.LoadWorkspace, () => loadWorkspace(ctx.userDataDir))
      ctx.ipc.on(IPC.SaveWorkspace, (_e, tree: WorkspaceTree) => saveWorkspace(ctx.userDataDir, tree))
```

- [ ] **Step 7: Fournir `userDataDir` dans `src/main/index.ts`** — dans la construction de `const ctx: AppContext = { ... }`, ajouter (après `pickFolder: ...`) :
```ts
  ,
  userDataDir: app.getPath('userData')
```

- [ ] **Step 8: Typecheck + tests.**
Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur
Run: `npm test` → tous verts

- [ ] **Step 9: Commit**
```powershell
git add src/main/workspaceStore.ts tests/workspaceStore.test.ts src/main/AppContext.ts src/main/modules/sessionModule.ts src/main/index.ts
git commit -m "feat(lot2): workspaceStore (persistance JSON) + handlers Load/Save"
```

---

## Task 3 : Refactor du store Zustand (groupes / items) — TDD

**Files:**
- Modify: `src/renderer/src/store.ts`
- Modify: `tests/store.test.ts`

**Note :** après cette tâche, `npm test -- store` passe, mais `npx tsc` global signale des erreurs dans les composants (encore en API `tabs[]`) — c'est attendu (résorbé Tasks 5-10).

- [ ] **Step 1: Réécrire `tests/store.test.ts`**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHub } from '../src/renderer/src/store'
import type { Item } from '../src/renderer/src/store'

const mkItem = (id: string, over: Partial<Item> = {}): Item => ({
  id, name: id, cwd: 'C:/' + id, pinned: false, tabId: 't-' + id,
  state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: '', ...over
})

describe('store groupes/items', () => {
  beforeEach(() => useHub.getState().reset())

  it('addGroup ajoute et active le groupe', () => {
    const id = useHub.getState().addGroup('Messika')
    expect(useHub.getState().groups.map((g) => g.name)).toContain('Messika')
    expect(useHub.getState().activeGroupId).toBe(id)
  })

  it('addItem range dans le groupe et l\'active', () => {
    const g = useHub.getState().addGroup('Messika')
    useHub.getState().addItem(g, mkItem('i1'))
    expect(useHub.getState().groups.find((x) => x.id === g)!.items).toHaveLength(1)
    expect(useHub.getState().activeItemId).toBe('i1')
  })

  it('removeItem retire l\'item', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1'))
    useHub.getState().removeItem('i1')
    expect(useHub.getState().groups.find((x) => x.id === g)!.items).toHaveLength(0)
  })

  it('togglePin bascule l\'épingle', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1'))
    useHub.getState().togglePin('i1')
    expect(useHub.getState().itemById('i1')!.pinned).toBe(true)
  })

  it('clearSession éteint l\'item (tabId null), removeItem si non épinglé via closeSession', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1', { pinned: true }))
    useHub.getState().clearSession('i1')
    expect(useHub.getState().itemById('i1')!.tabId).toBeNull()
    expect(useHub.getState().itemById('i1')!.agents).toEqual([])
  })

  it('closeSession : non épinglé => supprime ; épinglé => éteint', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('eph', { pinned: false }))
    useHub.getState().addItem(g, mkItem('pin', { pinned: true }))
    useHub.getState().closeSession('eph')
    useHub.getState().closeSession('pin')
    expect(useHub.getState().itemById('eph')).toBeUndefined()
    expect(useHub.getState().itemById('pin')!.tabId).toBeNull()
  })

  it('événements par tabId : setItemState/addAgent ciblent le bon item', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('i1'))
    useHub.getState().setItemState('t-i1', 'waiting')
    useHub.getState().addAgent('t-i1', { id: 'a1', type: 'x', desc: '', lines: [], done: false })
    expect(useHub.getState().itemById('i1')!.state).toBe('waiting')
    expect(useHub.getState().itemById('i1')!.agents).toHaveLength(1)
  })

  it('moveItem réordonne dans le groupe', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().addItem(g, mkItem('b'))
    useHub.getState().moveItem('b', 0)
    expect(useHub.getState().groups.find((x) => x.id === g)!.items.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('toPersistable : ne garde que groupes + items épinglés (config seule)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('pin', { pinned: true, name: 'api', cwd: 'C:/api' }))
    useHub.getState().addItem(g, mkItem('eph', { pinned: false }))
    const tree = useHub.getState().toPersistable()
    expect(tree.groups[0].items).toEqual([{ id: 'pin', name: 'api', cwd: 'C:/api' }])
  })

  it('loadWorkspace recrée les groupes/items (éteints)', () => {
    useHub.getState().loadWorkspace({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'M', collapsed: false, items: [{ id: 'i1', name: 'api', cwd: 'C:/api' }] }] })
    expect(useHub.getState().groups).toHaveLength(1)
    const it = useHub.getState().itemById('i1')!
    expect(it.pinned).toBe(true)
    expect(it.tabId).toBeNull()
  })

  it('setSoundEnabled / setConsoleWidth conservés', () => {
    useHub.getState().setSoundEnabled(false)
    useHub.getState().setConsoleWidth(420)
    expect(useHub.getState().soundEnabled).toBe(false)
    expect(useHub.getState().consoleWidth).toBe(420)
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- store` → FAIL.

- [ ] **Step 3: Réécrire `src/renderer/src/store.ts`**
```ts
import { create } from 'zustand'
import type { ConsoleLine, SessionState, WorkspaceTree } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
  done: boolean
}

export interface Item {
  id: string
  name: string
  cwd: string
  pinned: boolean
  tabId: string | null
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  railCollapsed: boolean
  searchOpen: boolean
  searchQuery: string
}

export interface Group {
  id: string
  name: string
  collapsed: boolean
  items: Item[]
}

interface HubState {
  groups: Group[]
  activeGroupId: string | null
  activeItemId: string | null
  soundEnabled: boolean
  consoleWidth: number

  // lecture
  itemById: (itemId: string) => Item | undefined
  itemByTab: (tabId: string) => Item | undefined

  // groupes
  addGroup: (name: string) => string
  renameGroup: (groupId: string, name: string) => void
  removeGroup: (groupId: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  setActiveGroup: (groupId: string) => void

  // items (structure)
  addItem: (groupId: string, item: Item) => void
  removeItem: (itemId: string) => void
  renameItem: (itemId: string, name: string) => void
  togglePin: (itemId: string) => void
  setActiveItem: (itemId: string) => void
  moveItem: (itemId: string, toIndex: number, toGroupId?: string) => void

  // cycle de session
  bindSession: (itemId: string, tabId: string) => void
  clearSession: (itemId: string) => void
  closeSession: (itemId: string) => void // non épinglé => removeItem ; épinglé => clearSession

  // état runtime (par tabId)
  setItemState: (tabId: string, state: SessionState) => void
  addAgent: (tabId: string, agent: AgentView) => void
  appendLines: (tabId: string, agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (tabId: string, agentId: string) => void
  setAgentDone: (tabId: string, agentId: string) => void
  openAgent: (itemId: string, agentId: string | null) => void
  toggleRail: (itemId: string) => void
  setSearch: (itemId: string, open: boolean) => void
  toggleSearch: (itemId: string) => void
  setSearchQuery: (itemId: string, query: string) => void

  // global
  setSoundEnabled: (v: boolean) => void
  setConsoleWidth: (w: number) => void
  toPersistable: () => WorkspaceTree
  loadWorkspace: (tree: WorkspaceTree) => void
  reset: () => void
}

let counter = 0
function uid(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

const initial = {
  groups: [] as Group[],
  activeGroupId: null as string | null,
  activeItemId: null as string | null,
  soundEnabled: true,
  consoleWidth: 380
}

/** Map immuable sur l'item identifié par prédicat. */
function mapItems(groups: Group[], match: (i: Item) => boolean, fn: (i: Item) => Item): Group[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => (match(i) ? fn(i) : i)) }))
}

export const useHub = create<HubState>((set, get) => ({
  ...initial,

  itemById: (itemId) => get().groups.flatMap((g) => g.items).find((i) => i.id === itemId),
  itemByTab: (tabId) => get().groups.flatMap((g) => g.items).find((i) => i.tabId === tabId),

  addGroup: (name) => {
    const id = uid('g')
    set((s) => ({ groups: [...s.groups, { id, name, collapsed: false, items: [] }], activeGroupId: id }))
    return id
  },
  renameGroup: (groupId, name) =>
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) })),
  removeGroup: (groupId) =>
    set((s) => {
      const groups = s.groups.filter((g) => g.id !== groupId)
      const activeGroupId = s.activeGroupId === groupId ? (groups[groups.length - 1]?.id ?? null) : s.activeGroupId
      return { groups, activeGroupId }
    }),
  toggleGroupCollapsed: (groupId) =>
    set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)) })),
  setActiveGroup: (activeGroupId) => set({ activeGroupId }),

  addItem: (groupId, item) =>
    set((s) => ({
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, items: [...g.items, item] } : g)),
      activeGroupId: groupId,
      activeItemId: item.id
    })),
  removeItem: (itemId) =>
    set((s) => {
      const groups = s.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) }))
      const activeItemId = s.activeItemId === itemId ? null : s.activeItemId
      return { groups, activeItemId }
    }),
  renameItem: (itemId, name) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, name })) })),
  togglePin: (itemId) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, pinned: !i.pinned })) })),
  setActiveItem: (itemId) =>
    set((s) => {
      const g = s.groups.find((grp) => grp.items.some((i) => i.id === itemId))
      return { activeItemId: itemId, activeGroupId: g ? g.id : s.activeGroupId }
    }),
  moveItem: (itemId, toIndex, toGroupId) =>
    set((s) => {
      let moved: Item | undefined
      const stripped = s.groups.map((g) => {
        const found = g.items.find((i) => i.id === itemId)
        if (found) moved = found
        return { ...g, items: g.items.filter((i) => i.id !== itemId) }
      })
      if (!moved) return s
      const targetId = toGroupId ?? s.groups.find((g) => g.items.some((i) => i.id === itemId))!.id
      const groups = stripped.map((g) => {
        if (g.id !== targetId) return g
        const items = [...g.items]
        items.splice(Math.max(0, Math.min(toIndex, items.length)), 0, moved as Item)
        return { ...g, items }
      })
      return { groups }
    }),

  bindSession: (itemId, tabId) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, tabId, state: 'starting' })) })),
  clearSession: (itemId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({
        ...i, tabId: null, state: 'done', agents: [], openAgentId: null, searchOpen: false
      }))
    })),
  closeSession: (itemId) => {
    const item = get().itemById(itemId)
    if (!item) return
    if (item.pinned) get().clearSession(itemId)
    else get().removeItem(itemId)
  },

  setItemState: (tabId, state) => set((s) => ({ groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({ ...i, state })) })),
  addAgent: (tabId, agent) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) =>
        i.agents.some((a) => a.id === agent.id) ? i : { ...i, agents: [...i.agents, agent] })
    })),
  appendLines: (tabId, agentId, lines) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({
        ...i, agents: i.agents.map((a) => (a.id === agentId ? { ...a, lines: [...a.lines, ...lines] } : a))
      }))
    })),
  removeAgent: (tabId, agentId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({
        ...i, agents: i.agents.filter((a) => a.id !== agentId), openAgentId: i.openAgentId === agentId ? null : i.openAgentId
      }))
    })),
  setAgentDone: (tabId, agentId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => ({
        ...i, agents: i.agents.map((a) => (a.id === agentId ? { ...a, done: true } : a))
      }))
    })),
  openAgent: (itemId, agentId) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, openAgentId: agentId, searchOpen: agentId ? false : i.searchOpen })) })),
  toggleRail: (itemId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.id === itemId, (i) => {
        const railCollapsed = !i.railCollapsed
        return { ...i, railCollapsed, openAgentId: railCollapsed ? null : i.openAgentId }
      })
    })),
  setSearch: (itemId, open) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, searchOpen: open, openAgentId: open ? null : i.openAgentId })) })),
  toggleSearch: (itemId) =>
    set((s) => ({
      groups: mapItems(s.groups, (i) => i.id === itemId, (i) => {
        const searchOpen = !i.searchOpen
        return { ...i, searchOpen, openAgentId: searchOpen ? null : i.openAgentId }
      })
    })),
  setSearchQuery: (itemId, searchQuery) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, searchQuery })) })),

  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setConsoleWidth: (consoleWidth) => set({ consoleWidth }),

  toPersistable: () => {
    const s = get()
    return {
      activeGroupId: s.activeGroupId,
      groups: s.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed,
        items: g.items.filter((i) => i.pinned).map((i) => ({ id: i.id, name: i.name, cwd: i.cwd }))
      }))
    }
  },
  loadWorkspace: (tree) =>
    set({
      activeGroupId: tree.activeGroupId,
      activeItemId: null,
      groups: tree.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed,
        items: g.items.map((i) => ({
          id: i.id, name: i.name, cwd: i.cwd, pinned: true, tabId: null,
          state: 'done', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: ''
        }))
      }))
    }),
  reset: () => set({ ...initial })
}))
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- store` → PASS. (Le `npm test` complet reste vert ; `npx tsc` global est rouge sur les composants — attendu.)

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(lot2): store refactor groupes/items (+ epingle, persistance, par tabId/itemId) + tests"
```

---

## Task 4 : Icônes SVG (terminal + épingle)

**Files:**
- Create: `src/renderer/src/components/icons.tsx`

- [ ] **Step 1: Créer `src/renderer/src/components/icons.tsx`**
```tsx
import React from 'react'

/** Icône terminal pleine (d'après Font Awesome « terminal » solid). */
export function TerminalIcon({ size = 12 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 576 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M9.4 86.6C-3.1 74.1-3.1 53.9 9.4 41.4s32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L178.7 256 9.4 86.6zM256 416l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z" />
    </svg>
  )
}

/** Icône épingle contour (d'après Font Awesome « map-pin »/« location-pin », trait). */
export function PinIcon({ size = 12 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 384 512" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="36" aria-hidden="true">
      <path d="M192 36c-83 0-150 67-150 150 0 96 150 290 150 290S342 282 342 186c0-83-67-150-150-150z" />
      <circle cx="192" cy="186" r="56" />
    </svg>
  )
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: pas de NOUVELLE erreur référençant `icons.tsx` (les erreurs `tabs[]` restantes sont attendues).

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/icons.tsx
git commit -m "feat(lot2): icones SVG inline (terminal + epingle)"
```

---

## Task 5 : Adapter `Console`, `Rail`, `SearchPanel` (par item)

**Files:**
- Modify: `src/renderer/src/components/Console.tsx`
- Modify: `src/renderer/src/components/Rail.tsx`
- Modify: `src/renderer/src/components/SearchPanel.tsx`

Ces composants reçoivent désormais `itemId` (id stable) ; ils lisent l'item via `itemById` et utilisent `item.tabId` là où l'IPC l'exige.

- [ ] **Step 1: Réécrire `src/renderer/src/components/Console.tsx`**
```tsx
import React, { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console({ itemId }: { itemId: string }): React.JSX.Element | null {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const close = useHub((s) => s.openAgent)
  const bodyRef = useRef<HTMLDivElement>(null)
  const agent = item?.agents.find((a) => a.id === item.openAgentId) ?? null

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!item || !agent) return null

  return (
    <div className="console">
      <div className="console-header">
        <span>▸ {agent.type} — {agent.desc.slice(0, 50)}</span>
        <span className="cclose" title="Fermer la console" onClick={() => close(itemId, null)}>✕</span>
      </div>
      <div className="console-body" ref={bodyRef}>
        {agent.lines.map((l, i) => (
          <div className={`cline ${l.kind}`} key={i}>{icon(l.kind)} {l.text}</div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Réécrire `src/renderer/src/components/Rail.tsx`**
```tsx
import React from 'react'
import { useHub } from '../store'

export function Rail({ itemId }: { itemId: string }): React.JSX.Element | null {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)
  if (!item) return null

  return (
    <div className="rail">
      {item.agents.map((a) => (
        <div
          key={a.id}
          className={`agent${a.id === item.openAgentId ? ' sel' : ''}${a.done ? ' done' : ''}`}
          onClick={() => open(itemId, a.id === item.openAgentId ? null : a.id)}
        >
          <span className="aclose" title="Retirer" onClick={(e) => { e.stopPropagation(); if (item.tabId) remove(item.tabId, a.id) }}>✕</span>
          <div className="type">{a.done ? '✓' : '▸'} {a.type}</div>
          <div className="desc">{a.desc.slice(0, 60)}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Réécrire `src/renderer/src/components/SearchPanel.tsx`**
```tsx
import React, { useEffect, useRef, useState } from 'react'
import { useHub } from '../store'
import type { TranscriptMatch } from '../../../shared/ipc'

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text
  const ql = q.toLowerCase()
  const tl = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  for (;;) {
    const at = tl.indexOf(ql, i)
    if (at === -1) { parts.push(text.slice(i)); break }
    if (at > i) parts.push(text.slice(i, at))
    parts.push(<mark key={key++}>{text.slice(at, at + q.length)}</mark>)
    i = at + q.length
  }
  return parts
}

export function SearchPanel({ itemId }: { itemId: string }): React.JSX.Element {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const setSearch = useHub((s) => s.setSearch)
  const setSearchQuery = useHub((s) => s.setSearchQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [query, setQuery] = useState(() => item?.searchQuery ?? '')
  const [matches, setMatches] = useState<TranscriptMatch[]>([])
  const tabId = item?.tabId ?? null

  function fetchMatches(q: string): void {
    if (!q.trim() || !tabId) { setMatches([]); return }
    window.hub.searchTranscript(tabId, q).then(setMatches).catch(() => setMatches([]))
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const init = (item?.searchQuery ?? '').trim()
    if (init) fetchMatches(init)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function runSearch(q: string): void {
    setQuery(q)
    setSearchQuery(itemId, q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setMatches([]); return }
    debounceRef.current = setTimeout(() => fetchMatches(q), 180)
  }

  const q = query.trim()
  const totalOcc = matches.reduce((n, m) => n + m.count, 0)

  return (
    <div className="search-panel">
      <div className="search-header">
        <input
          ref={inputRef}
          value={query}
          placeholder="Rechercher dans la conversation…"
          onChange={(e) => runSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setSearch(itemId, false) } }}
        />
        <button className="search-close" title="Fermer (Échap)" onClick={() => setSearch(itemId, false)}>✕</button>
      </div>
      {q && (
        <div className="search-summary">
          {matches.length === 0
            ? 'Aucun résultat'
            : `${totalOcc} occurrence${totalOcc > 1 ? 's' : ''} · ${matches.length} message${matches.length > 1 ? 's' : ''}`}
        </div>
      )}
      <div className="search-results">
        {q && matches.map((m, i) => (
          <div className="search-msg" key={i}>
            <div className={`search-role ${m.role}`}>{m.role === 'user' ? 'toi' : 'Claude'}{m.count > 1 ? ` · ${m.count}×` : ''}</div>
            <div className="search-text">{highlight(m.text, q)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: erreurs restantes uniquement dans `Workspace.tsx`, `TabBar.tsx`, `App.tsx` (pas dans Console/Rail/SearchPanel).

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/src/components/Console.tsx src/renderer/src/components/Rail.tsx src/renderer/src/components/SearchPanel.tsx
git commit -m "feat(lot2): Console/Rail/SearchPanel indexes par itemId"
```

---

## Task 6 : Composant `Sidebar`

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: Créer `src/renderer/src/components/Sidebar.tsx`**
```tsx
import React, { useState } from 'react'
import { useHub, type Item } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, PinIcon } from './icons'
import { basename } from '../util'

/** Ouvre une session pour un item éteint (ou en crée une si besoin) et la lie. */
async function launch(item: Item): Promise<void> {
  const tabId = await window.hub.newSession(item.cwd)
  useHub.getState().bindSession(item.id, tabId)
}

function activeAgents(item: Item): number {
  return item.agents.filter((a) => !a.done).length
}

export function Sidebar(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeItemId = useHub((s) => s.activeItemId)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const [menu, setMenu] = useState<string | null>(null) // id (item/groupe) dont le menu ··· est ouvert

  async function onItemClick(item: Item): Promise<void> {
    useHub.getState().setActiveItem(item.id)
    if (!item.tabId) await launch(item) // item éteint => relance
  }

  async function addItemTo(groupId: string): Promise<void> {
    const cwd = await window.hub.pickFolder()
    if (!cwd) return
    const id = crypto.randomUUID()
    const tabId = await window.hub.newSession(cwd)
    const item: Item = {
      id, name: basename(cwd), cwd, pinned: false, tabId,
      state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: ''
    }
    useHub.getState().addItem(groupId, item)
  }

  function rename(kind: 'group' | 'item', id: string, current: string): void {
    const name = window.prompt('Renommer :', current)
    setMenu(null)
    if (name && name.trim()) {
      if (kind === 'group') useHub.getState().renameGroup(id, name.trim())
      else useHub.getState().renameItem(id, name.trim())
    }
  }

  function removeItem(item: Item): void {
    setMenu(null)
    const busy = item.tabId && (item.state === 'active' || item.state === 'starting' || activeAgents(item) > 0)
    if (busy && !window.confirm(`Supprimer « ${item.name} » ? Une session est active.`)) return
    if (item.tabId) window.hub.killSession(item.tabId)
    useHub.getState().removeItem(item.id)
  }

  function removeGroup(groupId: string, name: string): void {
    setMenu(null)
    if (!window.confirm(`Supprimer le groupe « ${name} » et ses sessions ?`)) return
    const g = useHub.getState().groups.find((x) => x.id === groupId)
    g?.items.forEach((i) => { if (i.tabId) window.hub.killSession(i.tabId) })
    useHub.getState().removeGroup(groupId)
  }

  return (
    <div id="sidebar">
      <div className="sidebar-brand">DIFAI-IDE</div>
      <div className="sidebar-scroll">
        {groups.map((g) => (
          <div key={g.id} className={`group${g.id === activeGroupId ? ' active-group' : ''}`}>
            <div className="group-head">
              <span className="group-chevron" onClick={() => useHub.getState().toggleGroupCollapsed(g.id)}>{g.collapsed ? '▸' : '▾'}</span>
              <span className="group-name" onClick={() => useHub.getState().setActiveGroup(g.id)}>{g.name}</span>
              <span className="group-actions">
                <span className="ic-btn" title="Ajouter un Claude" onClick={() => addItemTo(g.id)}>＋</span>
                <span className="ic-btn" title="Menu" onClick={() => setMenu(menu === g.id ? null : g.id)}>···</span>
              </span>
              {menu === g.id && (
                <div className="ctx-menu">
                  <div onClick={() => rename('group', g.id, g.name)}>✎ Renommer</div>
                  <div onClick={() => removeGroup(g.id, g.name)}>🗑 Supprimer</div>
                </div>
              )}
            </div>
            {!g.collapsed && g.items.map((it) => (
              <div
                key={it.id}
                className={`item${it.id === activeItemId ? ' active-item' : g.id === activeGroupId ? ' active-group-item' : ''}`}
                onClick={() => onItemClick(it)}
              >
                <span className="item-ic"><TerminalIcon /></span>
                <span className="item-name">{it.name}</span>
                {it.tabId ? <StateDot state={it.state} /> : <span className="off">○</span>}
                <span className="item-actions">
                  {it.pinned && <span className="pin on" title="Épinglé"><PinIcon /></span>}
                  <span className="ic-btn" title="Menu" onClick={(e) => { e.stopPropagation(); setMenu(menu === it.id ? null : it.id) }}>···</span>
                </span>
                {menu === it.id && (
                  <div className="ctx-menu">
                    <div onClick={(e) => { e.stopPropagation(); rename('item', it.id, it.name) }}>✎ Renommer</div>
                    <div onClick={(e) => { e.stopPropagation(); useHub.getState().togglePin(it.id); setMenu(null) }}>📌 {it.pinned ? 'Désépingler' : 'Épingler'}</div>
                    <div onClick={(e) => { e.stopPropagation(); removeItem(it) }}>🗑 Supprimer</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        <div className="new-group" onClick={() => { const n = window.prompt('Nom du groupe :'); if (n && n.trim()) useHub.getState().addGroup(n.trim()) }}>＋ Nouveau groupe</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: pas de nouvelle erreur dans `Sidebar.tsx` (erreurs restantes : Workspace/TabBar/App).

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(lot2): composant Sidebar (groupes, items, epingle, menus, relance item eteint)"
```

---

## Task 7 : Adapter `Workspace` (items du groupe actif)

**Files:**
- Modify: `src/renderer/src/components/Workspace.tsx`

- [ ] **Step 1: Réécrire `src/renderer/src/components/Workspace.tsx`**
```tsx
import React from 'react'
import { useHub } from '../store'
import { clampConsoleWidth, writeConsoleWidth } from '../util'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { Rail } from './Rail'
import { SearchPanel } from './SearchPanel'

export function Workspace(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const activeItemId = useHub((s) => s.activeItemId)
  const toggleRail = useHub((s) => s.toggleRail)
  const consoleWidth = useHub((s) => s.consoleWidth)
  const setConsoleWidth = useHub((s) => s.setConsoleWidth)

  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startW = consoleWidth
    const move = (ev: MouseEvent): void => setConsoleWidth(clampConsoleWidth(startW - (ev.clientX - startX)))
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      writeConsoleWidth(useHub.getState().consoleWidth)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  // Onglets = items VIVANTS du groupe actif.
  const activeGroup = groups.find((g) => g.id === activeGroupId)
  const liveItems = (activeGroup?.items ?? []).filter((i) => i.tabId)

  return (
    <div id="workspace">
      {liveItems.map((it) => (
        <div key={it.id} className="tabpane" style={{ display: it.id === activeItemId ? 'block' : 'none' }}>
          <div className="term-wrap">
            <div className="term-area">
              <button className="rails-toggle" onClick={() => toggleRail(it.id)}>
                {it.railCollapsed ? '› Rails' : '‹ Rails'}
              </button>
              <Terminal tabId={it.tabId as string} />
            </div>
            {(it.searchOpen || it.openAgentId) && (
              <>
                <div className="splitter" title="Redimensionner le panneau" onMouseDown={startResize} />
                <div className="console-host" style={{ width: consoleWidth }}>
                  {it.searchOpen ? <SearchPanel itemId={it.id} /> : <Console itemId={it.id} />}
                </div>
              </>
            )}
            {!it.railCollapsed && <Rail itemId={it.id} />}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: erreurs restantes : `TabBar.tsx`, `App.tsx`. (`Terminal.tsx` inchangé — reçoit `tabId`.)

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/Workspace.tsx
git commit -m "feat(lot2): Workspace affiche les items vivants du groupe actif"
```

---

## Task 8 : Adapter `TabBar` (groupe actif + drag & drop)

**Files:**
- Modify: `src/renderer/src/components/TabBar.tsx`

- [ ] **Step 1: Réécrire `src/renderer/src/components/TabBar.tsx`**
```tsx
import React, { useState } from 'react'
import { useHub, type Item } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon } from './icons'
import { basename } from '../util'

export function TabBar(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const activeItemId = useHub((s) => s.activeItemId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const group = groups.find((g) => g.id === activeGroupId)
  const liveItems = (group?.items ?? []).filter((i) => i.tabId)

  async function openTab(cwd: string): Promise<void> {
    setMenuOpen(false)
    const gid = useHub.getState().activeGroupId ?? useHub.getState().addGroup('Sessions')
    const tabId = await window.hub.newSession(cwd)
    const item: Item = {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId,
      state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: ''
    }
    useHub.getState().addItem(gid, item)
  }
  async function onDefault(): Promise<void> { openTab(await window.hub.defaultCwd()) }
  async function onPick(): Promise<void> { const f = await window.hub.pickFolder(); if (f) openTab(f) ; else setMenuOpen(false) }

  function close(e: React.MouseEvent, it: Item): void {
    e.stopPropagation()
    if (it.tabId) window.hub.killSession(it.tabId)
    useHub.getState().closeSession(it.id) // non épinglé => supprime ; épinglé => éteint
  }

  function onDrop(targetId: string): void {
    if (!dragId || dragId === targetId || !group) return
    const idx = group.items.findIndex((i) => i.id === targetId)
    useHub.getState().moveItem(dragId, idx, group.id)
    setDragId(null)
  }

  return (
    <div className="tabbar">
      {liveItems.map((it) => (
        <div
          key={it.id}
          className={`tab${it.id === activeItemId ? ' act' : ''}`}
          draggable
          onDragStart={() => setDragId(it.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(it.id)}
          onClick={() => useHub.getState().setActiveItem(it.id)}
        >
          <span className="tab-ic"><TerminalIcon /></span>
          <StateDot state={it.state} />
          <span className="tab-title">{it.name}</span>
          <span className="tab-agents">· {it.agents.filter((a) => !a.done).length} agents</span>
          <span className="tab-close" title="Fermer l'onglet" onClick={(e) => close(e, it)}>✕</span>
        </div>
      ))}
      <div className="tab-new">
        <button title="Nouvel onglet" onClick={() => setMenuOpen((o) => !o)}>＋</button>
        {menuOpen && (
          <div className="tab-new-menu">
            <div onClick={onDefault}>📂 Dossier par défaut</div>
            <div onClick={onPick}>🗂 Choisir un dossier…</div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: erreurs restantes : `App.tsx` uniquement.

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/TabBar.tsx
git commit -m "feat(lot2): TabBar = items vivants du groupe actif + drag & drop (moveItem)"
```

---

## Task 9 : `App` — layout sidebar, boot (load + relance), câblage, persistance

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Réécrire `src/renderer/src/App.tsx`**
```tsx
import React, { useEffect } from 'react'
import { useHub, type Item } from './store'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { Workspace } from './components/Workspace'
import { basename, readConsoleWidth } from './util'
import { soundForTransition, playSound, readSoundEnabled } from './sound'
import type { Unsub } from '../../shared/ipc'

function makeItem(id: string, cwd: string, tabId: string, pinned: boolean): Item {
  return { id, name: basename(cwd), cwd, pinned, tabId, state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false, searchQuery: '' }
}

export function App(): React.JSX.Element {
  // Ctrl/Cmd+F : bascule la recherche de l'item actif (raccourci global, capture).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        const { activeItemId, toggleSearch } = useHub.getState()
        if (activeItemId) { e.preventDefault(); e.stopPropagation(); toggleSearch(activeItemId) }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // Câblage IPC (routé par tabId -> item) + son sur transition d'état.
  useEffect(() => {
    useHub.getState().setSoundEnabled(readSoundEnabled())
    useHub.getState().setConsoleWidth(readConsoleWidth())

    const unsubs: Unsub[] = []
    unsubs.push(window.hub.onSessionState((tid, state) => {
      const prev = useHub.getState().itemByTab(tid)?.state
      useHub.getState().setItemState(tid, state)
      if (prev) {
        const snd = soundForTransition(prev, state)
        if (snd && useHub.getState().soundEnabled) playSound(snd)
      }
    }))
    unsubs.push(window.hub.onAgentAdded((tid, agentId, type, desc) =>
      useHub.getState().addAgent(tid, { id: agentId, type, desc, lines: [], done: false })))
    unsubs.push(window.hub.onAgentLines((tid, agentId, lines) => useHub.getState().appendLines(tid, agentId, lines)))
    unsubs.push(window.hub.onAgentDone((tid, agentId) => useHub.getState().setAgentDone(tid, agentId)))
    unsubs.push(window.hub.onExit((tid) => {
      const it = useHub.getState().itemByTab(tid)
      if (it) useHub.getState().clearSession(it.id) // session morte => item éteint (s'il est encore là)
    }))
    return () => unsubs.forEach((u) => u())
  }, [])

  // Boot : charger l'arborescence, relancer les items épinglés dans leurs dossiers.
  useEffect(() => {
    let active = true
    window.hub.loadWorkspace().then(async (tree) => {
      if (!active) return
      useHub.getState().loadWorkspace(tree)
      const hasItem = tree.groups.some((g) => g.items.length > 0)
      if (!hasItem) {
        // 1er lancement (ou aucun item épinglé) : un item non épinglé dans le cwd par défaut.
        const cwd = await window.hub.defaultCwd()
        const gid = useHub.getState().activeGroupId ?? useHub.getState().addGroup('Sessions')
        const tabId = await window.hub.newSession(cwd)
        useHub.getState().addItem(gid, makeItem(crypto.randomUUID(), cwd, tabId, false))
        return
      }
      // relance chaque item épinglé dans son dossier (sans message)
      for (const g of tree.groups) {
        for (const i of g.items) {
          const tabId = await window.hub.newSession(i.cwd)
          if (!active) return
          useHub.getState().bindSession(i.id, tabId)
        }
      }
    })
    return () => { active = false }
  }, [])

  // Persistance debouncée : sauve l'arbre (groupes + items épinglés) à chaque changement structurel.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const unsub = useHub.subscribe(() => {
      if (t) clearTimeout(t)
      t = setTimeout(() => window.hub.saveWorkspace(useHub.getState().toPersistable()), 300)
    })
    return () => { if (t) clearTimeout(t); unsub() }
  }, [])

  return (
    <div id="app-root">
      <Header />
      <div id="body">
        <Sidebar />
        <div id="main">
          <TabBar />
          <Workspace />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + tests.**
Run: `npx tsc -p tsconfig.json --noEmit` → **0 erreur**
Run: `npm test` → tous verts

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/App.tsx
git commit -m "feat(lot2): App layout sidebar + boot (load+relance items epingles) + persistance debouncee"
```

---

## Task 10 : CSS — sidebar, dégradé, layout, menus

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Adapter le layout et ajouter les styles sidebar.** Dans le `<style>` de `src/renderer/index.html` :

Remplacer la règle `#app-root { display: flex; flex-direction: column; height: 100%; }` par :
```css
      #app-root { display: flex; flex-direction: column; height: 100%; }
      #body { flex: 1; min-height: 0; display: flex; }
      #main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
```
Puis ajouter (avant la règle `#workspace`) le bloc sidebar :
```css
      #sidebar { width: 230px; min-width: 230px; background: #161616; border-right: 1px solid #333; display: flex; flex-direction: column; }
      .sidebar-brand { padding: 8px 10px; font-weight: bold; color: #7fd; border-bottom: 1px solid #333; }
      .sidebar-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 8px; }
      .group-head { position: relative; display: flex; align-items: center; gap: 4px; padding: 6px 8px; color: #9aa; font-size: 12px; }
      .group.active-group > .group-head { color: #cfe; background: #202020; }
      .group-chevron { cursor: pointer; width: 12px; }
      .group-name { flex: 1; cursor: pointer; }
      .group-actions { display: flex; gap: 6px; opacity: 0; }
      .group-head:hover .group-actions { opacity: 1; }
      .ic-btn { cursor: pointer; color: #888; user-select: none; }
      .ic-btn:hover { color: #fff; }
      .item { position: relative; display: flex; align-items: center; gap: 6px; padding: 4px 8px 4px 22px; font-size: 12px; cursor: pointer; color: #ccc; }
      .item .item-ic { color: #9bd; display: inline-flex; }
      .item .item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .item .off { color: #666; }
      .item .item-actions { display: flex; align-items: center; gap: 5px; }
      .item .pin { color: #c80; display: inline-flex; }
      .item .item-actions .ic-btn { opacity: 0; }
      .item:hover .item-actions .ic-btn { opacity: 1; }
      .item:hover { background: #202020; }
      .item.active-group-item { background: #1d1d1d; }
      .item.active-group-item:hover { background: #232323; }
      .item.active-item { background: #2a2a2a; border-left: 3px solid #c80; padding-left: 19px; }
      .new-group { padding: 8px; color: #9c9; cursor: pointer; border-top: 1px solid #2a2a2a; margin-top: 6px; }
      .new-group:hover { color: #cfc; }
      .ctx-menu { position: absolute; top: 24px; right: 6px; z-index: 20; background: #202227; border: 1px solid #3a3d44; border-radius: 6px; overflow: hidden; min-width: 150px; }
      .ctx-menu div { padding: 6px 10px; cursor: pointer; font-size: 12px; }
      .ctx-menu div:hover { background: #2a2d33; }
      .tab-ic { color: #9bd; display: inline-flex; }
```

- [ ] **Step 2: Vérifier le build.** Run: `npm run build` → OK (rendu validé au checkpoint).

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/index.html
git commit -m "feat(lot2): CSS sidebar (groupes/items, degrade 3 niveaux, menus contextuels)"
```

---

## Task 11 : Checkpoint humain — sidebar en conditions réelles

- [ ] **Step 1: Build + lancement.** Run: `npm run build` puis `npm run dev`

Expected (**Daniel valide**) :
- Sidebar à gauche (en-tête DIFAI-IDE) ; au 1er lancement, un groupe « Sessions » + 1 item, son onglet ouvert.
- **＋ barre** → item dans le groupe actif (dossier défaut/choisi) ; **＋ groupe** → item dans ce groupe ; **＋ Nouveau groupe**.
- **Clic groupe** → groupe actif, la barre affiche ses onglets ; **clic item** → bascule/active ; item éteint (○) relancé au clic.
- **Dégradé** : items du groupe actif plus clairs ; item actif le plus clair + bordure orange.
- **Pastille d'état** par item dans la sidebar ; icône **terminal** ; **épingle** affichée si épinglé.
- Menu **···** item (Renommer / Épingler / Supprimer) et groupe (Renommer / Supprimer) ; **confirmation** si session active.
- **✕ onglet** : non épinglé → supprime l'item ; épinglé → l'item reste éteint (○).
- **Drag & drop** d'un onglet → réordonne, et la sidebar suit.
- **Persistance** : épingler des items, fermer l'app, rouvrir → groupes + items épinglés réapparaissent et **claude est relancé dans leurs dossiers** (sans message).
- Recherche Ctrl+F, sons, états, rail/console : toujours fonctionnels (par item).

- [ ] **Step 2: Ajustements éventuels selon retour, puis commit**
```powershell
git add -A
git commit -m "chore(lot2): sidebar validee (checkpoint)"
```

---

## Self-review (avant clôture Lot 2)

- **Couverture spec :** persistance JSON (T2) ✓ ; modèle item/épingle + cycle (T3, store) ✓ ; icônes (T4) ✓ ; composants par item (T5) ✓ ; Sidebar groupes/items/menus/épingle/relance (T6) ✓ ; barre filtrée par groupe actif (T7/T8) ✓ ; ＋ contextuel (T6/T8) ✓ ; clic groupe/item (T6) ✓ ; ✕ = closeSession (T8) ✓ ; drag & drop (T8) ✓ ; dégradé (T10) ✓ ; boot load+relance + persistance debouncée (T9) ✓ ; confirmation si actif (T6) ✓ ; 1er lancement défaut (T9) ✓.
- **Placeholders :** aucun — code complet partout.
- **Cohérence des types :** `Item`/`Group` définis store (T3) et consommés par tous les composants ; actions structure par `itemId`/`groupId`, état runtime par `tabId` ; `WorkspaceTree`/`PersistGroup`/`PersistItem` partagés (`src/shared/ipc.ts`, T1) utilisés par workspaceStore (T2), `toPersistable`/`loadWorkspace` (T3) et App (T9) ; `bindSession`/`clearSession`/`closeSession` cohérents store↔composants ; `useHub.subscribe` (Zustand) pour la persistance.
- **Classes CSS :** `#body`/`#main`/`#sidebar`, `.group`/`.item`/`.active-group`/`.active-group-item`/`.active-item`/`.ctx-menu` (T10) utilisées par Sidebar (T6) ; `.tab-ic`/`.item-ic` pour les icônes.

## Limites connues (hors Lot 2)
- Types d'items non-Claude (azure/jira/obsidian/validations) — Lot 4.
- Reprise de conversation (`--resume`) automatique : non (l'utilisateur fait `/resume`).
- Renommer via `window.prompt`/confirmations via `window.confirm` (simples) — des modales maison soignées pourront venir au Lot 3.
- Pas de drag & drop d'items directement dans la sidebar (seulement via les onglets) ni de déplacement inter-groupes à la souris dans la sidebar — possible en V ultérieure (`moveItem` le supporte déjà côté store).
