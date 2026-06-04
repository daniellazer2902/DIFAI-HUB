# Split-screen 2 volets indépendants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer le workspace mono-volet (terminal + dock console/recherche + rail) en un split-screen à deux volets indépendants, où les sessions portent un `split: 1|2` persisté par groupe, et où Recherche (Ctrl+F) et Agents deviennent des onglets auxiliaires du volet droit.

**Architecture:** Le modèle vit dans le store zustand (`store.ts`) : chaque `Item` gagne `split`, `findOpen`, `agentsOpen` ; chaque `Group` gagne `leftActiveTab`/`rightActiveTab` ; le store gagne `focusedPane`. Le `Workspace` rend `#panes` = `[Pane gauche][splitter][Pane droite]` ; chaque `Pane` (nouveau composant) rend sa bande d'onglets + son corps. Les terminaux d'un volet restent montés (`display:none/block`) pour préserver l'affichage au changement d'onglet. La migration se fait additivement (Tâche 1 ajoute sans rien casser), puis l'UI bascule (Tâches 2-3), puis on nettoie l'ancien modèle (Tâche 4).

**Tech Stack:** Electron + React + zustand + xterm, tests vitest, build `electron.vite`.

**Spec de référence :** `docs/superpowers/specs/2026-06-04-difai-hub-lot2-split-onglets-design.md`

---

## File Structure

