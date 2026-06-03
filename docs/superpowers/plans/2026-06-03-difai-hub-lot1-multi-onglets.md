# DIFAI-HUB Lot 1 — Multi-onglets Claude + état + son

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe checkbox (`- [ ]`).

**Goal:** Passer de mono-session à plusieurs sessions Claude en parallèle, présentées par une barre d'onglets avec indicateur d'état, deux notifications sonores et rail repliable par onglet.

**Architecture:** Le store Zustand passe d'un état mono-session à une liste d'onglets (`tabs[]` + `activeTabId`). Un câblage IPC global route les events (`onSessionState`/`onAgentAdded`/`onAgentLines`) vers le bon onglet par `tabId`. De nouveaux canaux IPC (`PickFolder`, `DefaultCwd`) délèguent à des capacités fournies par `index.ts` via `AppContext` (testable sans mocker electron). L'UI se découpe en `Header` + `TabBar` + `Workspace` (qui monte une fenêtre terminal/console/rail par onglet, visible seulement pour l'onglet actif). Les sons sont synthétisés (Web Audio).

**Tech Stack:** TypeScript, Electron, React 18, Zustand, @xterm/xterm, Web Audio, Vitest. Convention modulaire V1-D.0 (canaux dans `src/shared/ipc.ts`, handlers dans `sessionModule`, store + composants).

**Branche:** `feat/lot1-multi-onglets`.

**Note parallélisation :** les tâches renderer dépendent presque toutes du store et du contrat IPC ; le gain d'un découpage parallèle est marginal pour ce lot. Exécution séquentielle recommandée.

---

## Task 1 : Canaux IPC `PickFolder` / `DefaultCwd` + preload

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Ajouter les canaux et les méthodes au contrat `src/shared/ipc.ts`**

Dans l'objet `IPC`, après `SessionKill: 'session:kill',` ajouter :
```ts
  PickFolder: 'dialog:pick-folder',
  DefaultCwd: 'session:default-cwd',
```
Dans l'interface `HubApi`, après `killSession(tabId: string): void` ajouter :
```ts
  pickFolder(): Promise<string | null>
  defaultCwd(): Promise<string>
```

- [ ] **Step 2: Implémenter dans le preload `src/preload/index.ts`**

Après la ligne `killSession: (tabId) => ipcRenderer.send(IPC.SessionKill, tabId),` ajouter :
```ts
  pickFolder: () => ipcRenderer.invoke(IPC.PickFolder),
  defaultCwd: () => ipcRenderer.invoke(IPC.DefaultCwd),
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Commit**
```powershell
git add src/shared/ipc.ts src/preload/index.ts
git commit -m "feat(lot1): canaux IPC PickFolder + DefaultCwd (contrat + preload)"
```

---

## Task 2 : `AppContext` (defaultCwd + pickFolder) + handlers `sessionModule` + bootstrap

**Files:**
- Modify: `src/main/AppContext.ts`
- Modify: `src/main/modules/sessionModule.ts`
- Modify: `src/main/index.ts`
- Test: `tests/sessionModule.test.ts`

- [ ] **Step 1: Étendre `AppContext` dans `src/main/AppContext.ts`**

Dans l'interface `AppContext`, après la ligne `hooksSettingsPath: () => string` ajouter :
```ts
  /** Dossier par défaut des nouvelles sessions. */
  defaultCwd: string
  /** Ouvre le sélecteur de dossier natif ; renvoie le chemin choisi ou null. */
  pickFolder: () => Promise<string | null>
```

- [ ] **Step 2: Étendre le test `tests/sessionModule.test.ts`**

Dans la fonction `fakeCtx()`, ajouter au littéral `ctx` (après `hooksSettingsPath: () => 'C:/settings.json'`) :
```ts
    ,defaultCwd: 'C:/def',
    pickFolder: vi.fn(async () => 'C:/picked')
```
Puis ajouter ces deux tests dans le `describe('sessionModule', ...)` :
```ts
  it('default-cwd renvoie ctx.defaultCwd', async () => {
    const { ctx, handlers } = fakeCtx()
    createSessionModule().register(ctx)
    expect(await handlers.get(IPC.DefaultCwd)!({})).toBe('C:/def')
  })

  it('pick-folder délègue à ctx.pickFolder', async () => {
    const { ctx, handlers } = fakeCtx()
    createSessionModule().register(ctx)
    expect(await handlers.get(IPC.PickFolder)!({})).toBe('C:/picked')
  })
