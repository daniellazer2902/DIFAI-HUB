# DIFAI-HUB V1-D.0 — Durcissement architecture (IPC typé + modules main + socle React/Zustand)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe checkbox (`- [ ]`).

**Goal:** Poser les 3 piliers structurants qui permettent à plusieurs modules de coexister proprement, AVANT d'empiler les fonctionnalités : (A) un contrat IPC typé centralisé, (B) une architecture en modules côté main (registre + contexte), (C) un socle UI React + Zustand côté renderer — sans régression du comportement V1-C.

**Architecture:**
- **A — Contrat IPC** : un seul fichier `src/shared/ipc.ts` détient les noms de canaux, les types de payloads partagés et l'interface `HubApi` que le preload implémente et que le renderer consomme. Fini les strings magiques dupliquées.
- **B — Modules main** : `PtyManager` et `HookServer` passent en multi-listeners (plusieurs modules peuvent réagir). Un `AppContext` expose les services partagés + un `Sender` abstrait (remplace `mainWindow` global). Chaque feature est un `HubModule { register(ctx) }`. `index.ts` devient un simple bootstrap qui enregistre les modules.
- **C — Renderer React/Zustand** : un store Zustand détient l'état (session, agents, console ouverte) ; des composants React (`Terminal`, `Rail`, `Console`, `App`) remplacent la manipulation DOM manuelle. Les abonnements IPC retournent un `Unsub` (corrige la fuite de listeners actuelle).

**Tech Stack:** TypeScript, Electron, electron-vite, node-pty, @xterm/xterm, chokidar, **React 18**, **Zustand**, **@vitejs/plugin-react**, Vitest.

**Branche:** `feat/poc-derisquage`.

**Invariant de non-régression (vérifié au checkpoint C.7) :** l'app lance toujours une vraie session `claude`, corrèle la session, affiche les agents dispatchés dans le rail et leur console live — exactement comme en fin de V1-C.

---

## Pilier A — Contrat IPC typé centralisé

### Task A.1 : Fichier de contrat partagé `src/shared/ipc.ts`

**Files:**
- Create: `src/shared/ipc.ts`

- [ ] **Step 1: Créer `src/shared/ipc.ts`**

```ts
// Source de vérité unique des canaux IPC + types partagés main/preload/renderer.

export const IPC = {
  // renderer -> main
  SessionNew: 'session:new',
  SessionInput: 'session:input',
  SessionResize: 'session:resize',
  SessionKill: 'session:kill',
  // main -> renderer
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  SessionState: 'session:state',
  AgentAdded: 'agent:added',
  AgentLines: 'agent:lines'
} as const

export type ConsoleLineKind = 'prompt' | 'text' | 'tool' | 'result'
export interface ConsoleLine {
  kind: ConsoleLineKind
  text: string
}

export type SessionState = 'starting' | 'active' | 'waiting' | 'done'

/** Fonction de désabonnement renvoyée par tous les `on*` (évite les fuites de listeners). */
export type Unsub = () => void

/** Contrat exposé au renderer via contextBridge. Le preload l'implémente, le renderer le consomme. */
export interface HubApi {
  newSession(cwd: string): Promise<string>
  sendInput(tabId: string, data: string): void
  resize(tabId: string, cols: number, rows: number): void
  killSession(tabId: string): void
  onData(cb: (tabId: string, data: string) => void): Unsub
  onExit(cb: (tabId: string, code: number) => void): Unsub
  onSessionState(cb: (tabId: string, state: SessionState) => void): Unsub
  onAgentAdded(cb: (tabId: string, agentId: string, agentType: string, description: string) => void): Unsub
  onAgentLines(cb: (tabId: string, agentId: string, lines: ConsoleLine[]) => void): Unsub
}
```

- [ ] **Step 2: Faire pointer `transcriptParser` vers le type partagé** (évite la duplication de `ConsoleLine`).

Dans `src/main/transcriptParser.ts`, remplacer les deux lignes de tête :
```ts
export type ConsoleLineKind = 'prompt' | 'text' | 'tool' | 'result'
export interface ConsoleLine { kind: ConsoleLineKind; text: string }
```
par :
```ts
import type { ConsoleLine, ConsoleLineKind } from '../shared/ipc'
export type { ConsoleLine, ConsoleLineKind }
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 erreur (les imports existants de `ConsoleLine` depuis `./transcriptParser` restent valides via le ré-export).

- [ ] **Step 4: Lancer les tests existants.** Run: `npm test`
Expected: PASS (30 tests verts, aucune régression).

- [ ] **Step 5: Commit**
```powershell
git add src/shared/ipc.ts src/main/transcriptParser.ts
git commit -m "feat(v1d0): contrat IPC type centralise (src/shared/ipc.ts)"
```

---

### Task A.2 : Preload typé qui implémente `HubApi` (avec désabonnement)

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/api.d.ts`