- `src/shared/ipc.ts` — ajoute `split?: 1 | 2` à `PersistItem`.
- `src/renderer/src/store.ts` — modèle + actions (cœur de la feature).
- `tests/store.test.ts` — tests du nouveau modèle.
- `src/renderer/src/components/Console.tsx` — absorbe la liste d'agents (ancien rail).
- `src/renderer/src/components/Rail.tsx` — **supprimé** (fusionné dans Console).
- `src/renderer/src/components/Pane.tsx` — **nouveau** : un volet (bande d'onglets + corps).
- `src/renderer/src/components/Workspace.tsx` — réécrit : `#panes` à 2 volets.
- `src/renderer/src/components/TabBar.tsx` — **supprimé** (remplacé par `Pane`).
- `src/renderer/src/App.tsx` — Ctrl+F → `toggleFind`, retrait de `<TabBar/>`, `makeItem`.
- `src/renderer/src/components/SearchPanel.tsx` — fermeture via `closeFind`.
- `src/renderer/index.html` — CSS `#panes`/`.pane`/splitter pleine hauteur, agents-tab.

---

## Task 1: Modèle de state additif (store + ipc + tests)

Approche **additive** : on AJOUTE `split`/`findOpen`/`agentsOpen`/`leftActiveTab`/`rightActiveTab`/`focusedPane` et les nouvelles actions, **sans retirer** `railCollapsed`/`searchOpen`/`toggleRail`/`setSearch`/`toggleSearch`. Tout continue de compiler et de se comporter comme avant ; l'UI ne consomme pas encore le nouveau modèle. Le nettoyage des anciens champs se fait en Tâche 4.

**Files:**
- Modify: `src/shared/ipc.ts:39`
- Modify: `src/renderer/src/store.ts` (réécriture du fichier)
- Test: `tests/store.test.ts`

- [ ] **Step 1: Ajouter `split` au type persistable**

Dans `src/shared/ipc.ts`, remplacer la ligne 39 :

```ts
export interface PersistItem { id: string; name: string; cwd: string; split?: 1 | 2 }
```

- [ ] **Step 2: Écrire les tests du nouveau modèle (échouent)**

Remplacer le helper `mkItem` (lignes 5-8) de `tests/store.test.ts` par (on garde les anciens champs pour rester additif) :

```ts
const mkItem = (id: string, over: Partial<Item> = {}): Item => ({
  id, name: id, cwd: 'C:/' + id, pinned: false, tabId: 't-' + id,
  state: 'starting', agents: [], openAgentId: null, railCollapsed: false, searchOpen: false,
  split: 1, findOpen: false, agentsOpen: false, searchQuery: '', ...over
})
```

Ajouter en tête du fichier l'import de `tabRef` :

```ts
import { useHub, tabRef } from '../src/renderer/src/store'
```

Ajouter ce bloc de tests à la fin du `describe` (avant la `})` finale, ligne 104) :

```ts
  it('addItem : split par défaut = 1, va dans leftTabs', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    expect(useHub.getState().itemById('a')!.split).toBe(1)
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toEqual([tabRef('session', 'a')])
    expect(useHub.getState().rightTabs()).toEqual([])
  })

  it('setSplit déplace la session de volet', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().addItem(g, mkItem('b'))
    useHub.getState().setSplit('b', 2)
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toEqual([tabRef('session', 'a')])
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('session', 'b')])
  })

  it('toggleFind ouvre puis ferme l\'onglet Find à droite', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().toggleFind('a')
    expect(useHub.getState().itemById('a')!.findOpen).toBe(true)
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a')])
    expect(useHub.getState().groups[0].rightActiveTab).toBe(tabRef('find', 'a'))
    useHub.getState().toggleFind('a')
    expect(useHub.getState().itemById('a')!.findOpen).toBe(false)
    expect(useHub.getState().rightTabs()).toEqual([])
    expect(useHub.getState().groups[0].rightActiveTab).toBeNull()
  })

  it('openAgentsTab / closeAgentsTab', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().openAgentsTab('a')
    expect(useHub.getState().itemById('a')!.agentsOpen).toBe(true)
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('agents', 'a')])
    expect(useHub.getState().focusedPane).toBe('right')
    useHub.getState().closeAgentsTab('a')
    expect(useHub.getState().rightTabs()).toEqual([])
  })

  it('Find et Agents coexistent (plus d\'exclusivité)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().toggleFind('a')
    useHub.getState().openAgentsTab('a')
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a'), tabRef('agents', 'a')])
  })

  it('scénario extrême : A B | A-Find,B-Find -> fermetures -> B plein écran', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a'))
    useHub.getState().addItem(g, mkItem('b'))
    useHub.getState().toggleFind('a')
    useHub.getState().toggleFind('b')
    expect(useHub.getState().leftTabs().map((t) => t.ref)).toEqual([tabRef('session', 'a'), tabRef('session', 'b')])
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a'), tabRef('find', 'b')])
    useHub.getState().toggleFind('b') // retire B-Find, reste splitté
    expect(useHub.getState().rightTabs().map((t) => t.ref)).toEqual([tabRef('find', 'a')])
    useHub.getState().toggleFind('a') // retire A-Find, plus rien à droite
    expect(useHub.getState().rightTabs()).toEqual([])
  })

  it('clearSession reset findOpen/agentsOpen', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('a', { pinned: true, findOpen: true, agentsOpen: true }))
    useHub.getState().clearSession('a')
    expect(useHub.getState().itemById('a')!.findOpen).toBe(false)
    expect(useHub.getState().itemById('a')!.agentsOpen).toBe(false)
  })

  it('persistance : split conservé pour les items épinglés', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('pin', { pinned: true, name: 'api', cwd: 'C:/api', split: 2 }))
    expect(useHub.getState().toPersistable().groups[0].items).toEqual([{ id: 'pin', name: 'api', cwd: 'C:/api', split: 2 }])
    useHub.getState().reset()
    useHub.getState().loadWorkspace(useHub.getState().toPersistable())
  })

  it('loadWorkspace restaure split (défaut 1)', () => {
    useHub.getState().loadWorkspace({ activeGroupId: 'g1', groups: [{ id: 'g1', name: 'M', collapsed: false, defaultCwd: null, items: [{ id: 'i1', name: 'api', cwd: 'C:/api', split: 2 }, { id: 'i2', name: 'b', cwd: 'C:/b' }] }] })
    expect(useHub.getState().itemById('i1')!.split).toBe(2)
    expect(useHub.getState().itemById('i2')!.split).toBe(1)
  })
```

- [ ] **Step 3: Lancer les tests → ils échouent (compilation)**

Run: `npm test -- store`
Expected: FAIL (propriétés/méthodes `split`, `tabRef`, `leftTabs`, `setSplit`, `toggleFind`, etc. inexistantes).

- [ ] **Step 4: Réécrire `src/renderer/src/store.ts` (additif)**

Remplacer **tout** le contenu de `src/renderer/src/store.ts` par :

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

export type Pane = 'left' | 'right'
export type TabKind = 'session' | 'find' | 'agents'

export interface Item {
  id: string
  name: string
  cwd: string
  pinned: boolean
  tabId: string | null
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  split: 1 | 2
  findOpen: boolean
  agentsOpen: boolean
  searchQuery: string
  // Anciens champs (retirés en Tâche 4, conservés ici pour compat UI) :
  railCollapsed: boolean
  searchOpen: boolean
}

export interface Group {
  id: string
  name: string
  collapsed: boolean
  defaultCwd: string | null
  items: Item[]
  leftActiveTab: string | null
  rightActiveTab: string | null
}

export interface PaneTab { ref: string; kind: TabKind; item: Item }

interface HubState {
  groups: Group[]
  activeGroupId: string | null
  activeItemId: string | null
  focusedPane: Pane
  soundEnabled: boolean
  consoleWidth: number

  itemById: (itemId: string) => Item | undefined
  itemByTab: (tabId: string) => Item | undefined

  addGroup: (name: string) => string
  renameGroup: (groupId: string, name: string) => void
  removeGroup: (groupId: string) => void
  toggleGroupCollapsed: (groupId: string) => void
  setGroupDefaultCwd: (groupId: string, cwd: string) => void
  setActiveGroup: (groupId: string) => void

  addItem: (groupId: string, item: Item) => void
  removeItem: (itemId: string) => void
  renameItem: (itemId: string, name: string) => void
  togglePin: (itemId: string) => void
  setActiveItem: (itemId: string) => void
  moveItem: (itemId: string, toIndex: number, toGroupId?: string) => void
  setSplit: (itemId: string, split: 1 | 2) => void

  bindSession: (itemId: string, tabId: string) => void
  clearSession: (itemId: string) => void
  closeSession: (itemId: string) => void

  setItemState: (tabId: string, state: SessionState) => void
  addAgent: (tabId: string, agent: AgentView) => void
  appendLines: (tabId: string, agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (tabId: string, agentId: string) => void
  setAgentDone: (tabId: string, agentId: string) => void
  openAgent: (itemId: string, agentId: string | null) => void

  toggleFind: (itemId: string) => void
  closeFind: (itemId: string) => void
  openAgentsTab: (itemId: string) => void
  closeAgentsTab: (itemId: string) => void
  selectTab: (pane: Pane, ref: string) => void
  setFocusedPane: (pane: Pane) => void
  setSearchQuery: (itemId: string, query: string) => void
  leftTabs: () => PaneTab[]
  rightTabs: () => PaneTab[]

  // Anciens (retirés en Tâche 4) :
  toggleRail: (itemId: string) => void
  setSearch: (itemId: string, open: boolean) => void
  toggleSearch: (itemId: string) => void

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

const KIND_PREFIX: Record<TabKind, string> = { session: 's', find: 'f', agents: 'a' }
export function tabRef(kind: TabKind, itemId: string): string {
  return `${KIND_PREFIX[kind]}:${itemId}`
}
export function parseRef(ref: string): { kind: TabKind; itemId: string } {
  const i = ref.indexOf(':')
  const p = ref.slice(0, i)
  const itemId = ref.slice(i + 1)
  const kind: TabKind = p === 's' ? 'session' : p === 'f' ? 'find' : 'agents'
  return { kind, itemId }
}

/** Refs ordonnés des onglets d'un volet pour un groupe (sessions live + auxiliaires à droite). */
function paneRefs(group: Group, pane: Pane): string[] {
  const refs: string[] = []
  for (const i of group.items) {
    if (pane === 'left') {
      if (i.split === 1 && i.tabId) refs.push(tabRef('session', i.id))
    } else {
      if (i.split === 2 && i.tabId) refs.push(tabRef('session', i.id))
      if (i.findOpen) refs.push(tabRef('find', i.id))
      if (i.agentsOpen) refs.push(tabRef('agents', i.id))
    }
  }
  return refs
}

/** Recale leftActiveTab/rightActiveTab sur des onglets existants (ou null/premier). */
function normalizeGroup(g: Group): Group {
  const left = paneRefs(g, 'left')
  const right = paneRefs(g, 'right')
  const leftActiveTab = g.leftActiveTab && left.includes(g.leftActiveTab) ? g.leftActiveTab : (left[0] ?? null)
  const rightActiveTab = g.rightActiveTab && right.includes(g.rightActiveTab) ? g.rightActiveTab : (right[0] ?? null)
  return { ...g, leftActiveTab, rightActiveTab }
}
function normalizeAll(groups: Group[]): Group[] {
  return groups.map(normalizeGroup)
}
export function paneTabs(group: Group, pane: Pane): PaneTab[] {
  return paneRefs(group, pane).map((ref) => {
    const { kind, itemId } = parseRef(ref)
    return { ref, kind, item: group.items.find((i) => i.id === itemId) as Item }
  })
}

const initial = {
  groups: [] as Group[],
  activeGroupId: null as string | null,
  activeItemId: null as string | null,
  focusedPane: 'left' as Pane,
  soundEnabled: true,
  consoleWidth: 380
}

function mapItems(groups: Group[], match: (i: Item) => boolean, fn: (i: Item) => Item): Group[] {
  return groups.map((g) => ({ ...g, items: g.items.map((i) => (match(i) ? fn(i) : i)) }))
}
function setPaneActive(groups: Group[], itemId: string, pane: Pane, ref: string): Group[] {
  return groups.map((g) =>
    g.items.some((i) => i.id === itemId)
      ? pane === 'left'
        ? { ...g, leftActiveTab: ref }
        : { ...g, rightActiveTab: ref }
      : g
  )
}

export const useHub = create<HubState>((set, get) => ({
  ...initial,

  itemById: (itemId) => get().groups.flatMap((g) => g.items).find((i) => i.id === itemId),
  itemByTab: (tabId) => get().groups.flatMap((g) => g.items).find((i) => i.tabId === tabId),

  addGroup: (name) => {
    const id = uid('g')
    set((s) => ({
      groups: [...s.groups, { id, name, collapsed: false, defaultCwd: null, items: [], leftActiveTab: null, rightActiveTab: null }],
      activeGroupId: id
    }))
    return id
  },
  renameGroup: (groupId, name) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, name } : g)) })),
  removeGroup: (groupId) =>
    set((s) => {
      const groups = s.groups.filter((g) => g.id !== groupId)
      const activeGroupId = s.activeGroupId === groupId ? (groups[groups.length - 1]?.id ?? null) : s.activeGroupId
      return { groups, activeGroupId }
    }),
  toggleGroupCollapsed: (groupId) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)) })),
  setGroupDefaultCwd: (groupId, cwd) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, defaultCwd: cwd } : g)) })),
  setActiveGroup: (activeGroupId) => set({ activeGroupId }),

  addItem: (groupId, item) =>
    set((s) => {
      const pane: Pane = item.split === 2 ? 'right' : 'left'
      const ref = tabRef('session', item.id)
      const groups = s.groups.map((g) => {
        if (g.id !== groupId) return g
        const ng = { ...g, items: [...g.items, item] }
        return pane === 'left' ? { ...ng, leftActiveTab: ref } : { ...ng, rightActiveTab: ref }
      })
      return { groups: normalizeAll(groups), activeGroupId: groupId, activeItemId: item.id, focusedPane: pane }
    }),
  removeItem: (itemId) =>
    set((s) => {
      const groups = normalizeAll(s.groups.map((g) => ({ ...g, items: g.items.filter((i) => i.id !== itemId) })))
      return { groups, activeItemId: s.activeItemId === itemId ? null : s.activeItemId }
    }),
  renameItem: (itemId, name) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, name })) })),
  togglePin: (itemId) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, pinned: !i.pinned })) })),
  setActiveItem: (itemId) =>
    set((s) => {
      const g = s.groups.find((grp) => grp.items.some((i) => i.id === itemId))
      if (!g) return { activeItemId: itemId }
      const item = g.items.find((i) => i.id === itemId) as Item
      const pane: Pane = item.split === 2 ? 'right' : 'left'
      const groups = setPaneActive(s.groups, itemId, pane, tabRef('session', itemId))
      return { activeItemId: itemId, activeGroupId: g.id, focusedPane: pane, groups }
    }),
  moveItem: (itemId, toIndex, toGroupId) =>
    set((s) => {
      let moved: Item | undefined
      const sourceGroup = s.groups.find((g) => g.items.some((i) => i.id === itemId))
      const stripped = s.groups.map((g) => {
        const found = g.items.find((i) => i.id === itemId)
        if (found) moved = found
        return { ...g, items: g.items.filter((i) => i.id !== itemId) }
      })
      if (!moved || !sourceGroup) return s
      const targetId = toGroupId ?? sourceGroup.id
      const groups = stripped.map((g) => {
        if (g.id !== targetId) return g
        const items = [...g.items]
        items.splice(Math.max(0, Math.min(toIndex, items.length)), 0, moved as Item)
        return { ...g, items }
      })
      return { groups: normalizeAll(groups) }
    }),
  setSplit: (itemId, split) =>
    set((s) => {
      const moved = mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, split }))
      const groups = setPaneActive(moved, itemId, split === 2 ? 'right' : 'left', tabRef('session', itemId))
      return { groups: normalizeAll(groups), focusedPane: split === 2 ? 'right' : 'left', activeItemId: itemId }
    }),

  bindSession: (itemId, tabId) =>
    set((s) => ({ groups: normalizeAll(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, tabId, state: 'starting' }))) })),
  clearSession: (itemId) =>
    set((s) => ({
      groups: normalizeAll(
        mapItems(s.groups, (i) => i.id === itemId, (i) => ({
          ...i, tabId: null, state: 'done', agents: [], openAgentId: null, findOpen: false, agentsOpen: false, searchOpen: false
        }))
      )
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
      groups: mapItems(s.groups, (i) => i.tabId === tabId, (i) => (i.agents.some((a) => a.id === agent.id) ? i : { ...i, agents: [...i.agents, agent] }))
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
  openAgent: (itemId, agentId) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, openAgentId: agentId })) })),

  toggleFind: (itemId) =>
    set((s) => {
      const item = s.groups.flatMap((g) => g.items).find((i) => i.id === itemId)
      if (!item) return s
      const open = !item.findOpen
      let groups = mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, findOpen: open }))
      if (open) groups = setPaneActive(groups, itemId, 'right', tabRef('find', itemId))
      return { groups: normalizeAll(groups), focusedPane: open ? 'right' : s.focusedPane }
    }),
  closeFind: (itemId) => set((s) => ({ groups: normalizeAll(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, findOpen: false }))) })),
  openAgentsTab: (itemId) =>
    set((s) => {
      const groups = setPaneActive(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, agentsOpen: true })), itemId, 'right', tabRef('agents', itemId))
      return { groups: normalizeAll(groups), focusedPane: 'right' }
    }),
  closeAgentsTab: (itemId) => set((s) => ({ groups: normalizeAll(mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, agentsOpen: false }))) })),
  selectTab: (pane, ref) =>
    set((s) => {
      const { itemId } = parseRef(ref)
      return { groups: setPaneActive(s.groups, itemId, pane, ref), focusedPane: pane, activeItemId: itemId }
    }),
  setFocusedPane: (focusedPane) => set({ focusedPane }),
  setSearchQuery: (itemId, searchQuery) => set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, searchQuery })) })),
  leftTabs: () => {
    const g = get().groups.find((x) => x.id === get().activeGroupId)
    return g ? paneTabs(g, 'left') : []
  },
  rightTabs: () => {
    const g = get().groups.find((x) => x.id === get().activeGroupId)
    return g ? paneTabs(g, 'right') : []
  },

  // --- Anciens (retirés en Tâche 4) ---
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

  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setConsoleWidth: (consoleWidth) => set({ consoleWidth }),

  toPersistable: () => {
    const s = get()
    return {
      activeGroupId: s.activeGroupId,
      groups: s.groups.map((g) => ({
        id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd,
        items: g.items.filter((i) => i.pinned).map((i) => ({ id: i.id, name: i.name, cwd: i.cwd, split: i.split }))
      }))
    }
  },
  loadWorkspace: (tree) =>
    set({
      activeGroupId: tree.activeGroupId,
      activeItemId: null,
      focusedPane: 'left',
      groups: normalizeAll(
        tree.groups.map((g) => ({
          id: g.id, name: g.name, collapsed: g.collapsed, defaultCwd: g.defaultCwd ?? null, leftActiveTab: null, rightActiveTab: null,
          items: g.items.map((i) => ({
            id: i.id, name: i.name, cwd: i.cwd, pinned: true, tabId: null, state: 'done', agents: [], openAgentId: null,
            split: i.split ?? 1, findOpen: false, agentsOpen: false, searchQuery: '', railCollapsed: false, searchOpen: false
          }))
        }))
      )
    }),
  reset: () => set({ ...initial })
}))
```

- [ ] **Step 5: Lancer les tests → ils passent**

Run: `npm test -- store`
Expected: PASS (anciens tests + nouveaux).

- [ ] **Step 6: Build + lint**

Run: `npm run build`
Expected: succès (l'UI compile encore : elle utilise toujours `railCollapsed`/`searchOpen`).

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(split): modele store additif (split 1/2, find/agents tabs, panes) + tests"
```