```

- [ ] **Step 3: Lancer → échec.** Run: `npm test -- sessionModule`
Expected: FAIL (handlers `DefaultCwd`/`PickFolder` non enregistrés).

- [ ] **Step 4: Enregistrer les handlers dans `src/main/modules/sessionModule.ts`**

Juste avant la fermeture de la fonction `register` (après la ligne `ctx.ipc.on(IPC.SessionKill, (_e, tabId: string) => ctx.pty.kill(tabId))`) ajouter :
```ts
      ctx.ipc.handle(IPC.DefaultCwd, () => ctx.defaultCwd)
      ctx.ipc.handle(IPC.PickFolder, () => ctx.pickFolder())
```

- [ ] **Step 5: Fournir les capacités dans `src/main/index.ts`**

Modifier l'import electron en tête :
```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
```
Dans la construction de `const ctx: AppContext = { ... }`, après la ligne `hooksSettingsPath: () => hooksSettingsPath` ajouter :
```ts
  ,
  defaultCwd: process.cwd(),
  pickFolder: async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
  }
```

- [ ] **Step 6: Lancer → succès + typecheck.**
Run: `npm test -- sessionModule` → PASS
Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur
Run: `npm test` → tous verts

- [ ] **Step 7: Commit**
```powershell
git add src/main/AppContext.ts src/main/modules/sessionModule.ts src/main/index.ts tests/sessionModule.test.ts
git commit -m "feat(lot1): AppContext defaultCwd+pickFolder, handlers session, dialog dossier"
```

---

## Task 3 : Util `basename` (TDD pur)

**Files:**
- Create: `src/renderer/src/util.ts`
- Test: `tests/util.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/util.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { basename } from '../src/renderer/src/util'