- [ ] **Step 1: Réécrire `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type HubApi, type Unsub } from '../shared/ipc'

/** Abonne un canal et renvoie un désabonnement (retire le bon listener). */
function on(channel: string, handler: (...args: unknown[]) => void): Unsub {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]): void => handler(...args)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

const hub: HubApi = {
  newSession: (cwd) => ipcRenderer.invoke(IPC.SessionNew, cwd),
  sendInput: (tabId, data) => ipcRenderer.send(IPC.SessionInput, tabId, data),
  resize: (tabId, cols, rows) => ipcRenderer.send(IPC.SessionResize, tabId, cols, rows),
  killSession: (tabId) => ipcRenderer.send(IPC.SessionKill, tabId),
  onData: (cb) => on(IPC.PtyData, (tabId, data) => cb(tabId as string, data as string)),
  onExit: (cb) => on(IPC.PtyExit, (tabId, code) => cb(tabId as string, code as number)),
  onSessionState: (cb) => on(IPC.SessionState, (tabId, state) => cb(tabId as string, state as never)),
  onAgentAdded: (cb) =>
    on(IPC.AgentAdded, (tabId, agentId, type, desc) =>
      cb(tabId as string, agentId as string, type as string, desc as string)),
  onAgentLines: (cb) =>
    on(IPC.AgentLines, (tabId, agentId, lines) => cb(tabId as string, agentId as string, lines as never))
}

contextBridge.exposeInMainWorld('hub', hub)
```

- [ ] **Step 2: Réécrire `src/preload/api.d.ts`** (le type global pointe désormais vers le contrat partagé)

```ts
import type { HubApi } from '../shared/ipc'

declare global {
  interface Window {
    hub: HubApi
  }
}
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Commit**
```powershell
git add src/preload/index.ts src/preload/api.d.ts
git commit -m "feat(v1d0): preload type (HubApi) + desabonnement des listeners"
```

---

## Pilier B — Modules côté main

### Task B.1 : `PtyManager` multi-listeners (onData/onExit renvoient un Unsub)

**Files:**
- Modify: `src/main/PtyManager.ts`
- Test: `tests/ptyManager.test.ts`

**Pourquoi :** aujourd'hui `onData`/`onExit` écrasent un callback unique (`this.dataCb = cb`). Pour que plusieurs modules réagissent à la sortie d'un pty (ex. le module agents doit arrêter le watcher), il faut plusieurs abonnés.

- [ ] **Step 1: Écrire le test qui échoue `tests/ptyManager.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { PtyManager, type PtyProcess, type SpawnOptions } from '../src/main/PtyManager'

function fakeSpawn() {
  const handlers: { data?: (d: string) => void; exit?: (e: { exitCode: number }) => void } = {}
  const proc: PtyProcess = {
    write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    onData: (cb) => { handlers.data = cb },
    onExit: (cb) => { handlers.exit = cb }
  }
  const spawn = (_f: string, _a: string[], _o: SpawnOptions): PtyProcess => proc
  return { spawn, handlers }
}