---

## Task 2: Fusionner le rail dans la Console

But : l'onglet « Agents » contiendra la liste d'agents (ancien rail) + le flux de l'agent sélectionné. On supprime `Rail.tsx` et la colonne rail séparée du `Workspace`. Le `Workspace` reste mono-volet pour l'instant (la refonte 2 volets est en Tâche 3).

**Files:**
- Modify: `src/renderer/src/components/Console.tsx` (réécriture)
- Delete: `src/renderer/src/components/Rail.tsx`
- Modify: `src/renderer/src/components/Workspace.tsx:37-57`
- Modify: `src/renderer/index.html` (CSS `.agents-tab`)

- [ ] **Step 1: Réécrire `Console.tsx` (rail intégré)**

Remplacer tout le contenu de `src/renderer/src/components/Console.tsx` par :

```tsx
import React, { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console({ itemId }: { itemId: string }): React.JSX.Element | null {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)
  const bodyRef = useRef<HTMLDivElement>(null)
  const agent = item?.agents.find((a) => a.id === item.openAgentId) ?? null

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!item) return null

  return (
    <div className="agents-tab">
      <div className="rail">
        {item.agents.length === 0 && <div className="rail-empty">Aucun agent</div>}
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
      <div className="console">
        {agent ? (
          <>
            <div className="console-header"><span>▸ {agent.type} — {agent.desc.slice(0, 50)}</span></div>
            <div className="console-body" ref={bodyRef}>
              {agent.lines.map((l, i) => (
                <div className={`cline ${l.kind}`} key={i}>{icon(l.kind)} {l.text}</div>
              ))}
            </div>
          </>
        ) : (
          <div className="console-empty">Sélectionne un agent dans la liste.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Supprimer `Rail.tsx`**

```bash
git rm src/renderer/src/components/Rail.tsx
```

- [ ] **Step 3: Adapter `Workspace.tsx` (retrait du rail séparé + rails-toggle)**

Dans `src/renderer/src/components/Workspace.tsx`, retirer l'import `Rail` (ligne 6) et remplacer le bloc `return (...)` (lignes 35-59) par :

```tsx
  return (
    <div id="workspace">
      {liveItems.map((it) => (
        <div key={it.id} className="tabpane" style={{ display: it.id === activeItemId ? 'block' : 'none' }}>
          <div className="term-wrap">
            <div className="term-area">
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
          </div>
        </div>
      ))}
    </div>
  )