describe('basename', () => {
  it('extrait le dernier segment (Windows)', () => {
    expect(basename('C:\\Users\\dan\\projet')).toBe('projet')
  })
  it('extrait le dernier segment (slash) et ignore le slash final', () => {
    expect(basename('C:/Users/dan/projet/')).toBe('projet')
  })
  it('renvoie l\'entrée si pas de séparateur', () => {
    expect(basename('projet')).toBe('projet')
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- util`
Expected: FAIL (`basename` absent).

- [ ] **Step 3: Implémenter `src/renderer/src/util.ts`**
```ts
/** Dernier segment d'un chemin (Windows ou POSIX), slash final ignoré. */
export function basename(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[\\/]/)
  return parts[parts.length - 1] || p
}
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- util`
Expected: PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/src/util.ts tests/util.test.ts
git commit -m "feat(lot1): util basename + tests"
```

---

## Task 4 : `sound.ts` — transition→son (TDD) + lecture audio + persistance

**Files:**
- Create: `src/renderer/src/sound.ts`
- Test: `tests/sound.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/sound.test.ts`**
```ts
import { describe, it, expect } from 'vitest'
import { soundForTransition } from '../src/renderer/src/sound'

describe('soundForTransition', () => {
  it('entrée en waiting => waiting', () => {
    expect(soundForTransition('active', 'waiting')).toBe('waiting')
  })
  it('entrée en done => done', () => {
    expect(soundForTransition('active', 'done')).toBe('done')
  })
  it('pas de changement => null', () => {
    expect(soundForTransition('waiting', 'waiting')).toBeNull()
  })
  it('transition neutre => null', () => {
    expect(soundForTransition('starting', 'active')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- sound`
Expected: FAIL (`soundForTransition` absent).

- [ ] **Step 3: Implémenter `src/renderer/src/sound.ts`**
```ts
import type { SessionState } from '../../shared/ipc'

/** Quelle notification jouer pour une transition d'état (null = aucune). */
export function soundForTransition(prev: SessionState, next: SessionState): 'waiting' | 'done' | null {
  if (prev === next) return null
  if (next === 'waiting') return 'waiting'
  if (next === 'done') return 'done'
  return null
}

/** Joue une tonalité synthétique courte (Web Audio). Silencieux si indisponible. */
export function playSound(kind: 'waiting' | 'done'): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    const t = ctx.currentTime
    if (kind === 'waiting') {
      o.frequency.setValueAtTime(880, t)
      o.frequency.setValueAtTime(1175, t + 0.12)
    } else {
      o.frequency.setValueAtTime(440, t)
      o.frequency.exponentialRampToValueAtTime(220, t + 0.25)
    }
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    o.start(t)
    o.stop(t + 0.32)
    o.onended = () => ctx.close()
  } catch { /* audio indisponible */ }
}

const SOUND_KEY = 'difai.soundEnabled'

/** Lit la préférence son depuis localStorage (défaut: activé). */
export function readSoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'false' } catch { return true }
}

/** Persiste la préférence son. */
export function writeSoundEnabled(v: boolean): void {
  try { localStorage.setItem(SOUND_KEY, String(v)) } catch { /* ignore */ }
}
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- sound`
Expected: PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/src/sound.ts tests/sound.test.ts
git commit -m "feat(lot1): sound.ts (soundForTransition + playSound + persistance) + tests"
```

---

## Task 5 : Store Zustand multi-onglets (TDD, réécriture)

**Files:**
- Modify: `src/renderer/src/store.ts`
- Modify: `tests/store.test.ts`

- [ ] **Step 1: Réécrire `tests/store.test.ts`**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHub } from '../src/renderer/src/store'

const mkTab = (id: string) => ({
  id, title: id, cwd: 'C:/' + id, state: 'starting' as const,
  agents: [], openAgentId: null, railCollapsed: false
})

describe('store multi-onglets', () => {
  beforeEach(() => useHub.getState().reset())

  it('addTab ajoute et active l\'onglet', () => {
    useHub.getState().addTab(mkTab('t1'))
    expect(useHub.getState().tabs).toHaveLength(1)
    expect(useHub.getState().activeTabId).toBe('t1')
  })

  it('addTab ignore un doublon d\'id', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addTab(mkTab('t1'))
    expect(useHub.getState().tabs).toHaveLength(1)
  })

  it('removeTab réassigne activeTabId au dernier onglet restant', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addTab(mkTab('t2'))
    useHub.getState().removeTab('t2')
    expect(useHub.getState().tabs).toHaveLength(1)
    expect(useHub.getState().activeTabId).toBe('t1')
  })

  it('removeTab du dernier onglet => activeTabId null', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().removeTab('t1')
    expect(useHub.getState().activeTabId).toBeNull()
  })

  it('setTabState modifie le bon onglet', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addTab(mkTab('t2'))
    useHub.getState().setTabState('t2', 'waiting')
    expect(useHub.getState().tabs.find((t) => t.id === 't2')!.state).toBe('waiting')
    expect(useHub.getState().tabs.find((t) => t.id === 't1')!.state).toBe('starting')
  })

  it('addAgent / appendLines ciblent le bon onglet', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addAgent('t1', { id: 'a1', type: 'Explore', desc: '', lines: [] })
    useHub.getState().appendLines('t1', 'a1', [{ kind: 'tool', text: 'Glob' }])
    expect(useHub.getState().tabs[0].agents[0].lines).toEqual([{ kind: 'tool', text: 'Glob' }])
  })

  it('removeAgent ferme la console si l\'agent ouvert est retiré', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().addAgent('t1', { id: 'a1', type: 'x', desc: '', lines: [] })
    useHub.getState().openAgent('t1', 'a1')
    useHub.getState().removeAgent('t1', 'a1')
    expect(useHub.getState().tabs[0].agents).toHaveLength(0)
    expect(useHub.getState().tabs[0].openAgentId).toBeNull()
  })

  it('toggleRail bascule railCollapsed', () => {
    useHub.getState().addTab(mkTab('t1'))
    useHub.getState().toggleRail('t1')
    expect(useHub.getState().tabs[0].railCollapsed).toBe(true)
  })

  it('setSoundEnabled met à jour l\'état', () => {
    useHub.getState().setSoundEnabled(false)
    expect(useHub.getState().soundEnabled).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- store`
Expected: FAIL (API mono-onglet encore en place).

- [ ] **Step 3: Réécrire `src/renderer/src/store.ts`**
```ts
import { create } from 'zustand'
import type { ConsoleLine, SessionState } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
}

export interface TabState {
  id: string
  title: string
  cwd: string
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  railCollapsed: boolean
}

interface HubState {
  tabs: TabState[]
  activeTabId: string | null
  soundEnabled: boolean
  addTab: (tab: TabState) => void
  removeTab: (id: string) => void
  setActiveTab: (id: string) => void
  setTabState: (id: string, state: SessionState) => void
  addAgent: (id: string, agent: AgentView) => void
  appendLines: (id: string, agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (id: string, agentId: string) => void
  openAgent: (id: string, agentId: string | null) => void
  toggleRail: (id: string) => void
  setSoundEnabled: (v: boolean) => void
  reset: () => void
}

const initial = {
  tabs: [] as TabState[],
  activeTabId: null as string | null,
  soundEnabled: true
}

function patch(tabs: TabState[], id: string, fn: (t: TabState) => TabState): TabState[] {
  return tabs.map((t) => (t.id === id ? fn(t) : t))
}

export const useHub = create<HubState>((set) => ({
  ...initial,
  addTab: (tab) =>
    set((s) => (s.tabs.some((t) => t.id === tab.id) ? s : { tabs: [...s.tabs, tab], activeTabId: tab.id })),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeTabId =
        s.activeTabId === id ? (tabs.length ? tabs[tabs.length - 1].id : null) : s.activeTabId
      return { tabs, activeTabId }
    }),
  setActiveTab: (activeTabId) => set({ activeTabId }),
  setTabState: (id, state) => set((s) => ({ tabs: patch(s.tabs, id, (t) => ({ ...t, state })) })),
  addAgent: (id, agent) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) =>
        t.agents.some((a) => a.id === agent.id) ? t : { ...t, agents: [...t.agents, agent] }
      )
    })),
  appendLines: (id, agentId, lines) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) => ({
        ...t,
        agents: t.agents.map((a) => (a.id === agentId ? { ...a, lines: [...a.lines, ...lines] } : a))
      }))
    })),
  removeAgent: (id, agentId) =>
    set((s) => ({
      tabs: patch(s.tabs, id, (t) => ({
        ...t,
        agents: t.agents.filter((a) => a.id !== agentId),
        openAgentId: t.openAgentId === agentId ? null : t.openAgentId
      }))
    })),
  openAgent: (id, agentId) => set((s) => ({ tabs: patch(s.tabs, id, (t) => ({ ...t, openAgentId: agentId })) })),
  toggleRail: (id) => set((s) => ({ tabs: patch(s.tabs, id, (t) => ({ ...t, railCollapsed: !t.railCollapsed })) })),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  reset: () => set({ ...initial })
}))
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- store`
Expected: PASS. (Le typecheck global échouera tant que les composants ne sont pas adaptés — c'est attendu, ils le seront aux tâches 7-11.)

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(lot1): store Zustand multi-onglets (tabs[] + activeTabId + soundEnabled) + tests"
```

---

## Task 6 : CSS — onglets, états, header, layout (`index.html`)

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Remplacer entièrement le bloc `<style>...</style>` de `src/renderer/index.html` par :**
```html
    <style>
      html, body, #app { margin: 0; height: 100%; background: #1e1e1e; color: #ddd; font-family: Consolas, monospace; }
      #app-root { display: flex; flex-direction: column; height: 100%; }

      #header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #121212; border-bottom: 1px solid #333; }
      #header .brand { font-weight: bold; color: #7fd; }
      .sound-toggle { background: none; border: 1px solid #444; border-radius: 6px; color: #ddd; cursor: pointer; padding: 2px 8px; font-family: inherit; }

      .tabbar { display: flex; align-items: flex-end; gap: 5px; padding: 6px 8px 0; background: #181818; border-bottom: 1px solid #333; position: relative; min-height: 34px; }
      .tab { display: flex; align-items: center; gap: 6px; padding: 4px 9px; background: #1e1e1e; border: 1px solid #333; border-bottom: none; border-radius: 6px 6px 0 0; cursor: pointer; white-space: nowrap; font-size: 12px; }
      .tab.act { background: #23262b; border-color: #c80; }
      .tab-title { color: #ddd; }
      .tab-agents { color: #888; font-size: 11px; }
      .tab-close { color: #888; }
      .tab-close:hover { color: #f66; }
      .tab-new { position: relative; }
      .tab-new button { background: none; border: 1px dashed #444; border-radius: 6px; color: #9c9; cursor: pointer; padding: 3px 9px; font-family: inherit; }
      .tab-new-menu { position: absolute; top: 30px; left: 0; background: #202227; border: 1px solid #3a3d44; border-radius: 6px; overflow: hidden; width: 220px; z-index: 5; }
      .tab-new-menu div { padding: 6px 10px; cursor: pointer; }
      .tab-new-menu div:hover { background: #2a2d33; }

      .statedot { font-size: 10px; }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
      .blink { animation: blink 1s ease-in-out infinite; }
      @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
      .pulse { animation: pulse 1.4s ease-in-out infinite; }

      #workspace { flex: 1; min-height: 0; }
      .tabpane { height: 100%; }
      .term-wrap { display: flex; height: 100%; min-width: 0; }
      .term-area { flex: 1; min-width: 0; position: relative; display: flex; }
      .rails-toggle { position: absolute; top: 6px; right: 8px; z-index: 3; background: #1e1e1e; color: #888; border: 1px solid #444; border-radius: 6px; padding: 2px 8px; cursor: pointer; font-family: inherit; font-size: 11px; }

      .console { flex: 1; min-width: 0; border-left: 1px solid #333; overflow-y: auto; font-size: 12px; }
      .rail { width: 150px; border-left: 1px solid #333; overflow-y: auto; background: #181818; }
      .agent { position: relative; padding: 6px 8px; border-bottom: 1px solid #2a2a2a; cursor: pointer; font-size: 11px; }
      .agent:hover { background: #242424; }
      .agent.sel { background: #33291a; outline: 1px solid #c80; }
      .agent .type { color: #7fd; }
      .agent .desc { color: #aaa; }
      .aclose { position: absolute; top: 4px; right: 6px; font-size: 10px; opacity: 0; cursor: pointer; color: #888; user-select: none; }
      .agent:hover .aclose { opacity: 1; }
      .aclose:hover { color: #f66; }
      .cline { white-space: pre-wrap; line-height: 1.4; }
      .cline.tool { color: #fb7; }
      .cline.text { color: #cde; }
      .cline.prompt { color: #9c9; }
      .cline.result { color: #888; }
      .console-header { position: sticky; top: 0; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 8px; background: #1e1e1e; border-bottom: 1px solid #333; color: #7fd; font-size: 11px; }
      .console-body { padding: 6px 8px; }
      .cclose { cursor: pointer; color: #888; user-select: none; }
      .cclose:hover { color: #f66; }
    </style>
```

- [ ] **Step 2: Vérifier visuellement plus tard.** (Pas de test ; rendu validé au checkpoint Task 12.)

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/index.html
git commit -m "feat(lot1): CSS onglets/etats/header/layout + classes .console/.rail"
```

---

## Task 7 : Composants `StateDot` + `Header`

**Files:**
- Create: `src/renderer/src/components/StateDot.tsx`
- Create: `src/renderer/src/components/Header.tsx`

- [ ] **Step 1: Créer `src/renderer/src/components/StateDot.tsx`**
```tsx
import React from 'react'
import type { SessionState } from '../../../shared/ipc'

const META: Record<SessionState, { color: string; cls: string; glyph: string; label: string }> = {
  starting: { color: '#9cf', cls: 'pulse', glyph: '●', label: 'Démarrage…' },
  active: { color: '#7fd', cls: '', glyph: '●', label: 'Active' },
  waiting: { color: '#fb3', cls: 'blink', glyph: '●', label: 'Waiting' },
  done: { color: '#777', cls: '', glyph: '○', label: 'Terminée' }
}

export function StateDot({ state }: { state: SessionState }): React.JSX.Element {
  const m = META[state]
  return <span className={`statedot ${m.cls}`} title={m.label} style={{ color: m.color }}>{m.glyph}</span>
}

export function stateLabel(state: SessionState): string {
  return META[state].label
}
```

- [ ] **Step 2: Créer `src/renderer/src/components/Header.tsx`**
```tsx
import React from 'react'
import { useHub } from '../store'
import { writeSoundEnabled } from '../sound'

export function Header(): React.JSX.Element {
  const soundEnabled = useHub((s) => s.soundEnabled)
  const setSoundEnabled = useHub((s) => s.setSoundEnabled)

  function toggle(): void {
    const v = !soundEnabled
    setSoundEnabled(v)
    writeSoundEnabled(v)
  }

  return (
    <div id="header">
      <span className="brand">DIFAI-IDE</span>
      <button className="sound-toggle" title="Alerte sonore" onClick={toggle}>
        {soundEnabled ? '🔔' : '🔕'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: les erreurs restantes ne concernent QUE `App.tsx`/`Rail.tsx`/`Console.tsx` (encore en API mono-onglet, adaptés tâches 8-11). `StateDot.tsx`/`Header.tsx` ne doivent pas en produire.

- [ ] **Step 4: Commit**
```powershell
git add src/renderer/src/components/StateDot.tsx src/renderer/src/components/Header.tsx
git commit -m "feat(lot1): composants StateDot + Header (toggle son)"
```

---

## Task 8 : `Rail` + `Console` par `tabId`

**Files:**
- Modify: `src/renderer/src/components/Rail.tsx`
- Modify: `src/renderer/src/components/Console.tsx`

- [ ] **Step 1: Réécrire `src/renderer/src/components/Rail.tsx`**
```tsx
import React from 'react'
import { useHub } from '../store'

export function Rail({ tabId }: { tabId: string }): React.JSX.Element | null {
  const tab = useHub((s) => s.tabs.find((t) => t.id === tabId))
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)
  if (!tab) return null

  return (
    <div className="rail">
      {tab.agents.map((a) => (
        <div
          key={a.id}
          className={`agent${a.id === tab.openAgentId ? ' sel' : ''}`}
          onClick={() => open(tabId, a.id)}
        >
          <span className="aclose" title="Retirer" onClick={(e) => { e.stopPropagation(); remove(tabId, a.id) }}>✕</span>
          <div className="type">▸ {a.type}</div>
          <div className="desc">{a.desc.slice(0, 60)}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Réécrire `src/renderer/src/components/Console.tsx`**
```tsx
import React, { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console({ tabId }: { tabId: string }): React.JSX.Element | null {
  const tab = useHub((s) => s.tabs.find((t) => t.id === tabId))
  const close = useHub((s) => s.openAgent)
  const bodyRef = useRef<HTMLDivElement>(null)
  const agent = tab?.agents.find((a) => a.id === tab.openAgentId) ?? null

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!tab || !agent) return null

  return (
    <div className="console">
      <div className="console-header">
        <span>▸ {agent.type} — {agent.desc.slice(0, 50)}</span>
        <span className="cclose" title="Fermer la console" onClick={() => close(tabId, null)}>✕</span>
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

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: erreurs restantes uniquement dans `App.tsx` (adapté Task 11).

- [ ] **Step 4: Commit**
```powershell
git add src/renderer/src/components/Rail.tsx src/renderer/src/components/Console.tsx
git commit -m "feat(lot1): Rail + Console indexes par tabId (classes .rail/.console)"
```

---

## Task 9 : Composant `Workspace`

**Files:**
- Create: `src/renderer/src/components/Workspace.tsx`

- [ ] **Step 1: Créer `src/renderer/src/components/Workspace.tsx`**
```tsx
import React from 'react'
import { useHub } from '../store'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { Rail } from './Rail'

export function Workspace(): React.JSX.Element {
  const tabs = useHub((s) => s.tabs)
  const activeTabId = useHub((s) => s.activeTabId)
  const toggleRail = useHub((s) => s.toggleRail)

  return (
    <div id="workspace">
      {tabs.map((t) => (
        <div key={t.id} className="tabpane" style={{ display: t.id === activeTabId ? 'block' : 'none' }}>
          <div className="term-wrap">
            <div className="term-area">
              <button className="rails-toggle" onClick={() => toggleRail(t.id)}>
                {t.railCollapsed ? '› Rails' : '‹ Rails'}
              </button>
              <Terminal tabId={t.id} />
            </div>
            <Console tabId={t.id} />
            {!t.railCollapsed && <Rail tabId={t.id} />}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: erreurs restantes uniquement dans `App.tsx` (adapté Task 11).

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/Workspace.tsx
git commit -m "feat(lot1): Workspace (une fenetre terminal/console/rail par onglet, actif visible)"
```

---

## Task 10 : Composant `TabBar` (+ menu ＋)

**Files:**
- Create: `src/renderer/src/components/TabBar.tsx`

- [ ] **Step 1: Créer `src/renderer/src/components/TabBar.tsx`**
```tsx
import React, { useState } from 'react'
import { useHub, type TabState } from '../store'
import { StateDot } from './StateDot'
import { basename } from '../util'

export function TabBar(): React.JSX.Element {
  const tabs = useHub((s) => s.tabs)
  const activeTabId = useHub((s) => s.activeTabId)
  const setActiveTab = useHub((s) => s.setActiveTab)
  const removeTab = useHub((s) => s.removeTab)
  const addTab = useHub((s) => s.addTab)
  const [menuOpen, setMenuOpen] = useState(false)

  async function openTab(cwd: string): Promise<void> {
    const id = await window.hub.newSession(cwd)
    const tab: TabState = { id, title: basename(cwd), cwd, state: 'starting', agents: [], openAgentId: null, railCollapsed: false }
    addTab(tab)
    setMenuOpen(false)
  }

  async function onDefault(): Promise<void> {
    openTab(await window.hub.defaultCwd())
  }
  async function onPick(): Promise<void> {
    const folder = await window.hub.pickFolder()
    if (folder) openTab(folder)
    else setMenuOpen(false)
  }
  function close(e: React.MouseEvent, id: string): void {
    e.stopPropagation()
    window.hub.killSession(id)
    removeTab(id)
  }

  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div key={t.id} className={`tab${t.id === activeTabId ? ' act' : ''}`} onClick={() => setActiveTab(t.id)}>
          <StateDot state={t.state} />
          <span className="tab-title">{t.title}</span>
          <span className="tab-agents">· {t.agents.length} agents</span>
          <span className="tab-close" title="Fermer l'onglet" onClick={(e) => close(e, t.id)}>✕</span>
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
Expected: erreurs restantes uniquement dans `App.tsx` (adapté Task 11).

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/TabBar.tsx
git commit -m "feat(lot1): TabBar + menu nouvel onglet (dossier defaut / choisir)"
```

---

## Task 11 : `App.tsx` — boot multi-onglets + câblage IPC global + son

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Réécrire entièrement `src/renderer/src/App.tsx`**
```tsx
import React, { useEffect } from 'react'
import { useHub } from './store'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { Workspace } from './components/Workspace'
import { basename } from './util'
import { soundForTransition, playSound, readSoundEnabled } from './sound'
import type { Unsub } from '../../shared/ipc'

export function App(): React.JSX.Element {
  useEffect(() => {
    useHub.getState().setSoundEnabled(readSoundEnabled())

    const unsubs: Unsub[] = []
    unsubs.push(window.hub.onSessionState((tid, state) => {
      const prev = useHub.getState().tabs.find((t) => t.id === tid)?.state
      useHub.getState().setTabState(tid, state)
      if (prev) {
        const snd = soundForTransition(prev, state)
        if (snd && useHub.getState().soundEnabled) playSound(snd)
      }
    }))
    unsubs.push(window.hub.onAgentAdded((tid, agentId, type, desc) => {
      useHub.getState().addAgent(tid, { id: agentId, type, desc, lines: [] })
    }))
    unsubs.push(window.hub.onAgentLines((tid, agentId, lines) => {
      useHub.getState().appendLines(tid, agentId, lines)
    }))

    let active = true
    window.hub.defaultCwd().then((cwd) => {
      if (!active) return
      window.hub.newSession(cwd).then((id) => {
        if (!active) return
        useHub.getState().addTab({
          id, title: basename(cwd), cwd, state: 'starting', agents: [], openAgentId: null, railCollapsed: false
        })
      })
    })

    return () => {
      active = false
      unsubs.forEach((u) => u())
    }
  }, [])

  return (
    <div id="app-root">
      <Header />
      <TabBar />
      <Workspace />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: **0 erreur** (toute la chaîne est désormais cohérente).

- [ ] **Step 3: Tests complets.** Run: `npm test`
Expected: tous verts.

- [ ] **Step 4: Commit**
```powershell
git add src/renderer/src/App.tsx
git commit -m "feat(lot1): App multi-onglets (boot + cablage IPC global par tabId + son)"
```

---

## Task 12 : Checkpoint humain — multi-onglets en conditions réelles

- [ ] **Step 1: Build de contrôle.** Run: `npm run build`
Expected: build OK (main + preload + renderer).

- [ ] **Step 2: Lancer l'app.** Run: `npm run dev`

Expected (**Daniel valide**) :
- En-tête « DIFAI-IDE » + toggle son ; un premier onglet s'ouvre automatiquement (dossier par défaut).
- **＋** → menu « Dossier par défaut » / « Choisir un dossier… » ; « Choisir un dossier… » ouvre le sélecteur Windows et ouvre un **nouvel onglet** sur le dossier choisi.
- Plusieurs onglets coexistent ; **clic** sur un onglet bascule sa fenêtre (terminal interactif, copier/coller OK) ; les sessions inactives **restent vivantes** (le terminal garde son contenu au retour).
- **Indicateur d'état** par onglet : Démarrage (bleu pulse) → Active (vert) → Waiting (orange **clignotant**) → Terminée (gris). Badge `· N agents` qui s'incrémente quand des agents sont dispatchés.
- **Sons** : un bip au passage en Waiting, un autre en Terminée ; le toggle 🔔/🔕 les coupe/réactive et l'état est **conservé après redémarrage** de l'app.
- **‹ Rails** replie/déplie le rail de l'onglet courant ; le rail + console live des agents fonctionnent par onglet.
- **✕** sur un onglet ferme la session et retire l'onglet ; si c'était l'actif, un voisin devient actif.
- Pas d'erreur en console DevTools ; pas de terminal rendu « sur 1 colonne » au retour sur un onglet.

- [ ] **Step 2b (si besoin) : ajustements** (ex. refit terminal au changement d'onglet, déblocage AudioContext au 1er geste) selon retour, puis commit.

- [ ] **Step 3: Commit de clôture**
```powershell
git add -A
git commit -m "chore(lot1): multi-onglets valide (checkpoint)"
```

---

## Self-review (avant clôture Lot 1)

- **Couverture spec :** multi-sessions vivantes (Workspace, tâche 9) ✓ ; navigation (TabBar setActiveTab, 10) ✓ ; ＋ avec menu défaut/choisir (TabBar + IPC PickFolder/DefaultCwd, 1/2/10) ✓ ; fermeture ✕ = kill+remove (10) ✓ ; indicateur d'état (StateDot, 7) ✓ ; 2 sons sur transition + toggle persisté (sound 4, Header 7, App 11) ✓ ; en-tête (Header 7) ✓ ; rail repliable par onglet (Workspace 9, store 5) ✓.
- **Placeholders :** aucun — code complet à chaque étape (le seul point « conditionnel » est l'ajustement 12.2b, explicitement un checkpoint).
- **Cohérence des types :** `TabState`/`AgentView` définis store (5) et consommés par Rail/Console (8), Workspace (9), TabBar (10), App (11) ; signatures store par `(id, …)` cohérentes partout ; `SessionState` partagé (`src/shared/ipc.ts`) utilisé par StateDot/sound ; `HubApi.pickFolder/defaultCwd` (1) implémentés preload (1) et consommés TabBar/App (10/11) ; canaux `IPC.PickFolder/DefaultCwd` (1) câblés sessionModule (2). Note corrigée en 11.1 : ne pas importer `TabState` depuis `shared/ipc` (il vit dans `store`).
- **Classes CSS :** `.console`/`.rail` (remplacent les anciens `#console`/`#rail`) cohérentes entre CSS (6) et composants (8) ; `.blink`/`.pulse` (6) utilisées par StateDot (7) ; `.tab*`, `#header`, `.term-area`, `.rails-toggle` (6) utilisées par TabBar/Header/Workspace (7/9/10).

## Limites connues (hors Lot 1)

- Pas de sidebar/groupes/persistance d'arborescence (Lot 2) ; fermer un onglet termine la session (pas de conservation d'item).
- `defaultCwd = process.cwd()` (dossier de lancement) ; le choix mémorisé par projet vient au Lot 2.
- Pas de réglage de thème ni de fermeture propre avec modale (Lot 3).