describe('PtyManager multi-listeners', () => {
  it('diffuse onExit à TOUS les abonnés', () => {
    const { spawn, handlers } = fakeSpawn()
    const m = new PtyManager({ spawn, claudePath: 'claude' })
    const a = vi.fn(); const b = vi.fn()
    m.onExit(a); m.onExit(b)
    m.create('C:/x')
    handlers.exit?.({ exitCode: 0 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('onData renvoie un Unsub qui retire le listener', () => {
    const { spawn, handlers } = fakeSpawn()
    const m = new PtyManager({ spawn, claudePath: 'claude' })
    const a = vi.fn()
    const unsub = m.onData(a)
    m.create('C:/x')
    handlers.data?.('hello')
    unsub()
    handlers.data?.('world')
    expect(a).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(expect.any(String), 'hello')
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- ptyManager`
Expected: FAIL (`onExit` n'accepte qu'un seul callback / pas de retour Unsub).

- [ ] **Step 3: Modifier `src/main/PtyManager.ts`**

Remplacer les deux champs callback et leurs setters :
```ts
  private dataCb: (tabId: string, data: string) => void = () => {}
  private exitCb: (tabId: string, exitCode: number) => void = () => {}
```
```ts
  onData(cb: (tabId: string, data: string) => void): void { this.dataCb = cb }
  onExit(cb: (tabId: string, exitCode: number) => void): void { this.exitCb = cb }
```
par des ensembles de listeners renvoyant un `Unsub` :
```ts
  private readonly dataCbs = new Set<(tabId: string, data: string) => void>()
  private readonly exitCbs = new Set<(tabId: string, exitCode: number) => void>()
```
```ts
  onData(cb: (tabId: string, data: string) => void): () => void {
    this.dataCbs.add(cb)
    return () => { this.dataCbs.delete(cb) }
  }
  onExit(cb: (tabId: string, exitCode: number) => void): () => void {
    this.exitCbs.add(cb)
    return () => { this.exitCbs.delete(cb) }
  }
```
Et dans `create`, remplacer les appels :
```ts
    pty.onData((data) => this.dataCb(tabId, data))
    pty.onExit(({ exitCode }) => {
      this.exitCb(tabId, exitCode)
      this.ptys.delete(tabId)
    })
```
par :
```ts
    pty.onData((data) => { for (const cb of this.dataCbs) cb(tabId, data) })
    pty.onExit(({ exitCode }) => {
      for (const cb of this.exitCbs) cb(tabId, exitCode)
      this.ptys.delete(tabId)
    })
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- ptyManager`
Expected: PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/main/PtyManager.ts tests/ptyManager.test.ts
git commit -m "feat(v1d0): PtyManager multi-listeners (onData/onExit -> Unsub) + tests"
```

---

### Task B.2 : `HookServer` avec abonnement multi-listeners

**Files:**
- Modify: `src/main/HookServer.ts`
- Modify: `src/main/index.ts` (adaptation provisoire — sera réécrit en B.6)
- Test: `tests/hookServer.test.ts`

**Pourquoi :** `HookServer` reçoit aujourd'hui son `onEvent` dans le constructeur (un seul consommateur). Pour que des modules s'abonnent après construction, on expose `onEvent(cb): Unsub`.

- [ ] **Step 1: Écrire le test qui échoue `tests/hookServer.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { HookServer } from '../src/main/HookServer'

describe('HookServer.onEvent', () => {
  it('s\'abonne après construction et reçoit les events dispatchés', () => {
    const srv = new HookServer()
    const seen: unknown[] = []
    srv.onEvent((e) => seen.push(e))
    // dispatch interne testable sans réseau :
    srv.dispatch({ hook_event_name: 'SessionStart', tabId: 't1' })
    expect(seen).toEqual([{ hook_event_name: 'SessionStart', tabId: 't1' }])
  })

  it('Unsub retire le listener', () => {
    const srv = new HookServer()
    const cb = vi.fn()
    const unsub = srv.onEvent(cb)
    unsub()
    srv.dispatch({ any: 1 })
    expect(cb).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- hookServer`
Expected: FAIL (`onEvent`/`dispatch` absents).

- [ ] **Step 3: Réécrire `src/main/HookServer.ts`**

```ts
import { createServer, type Server } from 'node:http'
import type { Unsub } from '../shared/ipc'

/** Mini-serveur HTTP local : reçoit les POST des hooks et les diffuse aux abonnés. */
export class HookServer {
  private server: Server | null = null
  private boundPort = 0
  private readonly listeners = new Set<(event: unknown) => void>()

  onEvent(cb: (event: unknown) => void): Unsub {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  /** Diffuse un event à tous les abonnés (appelé par le serveur HTTP, et exposé pour les tests). */
  dispatch(event: unknown): void {
    for (const cb of this.listeners) cb(event)
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        if (req.method !== 'POST') { res.writeHead(404); res.end(); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try { this.dispatch(JSON.parse(body)) } catch { /* body non-JSON : ignore */ }
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('ok')
        })
      })
      this.server.on('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address()
        this.boundPort = addr && typeof addr === 'object' ? addr.port : 0
        resolve(this.boundPort)
      })
    })
  }

  get port(): number { return this.boundPort }

  stop(): void {
    this.server?.close()
    this.server = null
    this.listeners.clear()
  }
}
```

- [ ] **Step 4: Adapter `src/main/index.ts` provisoirement** pour compiler (sera entièrement réécrit en B.6).

Remplacer :
```ts
const hookServer = new HookServer((e) => {
```
par une construction sans argument + abonnement :
```ts
const hookServer = new HookServer()
hookServer.onEvent((e) => {
```
(le corps de la closure `{ ... }` et sa parenthèse de fin restent inchangés.)

- [ ] **Step 5: Lancer → succès + typecheck.**
Run: `npm test -- hookServer` → PASS
Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur

- [ ] **Step 6: Commit**
```powershell
git add src/main/HookServer.ts src/main/index.ts tests/hookServer.test.ts
git commit -m "feat(v1d0): HookServer.onEvent multi-listeners + dispatch testable"
```

---

### Task B.3 : `AppContext` + type `HubModule` + `WindowSender`

**Files:**
- Create: `src/main/AppContext.ts`
- Create: `src/main/WindowSender.ts`
- Test: `tests/windowSender.test.ts`

- [ ] **Step 1: Créer `src/main/AppContext.ts`**

```ts
import type { IpcMain } from 'electron'
import type { PtyManager } from './PtyManager'
import type { SessionRegistry } from './SessionRegistry'
import type { HookServer } from './HookServer'

/** Abstraction d'envoi vers le renderer (découple les modules de BrowserWindow). */
export interface Sender {
  send(channel: string, ...args: unknown[]): void
}

/** Services partagés injectés à chaque module au moment du register(). */
export interface AppContext {
  ipc: IpcMain
  sender: Sender
  pty: PtyManager
  registry: SessionRegistry
  hookServer: HookServer
  /** Chemin du settings de hooks (lu paresseusement : connu seulement après app.whenReady). */
  hooksSettingsPath: () => string
}

/** Une feature autonome qui câble ses services + ses canaux IPC. */
export interface HubModule {
  name: string
  register(ctx: AppContext): void
}
```

- [ ] **Step 2: Écrire le test qui échoue `tests/windowSender.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { WindowSender } from '../src/main/WindowSender'

function fakeWin(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() }
  }
}

describe('WindowSender', () => {
  it('envoie au webContents de la fenêtre courante', () => {
    const win = fakeWin()
    const s = new WindowSender()
    s.setWindow(win as never)
    s.send('chan', 'a', 1)
    expect(win.webContents.send).toHaveBeenCalledWith('chan', 'a', 1)
  })

  it('ne fait rien si aucune fenêtre', () => {
    const s = new WindowSender()
    expect(() => s.send('chan', 'x')).not.toThrow()
  })

  it('ne fait rien si la fenêtre est détruite', () => {
    const win = fakeWin(true)
    const s = new WindowSender()
    s.setWindow(win as never)
    s.send('chan', 'x')
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Lancer → échec.** Run: `npm test -- windowSender`
Expected: FAIL (`WindowSender` absent).

- [ ] **Step 4: Créer `src/main/WindowSender.ts`**

```ts
import type { BrowserWindow } from 'electron'
import type { Sender } from './AppContext'

/** Sender concret : route les events vers la fenêtre courante si elle est vivante. */
export class WindowSender implements Sender {
  private win: BrowserWindow | null = null

  setWindow(win: BrowserWindow | null): void { this.win = win }

  send(channel: string, ...args: unknown[]): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send(channel, ...args)
  }
}
```

- [ ] **Step 5: Lancer → succès.** Run: `npm test -- windowSender`
Expected: PASS.

- [ ] **Step 6: Commit**
```powershell
git add src/main/AppContext.ts src/main/WindowSender.ts tests/windowSender.test.ts
git commit -m "feat(v1d0): AppContext + HubModule + WindowSender (Sender abstrait) + tests"
```

---

### Task B.4 : Module `session`

**Files:**
- Create: `src/main/modules/sessionModule.ts`
- Test: `tests/sessionModule.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/sessionModule.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createSessionModule } from '../src/main/modules/sessionModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ons = new Map<string, (...a: unknown[]) => void>()
  const ctx = {
    ipc: {
      handle: (c: string, h: (...a: unknown[]) => unknown) => handlers.set(c, h),
      on: (c: string, h: (...a: unknown[]) => void) => ons.set(c, h)
    },
    sender: { send: vi.fn() },
    pty: { onData: vi.fn(() => () => {}), onExit: vi.fn(() => () => {}), create: vi.fn(() => 'tab-1'), write: vi.fn(), resize: vi.fn(), kill: vi.fn() },
    registry: { register: vi.fn(), setState: vi.fn() },
    hookServer: { port: 4242 },
    hooksSettingsPath: () => 'C:/settings.json'
  } as unknown as AppContext
  return { ctx, handlers, ons }
}

describe('sessionModule', () => {
  it('session:new crée un pty avec --settings + DIFAI_HUB_PORT et enregistre la session', () => {
    const { ctx, handlers } = fakeCtx()
    createSessionModule().register(ctx)
    const tabId = handlers.get(IPC.SessionNew)!({}, 'C:/proj')
    expect(tabId).toBe('tab-1')
    expect(ctx.pty.create).toHaveBeenCalledWith('C:/proj', {
      args: ['--settings', 'C:/settings.json'],
      env: { DIFAI_HUB_PORT: '4242' }
    })
    expect(ctx.registry.register).toHaveBeenCalledWith('tab-1', 'C:/proj')
  })

  it('session:input écrit dans le pty', () => {
    const { ctx, ons } = fakeCtx()
    createSessionModule().register(ctx)
    ons.get(IPC.SessionInput)!({}, 'tab-1', 'ls')
    expect(ctx.pty.write).toHaveBeenCalledWith('tab-1', 'ls')
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- sessionModule`
Expected: FAIL (`createSessionModule` absent).

- [ ] **Step 3: Créer `src/main/modules/sessionModule.ts`**

```ts
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'

/** Cycle de vie du terminal : création de session, I/O, resize, kill, et flux pty -> renderer. */
export function createSessionModule(): HubModule {
  return {
    name: 'session',
    register(ctx: AppContext): void {
      ctx.pty.onData((tabId, data) => ctx.sender.send(IPC.PtyData, tabId, data))
      ctx.pty.onExit((tabId, code) => {
        ctx.registry.setState(tabId, 'done')
        ctx.sender.send(IPC.SessionState, tabId, 'done')
        ctx.sender.send(IPC.PtyExit, tabId, code)
      })

      ctx.ipc.handle(IPC.SessionNew, (_e, cwd: string) => {
        const tabId = ctx.pty.create(cwd, {
          args: ['--settings', ctx.hooksSettingsPath()],
          env: { DIFAI_HUB_PORT: String(ctx.hookServer.port) }
        })
        ctx.registry.register(tabId, cwd)
        return tabId
      })
      ctx.ipc.on(IPC.SessionInput, (_e, tabId: string, data: string) => ctx.pty.write(tabId, data))
      ctx.ipc.on(IPC.SessionResize, (_e, tabId: string, cols: number, rows: number) => ctx.pty.resize(tabId, cols, rows))
      ctx.ipc.on(IPC.SessionKill, (_e, tabId: string) => ctx.pty.kill(tabId))
    }
  }
}
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- sessionModule`
Expected: PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/main/modules/sessionModule.ts tests/sessionModule.test.ts
git commit -m "feat(v1d0): module session (pty I/O + IPC) extrait + tests"
```

---

### Task B.5 : Module `agents`

**Files:**
- Create: `src/main/modules/agentsModule.ts`
- Test: `tests/agentsModule.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/agentsModule.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createAgentsModule } from '../src/main/modules/agentsModule'
import { IPC } from '../src/shared/ipc'
import type { AppContext } from '../src/main/AppContext'

function fakeCtx() {
  let hookCb: (e: unknown) => void = () => {}
  let exitCb: (tabId: string, code: number) => void = () => {}
  const registryState = { tabId: 't1', cwd: 'C:/p', sessionId: null as string | null, transcriptPath: null as string | null, state: 'starting' }
  const ctx = {
    ipc: { handle: vi.fn(), on: vi.fn() },
    sender: { send: vi.fn() },
    pty: { onExit: (cb: (t: string, c: number) => void) => { exitCb = cb; return () => {} } },
    registry: {
      get: () => registryState,
      correlate: vi.fn((_t, sid, tp) => { registryState.sessionId = sid; registryState.transcriptPath = tp; registryState.state = 'active' }),
      setState: vi.fn((_t, s) => { registryState.state = s })
    },
    hookServer: { onEvent: (cb: (e: unknown) => void) => { hookCb = cb; return () => {} } },
    hooksSettingsPath: () => ''
  } as unknown as AppContext
  return { ctx, fire: (e: unknown) => hookCb(e), exit: (t: string, c: number) => exitCb(t, c), registryState }
}

describe('agentsModule', () => {
  it('pousse l\'état de session au renderer sur event de hook', () => {
    const { ctx, fire } = fakeCtx()
    createAgentsModule().register(ctx)
    fire({ hook_event_name: 'SessionStart', tabId: 't1', session_id: 's1', transcript_path: 'C:/p/s1.jsonl' })
    expect(ctx.sender.send).toHaveBeenCalledWith(IPC.SessionState, 't1', 'active')
  })

  it('ignore proprement un exit pour un tab sans watcher', () => {
    const { ctx, exit } = fakeCtx()
    createAgentsModule().register(ctx)
    expect(() => exit('t-inconnu', 0)).not.toThrow()
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- agentsModule`
Expected: FAIL (`createAgentsModule` absent).

- [ ] **Step 3: Créer `src/main/modules/agentsModule.ts`**

```ts
import { IPC } from '../../shared/ipc'
import { TranscriptWatcher } from '../TranscriptWatcher'
import { applyHookEvent, type HookEvent } from '../hookEvents'
import type { AppContext, HubModule } from '../AppContext'

/** Corrélation session via hooks, démarrage des watchers, et flux agents -> renderer. */
export function createAgentsModule(): HubModule {
  const watchers = new Map<string, TranscriptWatcher>()

  return {
    name: 'agents',
    register(ctx: AppContext): void {
      ctx.hookServer.onEvent((raw) => {
        const event = raw as HookEvent
        applyHookEvent(ctx.registry, event)
        const tabId = event.tabId
        if (!tabId) return
        const s = ctx.registry.get(tabId)
        if (s) ctx.sender.send(IPC.SessionState, tabId, s.state)

        if (event.hook_event_name === 'SessionStart' && s?.sessionId && s.transcriptPath && !watchers.has(tabId)) {
          const w = new TranscriptWatcher({
            onAgentAdded: (agentId, meta) =>
              ctx.sender.send(IPC.AgentAdded, tabId, agentId, meta.agentType, meta.description),
            onAgentLines: (agentId, lines) =>
              ctx.sender.send(IPC.AgentLines, tabId, agentId, lines)
          })
          w.watch(s.transcriptPath, s.sessionId)
          watchers.set(tabId, w)
        }
      })

      ctx.pty.onExit((tabId) => {
        watchers.get(tabId)?.stop()
        watchers.delete(tabId)
      })
    }
  }
}
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- agentsModule`
Expected: PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/main/modules/agentsModule.ts tests/agentsModule.test.ts
git commit -m "feat(v1d0): module agents (hooks + watchers + flux agents) extrait + tests"
```

---

### Task B.6 : Réécrire `src/main/index.ts` en bootstrap de modules

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Réécrire entièrement `src/main/index.ts`**

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'
import { SessionRegistry } from './SessionRegistry'
import { HookServer } from './HookServer'
import { writeHooksSettings } from './hubHooks'
import { WindowSender } from './WindowSender'
import type { AppContext, HubModule } from './AppContext'
import { createSessionModule } from './modules/sessionModule'
import { createAgentsModule } from './modules/agentsModule'

let mainWindow: BrowserWindow | null = null
let hooksSettingsPath = ''

const registry = new SessionRegistry()
const hookServer = new HookServer()
const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })
const sender = new WindowSender()

const ctx: AppContext = {
  ipc: ipcMain,
  sender,
  pty: ptyManager,
  registry,
  hookServer,
  hooksSettingsPath: () => hooksSettingsPath
}

const modules: HubModule[] = [createSessionModule(), createAgentsModule()]
for (const m of modules) m.register(ctx)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  sender.setWindow(win)

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => { mainWindow = null; sender.setWindow(null) })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  const port = await hookServer.start()
  const forwardScript = join(app.getAppPath(), 'resources', 'hooks', 'hook-forward.mjs')
  hooksSettingsPath = writeHooksSettings(app.getPath('userData'), forwardScript)
  console.log('[hub] HookServer sur port', port, '| hooks settings :', hooksSettingsPath)

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Typecheck + tests.**
Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur
Run: `npm test` → PASS (tous les tests verts)

- [ ] **Step 3: Commit**
```powershell
git add src/main/index.ts
git commit -m "feat(v1d0): index.ts = bootstrap qui enregistre les modules (session, agents)"
```

---

### Task B.7 : Checkpoint main — non-régression sans le renderer React

- [ ] **Step 1: Lancer l'app.** Run: `npm run dev`

Expected (**Daniel valide**) — l'UI vanilla actuelle marche TOUJOURS (le renderer n'a pas encore changé) :
- Le terminal `claude` s'affiche.
- Dispatcher des agents → ils apparaissent dans le rail, console live au clic.
- La sortie de session arrête bien les watchers (pas de fuite, pas d'erreur console main).

Si KO : corriger avant d'attaquer le pilier C. Si OK :
- [ ] **Step 2: Commit éventuel d'ajustement**
```powershell
git add -A
git commit -m "chore(v1d0): pilier B valide (modules main, non-regression)"
```

---

## Pilier C — Socle UI React + Zustand

### Task C.1 : Dépendances + config build React

**Files:**
- Modify: `package.json`
- Modify: `electron.vite.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Installer les dépendances.**
```powershell
npm install react react-dom zustand
npm install -D @vitejs/plugin-react @types/react @types/react-dom
```

- [ ] **Step 2: Activer le plugin React côté renderer dans `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()] // garde node-pty hors du bundle (module natif)
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
```

- [ ] **Step 3: Activer JSX + inclure les .tsx dans `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 4: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 erreur (rien ne consomme encore React, c'est juste la config).

- [ ] **Step 5: Commit**
```powershell
git add package.json package-lock.json electron.vite.config.ts tsconfig.json
git commit -m "feat(v1d0): socle build React (plugin-react + jsx + deps)"
```

---

### Task C.2 : Store Zustand

**Files:**
- Create: `src/renderer/src/store.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/store.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useHub } from '../src/renderer/src/store'

describe('store hub', () => {
  beforeEach(() => useHub.getState().reset())

  it('addAgent ajoute un agent vide', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'Explore', desc: 'liste md', lines: [] })
    expect(useHub.getState().agents).toEqual([{ id: 'a1', type: 'Explore', desc: 'liste md', lines: [] }])
  })

  it('addAgent ignore un doublon', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'Explore', desc: '', lines: [] })
    useHub.getState().addAgent({ id: 'a1', type: 'Explore', desc: '', lines: [] })
    expect(useHub.getState().agents).toHaveLength(1)
  })

  it('appendLines concatène les lignes du bon agent', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'x', desc: '', lines: [] })
    useHub.getState().appendLines('a1', [{ kind: 'tool', text: 'Glob' }])
    useHub.getState().appendLines('a1', [{ kind: 'text', text: 'ok' }])
    expect(useHub.getState().agents[0].lines).toEqual([
      { kind: 'tool', text: 'Glob' },
      { kind: 'text', text: 'ok' }
    ])
  })

  it('removeAgent ferme la console si l\'agent ouvert est retiré', () => {
    useHub.getState().addAgent({ id: 'a1', type: 'x', desc: '', lines: [] })
    useHub.getState().openAgent('a1')
    useHub.getState().removeAgent('a1')
    expect(useHub.getState().agents).toHaveLength(0)
    expect(useHub.getState().openAgentId).toBeNull()
  })

  it('setSessionState met à jour l\'état', () => {
    useHub.getState().setSessionState('waiting')
    expect(useHub.getState().sessionState).toBe('waiting')
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test -- store`
Expected: FAIL (`store` absent).

- [ ] **Step 3: Créer `src/renderer/src/store.ts`**

```ts
import { create } from 'zustand'
import type { ConsoleLine, SessionState } from '../../shared/ipc'

export interface AgentView {
  id: string
  type: string
  desc: string
  lines: ConsoleLine[]
}

interface HubState {
  tabId: string | null
  sessionState: SessionState
  agents: AgentView[]
  openAgentId: string | null
  setTab: (tabId: string) => void
  setSessionState: (state: SessionState) => void
  addAgent: (agent: AgentView) => void
  appendLines: (agentId: string, lines: ConsoleLine[]) => void
  removeAgent: (agentId: string) => void
  openAgent: (agentId: string | null) => void
  reset: () => void
}

const initial = {
  tabId: null as string | null,
  sessionState: 'starting' as SessionState,
  agents: [] as AgentView[],
  openAgentId: null as string | null
}

export const useHub = create<HubState>((set) => ({
  ...initial,
  setTab: (tabId) => set({ tabId }),
  setSessionState: (sessionState) => set({ sessionState }),
  addAgent: (agent) =>
    set((s) => (s.agents.some((a) => a.id === agent.id) ? s : { agents: [...s.agents, agent] })),
  appendLines: (agentId, lines) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === agentId ? { ...a, lines: [...a.lines, ...lines] } : a))
    })),
  removeAgent: (agentId) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== agentId),
      openAgentId: s.openAgentId === agentId ? null : s.openAgentId
    })),
  openAgent: (openAgentId) => set({ openAgentId }),
  reset: () => set({ ...initial })
}))
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test -- store`
Expected: PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(v1d0): store Zustand (sessions/agents/console) + tests"
```