```

Retirer aussi `const toggleRail = useHub((s) => s.toggleRail)` (ligne 13) — devenu inutile.

- [ ] **Step 4: Ajouter le CSS `.agents-tab`**

Dans `src/renderer/index.html`, après la règle `.rail { ... }` (ligne 108), ajouter :

```css
      .agents-tab { display: flex; flex: 1; min-width: 0; height: 100%; }
      .agents-tab .rail { border-left: none; border-right: 1px solid #333; flex: none; }
      .agents-tab .console { flex: 1; min-width: 0; overflow-y: auto; }
      .rail-empty { padding: 8px; color: #666; font-size: 11px; }
      .console-empty { padding: 10px; color: #666; font-size: 12px; }
```

- [ ] **Step 5: Build + lint + test**

Run: `npm run build && npm test`
Expected: succès. (La console affiche désormais la liste d'agents à gauche + le flux ; plus de colonne rail séparée.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(split): rail fusionne dans la console (onglet Agents), suppression Rail.tsx"
```

---

## Task 3: Volet `Pane` + Workspace 2 volets + câblage UI

Cœur visuel de la feature. On crée `Pane.tsx`, on réécrit `Workspace.tsx` en `#panes`, on remplace `TabBar` par `Pane`, on rebranche Ctrl+F sur `toggleFind` et la fermeture de la recherche sur `closeFind`.

**Files:**
- Create: `src/renderer/src/components/Pane.tsx`
- Modify: `src/renderer/src/components/Workspace.tsx` (réécriture)
- Modify: `src/renderer/src/App.tsx` (Ctrl+F + retrait `<TabBar/>` + `makeItem`)
- Modify: `src/renderer/src/components/SearchPanel.tsx:24,65,67`
- Delete: `src/renderer/src/components/TabBar.tsx`
- Modify: `src/renderer/index.html` (CSS panes/strips)

- [ ] **Step 1: Créer `Pane.tsx`**

Créer `src/renderer/src/components/Pane.tsx` :

```tsx
import React, { useState } from 'react'
import { useHub, parseRef, type Group, type PaneTab, type Pane as Side } from '../store'
import { StateDot } from './StateDot'
import { TerminalIcon, FolderIcon } from './icons'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { SearchPanel } from './SearchPanel'
import { basename } from '../util'

interface Props {
  side: Side
  group: Group
  tabs: PaneTab[]
  activeRef: string | null
  width: number
  hasOther: boolean
  dragId: string | null
  setDragId: (id: string | null) => void
}

export function Pane({ side, group, tabs, activeRef, width, hasOther, dragId, setDragId }: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const sessions = tabs.filter((t) => t.kind === 'session')
  const active = activeRef ? parseRef(activeRef) : null

  async function openTab(cwd: string): Promise<void> {
    setMenuOpen(false)
    const gid = group.id
    const tabId = await window.hub.newSession(cwd)
    const id = crypto.randomUUID()
    useHub.getState().addItem(gid, {
      id, name: basename(cwd), cwd, pinned: false, tabId, state: 'starting', agents: [], openAgentId: null,
      split: side === 'right' ? 2 : 1, findOpen: false, agentsOpen: false, searchQuery: '', railCollapsed: false, searchOpen: false
    })
  }
  async function onDefault(): Promise<void> { openTab(group.defaultCwd ?? (await window.hub.defaultCwd())) }
  async function onPick(): Promise<void> { const f = await window.hub.pickFolder(); if (f) openTab(f); else setMenuOpen(false) }

  function closeSession(e: React.MouseEvent, itemId: string, tabId: string | null): void {
    e.stopPropagation()
    if (tabId) window.hub.killSession(tabId)
    useHub.getState().closeSession(itemId)
  }

  // Drop d'un onglet session : autre volet => setSplit ; même volet => réordonne avant la cible.
  function onDropTab(targetItemId: string): void {
    if (!dragId || dragId === targetItemId) { setDragId(null); return }
    const dragged = group.items.find((i) => i.id === dragId)
    if (!dragged) { setDragId(null); return }
    if (dragged.split !== (side === 'right' ? 2 : 1)) useHub.getState().setSplit(dragId, side === 'right' ? 2 : 1)
    else {
      const idx = group.items.findIndex((i) => i.id === targetItemId)
      useHub.getState().moveItem(dragId, idx, group.id)
    }
    setDragId(null)
  }
  // Drop sur la zone vide du volet : rattache la session à ce volet.
  function onDropPane(): void {
    if (dragId) useHub.getState().setSplit(dragId, side === 'right' ? 2 : 1)
    setDragId(null)
  }

  return (
    <div
      className={`pane ${side}`}
      style={side === 'right' && hasOther ? { width } : { flex: 1, minWidth: 0 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropPane}
    >
      <div className="pane-tabstrip">
        {tabs.map((t) => {
          const sel = t.ref === activeRef
          if (t.kind === 'session') {
            return (
              <div
                key={t.ref}
                className={`tab${sel ? ' act' : ''}`}
                draggable
                onDragStart={() => setDragId(t.item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.stopPropagation(); onDropTab(t.item.id) }}
                onClick={() => useHub.getState().selectTab(side, t.ref)}
              >
                <span className="tab-ic"><TerminalIcon /></span>
                <StateDot state={t.item.state} />
                <span className="tab-title">{t.item.name}</span>
                <span
                  className="tab-agents"
                  title="Ouvrir les agents"
                  onClick={(e) => { e.stopPropagation(); useHub.getState().openAgentsTab(t.item.id) }}
                >· {t.item.agents.filter((a) => !a.done).length} agents</span>
                <span className="tab-close" title="Fermer l'onglet" onClick={(e) => closeSession(e, t.item.id, t.item.tabId)}>✕</span>
              </div>
            )
          }
          const label = `${t.item.name} - ${t.kind === 'find' ? 'Find' : 'Agents'}`
          const onClose = t.kind === 'find' ? () => useHub.getState().closeFind(t.item.id) : () => useHub.getState().closeAgentsTab(t.item.id)
          return (
            <div key={t.ref} className={`tab aux${sel ? ' act' : ''}`} onClick={() => useHub.getState().selectTab(side, t.ref)}>
              <span className="tab-title">{label}</span>
              <span className="tab-close" title="Fermer l'onglet" onClick={(e) => { e.stopPropagation(); onClose() }}>✕</span>
            </div>
          )
        })}
        <div className="tab-new">
          <button title="Nouvel onglet" onClick={() => setMenuOpen((o) => !o)}>＋</button>
          {menuOpen && (
            <div className="tab-new-menu">
              <div onClick={onDefault}><FolderIcon /> Dossier par défaut</div>
              <div onClick={onPick}><FolderIcon /> Choisir un dossier…</div>
            </div>
          )}
        </div>
      </div>
      <div className="pane-body">
        {sessions.map((t) => (
          <div key={t.item.id} className="body-slot" style={{ display: active?.kind === 'session' && active.itemId === t.item.id ? 'block' : 'none' }}>
            <Terminal tabId={t.item.tabId as string} />
          </div>
        ))}
        {active?.kind === 'find' && <SearchPanel itemId={active.itemId} />}
        {active?.kind === 'agents' && <Console itemId={active.itemId} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Réécrire `Workspace.tsx` (2 volets)**

Remplacer tout le contenu de `src/renderer/src/components/Workspace.tsx` par :

```tsx
import React, { useState } from 'react'
import { useHub, paneTabs } from '../store'
import { clampConsoleWidth, writeConsoleWidth } from '../util'
import { Pane } from './Pane'

export function Workspace(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const consoleWidth = useHub((s) => s.consoleWidth)
  const setConsoleWidth = useHub((s) => s.setConsoleWidth)
  const [dragId, setDragId] = useState<string | null>(null)

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

  const group = groups.find((g) => g.id === activeGroupId)
  const leftTabs = group ? paneTabs(group, 'left') : []
  const rightTabs = group ? paneTabs(group, 'right') : []

  return (
    <div id="panes">
      {group && leftTabs.length > 0 && (
        <Pane side="left" group={group} tabs={leftTabs} activeRef={group.leftActiveTab} width={consoleWidth} hasOther={rightTabs.length > 0} dragId={dragId} setDragId={setDragId} />
      )}
      {group && leftTabs.length > 0 && rightTabs.length > 0 && (
        <div className="splitter" title="Redimensionner" onMouseDown={startResize} />
      )}
      {group && rightTabs.length > 0 && (
        <Pane side="right" group={group} tabs={rightTabs} activeRef={group.rightActiveTab} width={consoleWidth} hasOther={leftTabs.length > 0} dragId={dragId} setDragId={setDragId} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Mettre à jour `App.tsx` (Ctrl+F, makeItem, retrait TabBar)**

Dans `src/renderer/src/App.tsx` :

Remplacer l'import (ligne 2) :
```tsx
import { useHub, parseRef, type Item } from './store'
```
Retirer l'import de `TabBar` (ligne 5).

Remplacer `makeItem` (lignes 11-13) :
```tsx
function makeItem(id: string, cwd: string, tabId: string, pinned: boolean): Item {
  return { id, name: basename(cwd), cwd, pinned, tabId, state: 'starting', agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '', railCollapsed: false, searchOpen: false }
}
```

Remplacer le handler Ctrl+F (lignes 17-26) :
```tsx
  // Ctrl/Cmd+F : bascule l'onglet Find de l'item courant (propriétaire de l'onglet actif du volet focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        const s = useHub.getState()
        const g = s.groups.find((x) => x.id === s.activeGroupId)
        const ref = s.focusedPane === 'right' ? g?.rightActiveTab : g?.leftActiveTab
        const targetId = ref ? parseRef(ref).itemId : s.activeItemId
        if (targetId) { e.preventDefault(); e.stopPropagation(); s.toggleFind(targetId) }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])
```

Dans le `return` (lignes 88-99), retirer la ligne `<TabBar />` :
```tsx
        <div id="main">
          <Workspace />
        </div>
```

- [ ] **Step 4: `SearchPanel.tsx` ferme via `closeFind`**

Dans `src/renderer/src/components/SearchPanel.tsx` :
- ligne 24 : remplacer `const setSearch = useHub((s) => s.setSearch)` par `const closeFind = useHub((s) => s.closeFind)`
- ligne 65 : remplacer `setSearch(itemId, false)` par `closeFind(itemId)`
- ligne 67 : remplacer `onClick={() => setSearch(itemId, false)}` par `onClick={() => closeFind(itemId)}`

- [ ] **Step 5: Supprimer `TabBar.tsx`**

```bash
git rm src/renderer/src/components/TabBar.tsx
```

- [ ] **Step 6: CSS des volets**

Dans `src/renderer/index.html` :

Remplacer la règle `#workspace { flex: 1; min-height: 0; }` (ligne 81) par :
```css
      #panes { flex: 1; min-height: 0; display: flex; }
      .pane { display: flex; flex-direction: column; min-width: 0; height: 100%; }
      .pane-tabstrip { display: flex; align-items: flex-end; gap: 5px; padding: 6px 8px 0; background: #181818; border-bottom: 1px solid #333; min-height: 34px; overflow-x: auto; }
      .pane-body { flex: 1; min-height: 0; position: relative; display: flex; }
      .body-slot { position: absolute; inset: 0; }
      .tab.aux { background: #1a1d22; border-color: #2f3a44; color: #9cc; }
      .tab.aux.act { background: #23262b; border-color: #c80; }
```

Le `.term-screen` doit remplir son slot : remplacer la ligne 87 par :
```css
      .term-screen { flex: 1; min-width: 0; width: 100%; height: 100%; }
```

Adapter `.search-panel` et `.agents-tab` pour remplir le `pane-body` : ils sont déjà `flex: 1`. Ajouter (après ligne 88) :
```css
      .pane-body > .search-panel, .pane-body > .agents-tab { position: absolute; inset: 0; }
```

- [ ] **Step 7: Build + lint + test**

Run: `npm run build && npm test`
Expected: succès.

- [ ] **Step 8: Vérification manuelle (scénario d'acceptation)**

Run: `npm run dev`
Vérifier :
1. Un seul volet au démarrage (gauche, plein écran).
2. Ctrl+F sur la session → split avec onglet `<nom> - Find` à droite ; taper une recherche fonctionne.
3. Clic sur « · N agents » d'un onglet → ouvre `<nom> - Agents` à droite (liste rail + console), Find et Agents coexistent.
4. Drag d'un onglet gauche par-dessus le volet droit → la session bascule à droite (et inversement).
5. `＋` du volet droit → nouvelle session à droite.
6. Fermer (✕) le dernier onglet droit → retour plein écran à gauche.
7. Redimensionner via le splitter.
8. Switch entre onglets d'un même volet : le terminal n'est pas relancé.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(split): workspace 2 volets (Pane), Find/Agents en onglets droits, Ctrl+F -> toggleFind"
```

---

## Task 4: Nettoyage de l'ancien modèle

On retire les champs/actions devenus inutiles : `railCollapsed`, `searchOpen` (Item) et `toggleRail`, `setSearch`, `toggleSearch` (store), ainsi que les `.rails-toggle`/`.console-host`/`.term-wrap` CSS orphelins.

**Files:**
- Modify: `src/renderer/src/store.ts`
- Modify: `tests/store.test.ts:5-8`
- Modify: `src/renderer/src/App.tsx` (makeItem)
- Modify: `src/renderer/src/components/Sidebar.tsx:66-69`
- Modify: `src/renderer/src/components/Pane.tsx` (openTab item literal)
- Modify: `src/renderer/index.html` (CSS orphelin)

- [ ] **Step 1: Retirer les champs de `Item` et les actions du store**

Dans `src/renderer/src/store.ts` :
- Interface `Item` : supprimer les lignes `railCollapsed: boolean` et `searchOpen: boolean` (et le commentaire associé).
- Interface `HubState` : supprimer `toggleRail`, `setSearch`, `toggleSearch` (et le commentaire `// Anciens (retirés en Tâche 4) :`).
- Implémentation : supprimer les blocs `toggleRail: (...)`, `setSearch: (...)`, `toggleSearch: (...)` (et le commentaire `// --- Anciens ... ---`).
- `clearSession` : retirer `searchOpen: false` de l'objet retourné.
- `loadWorkspace` : retirer `railCollapsed: false, searchOpen: false` de la construction des items.

- [ ] **Step 2: Retirer les champs des constructeurs**

- `tests/store.test.ts` helper `mkItem` : retirer `railCollapsed: false, searchOpen: false,`.
- `src/renderer/src/App.tsx` `makeItem` : retirer `railCollapsed: false, searchOpen: false`.
- `src/renderer/src/components/Sidebar.tsx` `addItemTo` (item literal, lignes 66-69) : remplacer par
```tsx
    const item: Item = {
      id: crypto.randomUUID(), name: basename(cwd), cwd, pinned: false, tabId,
      state: 'starting', agents: [], openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: ''
    }
```
- `src/renderer/src/components/Pane.tsx` `openTab` : retirer `railCollapsed: false, searchOpen: false` de l'objet passé à `addItem`.

- [ ] **Step 3: Retirer le CSS orphelin**

Dans `src/renderer/index.html`, supprimer les règles devenues inutiles :
- `.rails-toggle { ... }` (ancienne ligne 85)
- `.term-wrap { ... }` et `.term-area { ... }` (anciennes lignes 83-84)
- `.console-host { ... }` (ancienne ligne 106)

- [ ] **Step 4: Build + lint + test**

Run: `npm run build && npm test`
Expected: succès, aucune référence orpheline (TypeScript échouerait sinon).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(split): retrait de l'ancien modele (railCollapsed/searchOpen, toggleRail/setSearch)"
```

---

## Task 5: Vérification de la persistance + finalisation

**Files:** aucun (vérification + commit éventuel).

- [ ] **Step 1: Test manuel de persistance**

Run: `npm run dev`
1. Créer une session, l'épingler, la basculer à droite (drag) → elle est en split 2.
2. Fermer l'app, relancer.
Expected : la session épinglée revient **à droite** (split 2 restauré). Une session droite **non épinglée** ne revient pas → le volet gauche occupe tout l'écran.

- [ ] **Step 2: Vérification finale complète**

Run: `npm test && npm run build`
Expected: tout vert.

Reparcourir les critères d'acceptation de la spec (`§ Critères d'acceptation`) et cocher chacun.

- [ ] **Step 3: Commit de clôture (si ajustements)**

```bash
git add -A
git commit -m "chore(split): finalisation split-screen 2 volets"
```

---

## Self-Review (rempli par l'auteur du plan)

- **Couverture spec** : layout 2 volets (T3) ; `split` par item + persistance (T1, T5) ; Find/Agents auxiliaires à droite (T1 state, T3 UI) ; rail fusionné dans Agents (T2) ; Ctrl+F toggle Find (T1+T3) ; badge agents → onglet Agents (T3) ; suppression rail/rails-toggle (T2/T4) ; sidebar inchangée (sessions split=2 visibles — comportement par défaut, aucun code requis). Scénario extrême testé (T1). ✔ Pas de lacune.
- **Placeholders** : aucun — tout le code est fourni.
- **Cohérence des types** : `tabRef`/`parseRef`/`paneTabs`/`PaneTab`/`Pane`/`split`/`findOpen`/`agentsOpen`/`leftActiveTab`/`rightActiveTab`/`focusedPane` définis en T1 et utilisés tels quels en T3. `selectTab(side, ref)`, `setSplit(id, 1|2)`, `toggleFind(id)`, `openAgentsTab(id)`, `closeFind(id)`, `closeAgentsTab(id)` : signatures constantes T1↔T3.
```