---

### Task C.3 : Composant `Terminal` (React + xterm)

**Files:**
- Create: `src/renderer/src/components/Terminal.tsx`

(Wrapper xterm impératif encapsulé dans un effet React monté une seule fois ; pas de test unitaire — validé au checkpoint C.7.)

- [ ] **Step 1: Créer `src/renderer/src/components/Terminal.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function Terminal({ tabId }: { tabId: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    const doFit = (): void => {
      try {
        fit.fit()
        window.hub.resize(tabId, term.cols, term.rows)
      } catch { /* conteneur pas encore dimensionné */ }
    }
    const ro = new ResizeObserver(() => doFit())
    ro.observe(container)
    requestAnimationFrame(doFit)
    window.addEventListener('resize', doFit)

    term.attachCustomKeyEventHandler((e): boolean => {
      if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey)) return true
      const key = e.key.toLowerCase()
      if (key === 'v') {
        navigator.clipboard.readText().then((t) => { if (t) term.paste(t) }).catch(() => {})
        return false
      }
      if (key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection()).catch(() => {})
        return false
      }
      return true
    })

    const offData = window.hub.onData((id, data) => { if (id === tabId) term.write(data) })
    const onInput = term.onData((data) => window.hub.sendInput(tabId, data))

    return () => {
      offData()
      onInput.dispose()
      ro.disconnect()
      window.removeEventListener('resize', doFit)
      term.dispose()
    }
  }, [tabId])

  return <div ref={containerRef} style={{ flex: 1, minWidth: 0, height: '100%' }} />
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 erreur.

- [ ] **Step 3: Commit**
```powershell
git add src/renderer/src/components/Terminal.tsx
git commit -m "feat(v1d0): composant React Terminal (xterm encapsule)"
```

---

### Task C.4 : Composants `Rail` + `Console`

**Files:**
- Create: `src/renderer/src/components/Console.tsx`
- Create: `src/renderer/src/components/Rail.tsx`

- [ ] **Step 1: Créer `src/renderer/src/components/Console.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console(): JSX.Element | null {
  const openAgentId = useHub((s) => s.openAgentId)
  const agent = useHub((s) => s.agents.find((a) => a.id === s.openAgentId) ?? null)
  const close = useHub((s) => s.openAgent)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!openAgentId || !agent) return null

  return (
    <div id="console" className="open">
      <div className="console-header">
        <span>▸ {agent.type} — {agent.desc.slice(0, 50)}</span>
        <span className="cclose" title="Fermer la console" onClick={() => close(null)}>✕</span>
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

- [ ] **Step 2: Créer `src/renderer/src/components/Rail.tsx`**

```tsx
import { useHub } from '../store'

export function Rail(): JSX.Element {
  const agents = useHub((s) => s.agents)
  const openAgentId = useHub((s) => s.openAgentId)
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)

  return (
    <div id="rail">
      {agents.map((a) => (
        <div
          key={a.id}
          className={`agent${a.id === openAgentId ? ' sel' : ''}`}
          onClick={() => open(a.id)}
        >
          <span
            className="aclose"
            title="Retirer"
            onClick={(e) => { e.stopPropagation(); remove(a.id) }}
          >✕</span>
          <div className="type">▸ {a.type}</div>
          <div className="desc">{a.desc.slice(0, 60)}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Commit**
```powershell
git add src/renderer/src/components/Console.tsx src/renderer/src/components/Rail.tsx
git commit -m "feat(v1d0): composants React Rail + Console (lecture du store)"
```

---

### Task C.5 : `App` + point d'entrée + nettoyage de l'ancien renderer

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/main.tsx`
- Modify: `src/renderer/index.html`
- Delete: `src/renderer/src/main.ts`, `src/renderer/src/rail.ts`, `src/renderer/src/terminal.ts`

- [ ] **Step 1: Créer `src/renderer/src/App.tsx`** (câblage IPC -> store, boot de session)

```tsx
import { useEffect, useState } from 'react'
import { useHub } from './store'
import { Terminal } from './components/Terminal'
import { Rail } from './components/Rail'
import { Console } from './components/Console'
import type { Unsub } from '../../shared/ipc'

const cwd = 'C:\\Users\\daniel.gavriline\\Desktop\\Travail\\Claude apps\\DIFAI-HUB'

export function App(): JSX.Element {
  const [tabId, setTabId] = useState<string | null>(null)

  useEffect(() => {
    const unsubs: Unsub[] = []
    let active = true

    window.hub.newSession(cwd).then((id) => {
      if (!active) return
      useHub.getState().setTab(id)
      setTabId(id)

      unsubs.push(window.hub.onSessionState((tid, state) => {
        if (tid === id) useHub.getState().setSessionState(state)
      }))
      unsubs.push(window.hub.onAgentAdded((tid, agentId, type, desc) => {
        if (tid === id) useHub.getState().addAgent({ id: agentId, type, desc, lines: [] })
      }))
      unsubs.push(window.hub.onAgentLines((tid, agentId, lines) => {
        if (tid === id) useHub.getState().appendLines(agentId, lines)
      }))
    })

    return () => {
      active = false
      unsubs.forEach((u) => u())
    }
  }, [])

  return (
    <div id="row">
      {tabId && <Terminal tabId={tabId} />}
      <Console />
      <Rail />
    </div>
  )
}
```

- [ ] **Step 2: Créer `src/renderer/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: Mettre à jour `src/renderer/index.html`** — vider `#app` et pointer vers `main.tsx`.

Remplacer :
```html
    <div id="app">DIFAI-HUB — démarrage…</div>
    <script type="module" src="./src/main.ts"></script>
```
par :
```html
    <div id="app"></div>
    <script type="module" src="./src/main.tsx"></script>
```
(Le bloc `<style>` existant est conservé tel quel : les classes `#row`, `#term`, `#console`, `#rail`, `.agent`, `.cline`, etc. sont réutilisées par les composants React.)

- [ ] **Step 4: Supprimer les anciens fichiers vanilla**
```powershell
git rm src/renderer/src/main.ts src/renderer/src/rail.ts src/renderer/src/terminal.ts
```

- [ ] **Step 5: Typecheck + tests.**
Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur
Run: `npm test` → PASS (tous verts)

- [ ] **Step 6: Commit**
```powershell
git add -A
git commit -m "feat(v1d0): App React + entree main.tsx, retrait du renderer vanilla"
```

---

### Task C.6 : Style — le terminal React utilise la bonne classe

**Files:**
- Modify: `src/renderer/index.html` (CSS) OU `Terminal.tsx`

**Note :** l'ancien `#term` était une `<div>` flex. Le composant `Terminal` applique déjà `flex:1; minWidth:0; height:100%` inline (Task C.3). Vérifier au checkpoint que le terminal occupe bien l'espace ; si besoin d'ajustement CSS, le faire ici.

- [ ] **Step 1: (Conditionnel) Ajuster le layout si le terminal ne se dimensionne pas.**
Si au checkpoint le terminal apparaît trop étroit/large, ajouter dans `#row` du `<style>` : `align-items: stretch;` et vérifier que le wrapper xterm hérite de `height:100%`. Documenter l'ajustement réel appliqué.

- [ ] **Step 2: Commit (si ajustement)**
```powershell
git add src/renderer/index.html src/renderer/src/components/Terminal.tsx
git commit -m "fix(v1d0): dimensionnement du terminal dans le layout React"
```

---

### Task C.7 : Checkpoint humain — non-régression complète sur socle React

- [ ] **Step 1: Lancer l'app.** Run: `npm run dev`

Expected (**Daniel valide**) — comportement V1-C identique, mais sur React/Zustand :
- Le terminal `claude` s'affiche et est interactif (clavier, resize, copier/coller Ctrl+C/V).
- Dispatcher des agents dans la session → ils apparaissent dans le **rail** à droite (type + description).
- **Clic sur un agent** → console formatée en split (🔧 outils / texte / résultats), **remplie en live**, auto-scroll en bas.
- Croix de la console → ferme ; croix d'un agent (survol) → le retire ; remplacement de console au clic d'un autre agent.
- Pas d'erreur dans la console DevTools renderer ni dans la console main.
- **Double-montage StrictMode** : pas de doublons d'agents ni de listeners fantômes (grâce aux `Unsub`).

- [ ] **Step 2: Commit de clôture**
```powershell
git add -A
git commit -m "chore(v1d0): durcissement archi valide (IPC type + modules + React/Zustand)"
```

---

## Self-review (avant clôture V1-D.0)

- **Couverture des 3 piliers :**
  - A (IPC typé) : `src/shared/ipc.ts` + preload typé + désabonnement ✓
  - B (modules main) : PtyManager multi-listeners ✓, HookServer multi-listeners ✓, AppContext/HubModule/WindowSender ✓, sessionModule ✓, agentsModule ✓, index.ts bootstrap ✓
  - C (React/Zustand) : config build ✓, store ✓, Terminal/Rail/Console/App ✓, retrait vanilla ✓
- **Non-régression :** invariant vérifié 2× (B.7 sans React, C.7 avec React).
- **Placeholders :** aucun — code complet partout (la seule étape conditionnelle C.6 est un ajustement CSS optionnel documenté au checkpoint).
- **Cohérence des types :** `ConsoleLine`/`SessionState` viennent tous de `src/shared/ipc.ts` ; `HubApi` identique entre preload (implémentation) et renderer (consommation) ; `IPC.*` utilisés partout au lieu de strings ; `AgentView` du store cohérent avec les payloads `AgentAdded`/`AgentLines` ; `Sender` cohérent entre `AppContext`, `WindowSender` et les modules.
- **Fuites corrigées :** tous les `on*` du preload renvoient un `Unsub`, consommés dans les `useEffect` cleanup (Terminal, App).

## Ce que ce socle débloque (modules suivants)

- **V1-D** (état visuel : `sessionState` est déjà poussé au store → il ne reste qu'à l'afficher / clignotement / son).
- **V1-E** (multi-projets / multi-onglets) : le store passe de mono-tab à `Map<tabId, …>` ; un `tabsModule` + une sidebar React s'ajoutent **sans toucher** session/agents.
- **V2+** (ADO/Jira/Teams, Obsidian) : chaque intégration = un nouveau `HubModule` + ses canaux dans `src/shared/ipc.ts` + ses composants React. Zéro modification de l'existant.

## Limites connues (hors scope V1-D.0)

- Mono-onglet / mono-projet encore (multi = V1-E) ; `cwd` toujours en dur dans `App.tsx`.
- Pas de bus d'événements main générique (les modules communiquent via `PtyManager`/`HookServer` multi-listeners — suffisant à ce stade ; un `AppEvents` typé pourra être introduit si un 3ᵉ module a besoin d'écouter un autre).
- Watchers toujours par session (mutualisation par projet = optimisation V1-E).
- Pas de tests de rendu React (RTL) — les composants sont validés au checkpoint ; la logique testable vit dans le store (testé).
