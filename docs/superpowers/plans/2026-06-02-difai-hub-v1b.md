# DIFAI-HUB V1-B — Corrélation : HookServer + SessionRegistry

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Chaque session lancée par le hub se corrèle automatiquement à son `sessionId` + `transcript_path`, et son état (`active`/`waiting`) est suivi — via des hooks injectés au lancement, sans modifier la config de l'utilisateur.

**Architecture:** `PtyManager` lance `claude --settings <hub-hooks.json>` avec `DIFAI_HUB_TAB` + `DIFAI_HUB_PORT` en env. Le `hub-hooks.json` (généré au démarrage, chemins absolus) déclare 4 hooks `command` → `hook-forward.mjs`, qui POST l'event + `tabId` au `HookServer` (HTTP local, port dynamique). `applyHookEvent` route l'event vers le `SessionRegistry` (état en mémoire). Tout le routage/état est en logique pure testable ; le transport HTTP est testé via POST réels sur port éphémère.

**Tech Stack:** Node http natif, fetch natif (Node 18+), Vitest. Pas de nouvelle dépendance.

**Branche:** `feat/poc-derisquage` (continuité V1-A).

**Findings réutilisés:** `--settings <path>` est un flag natif, les hooks s'additionnent (zéro pollution config user) ; `SessionStart` fournit `session_id` + `transcript_path` ; `Stop`/`Notification` = la session attend l'utilisateur.

---

## Task B.1 : SessionRegistry (TDD pur)

**Files:**
- Create: `src/main/SessionRegistry.ts`
- Test: `tests/SessionRegistry.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/SessionRegistry.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { SessionRegistry } from '../src/main/SessionRegistry'

describe('SessionRegistry', () => {
  it('register crée une entrée en état starting', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\proj')
    const s = reg.get('tab1')
    expect(s?.cwd).toBe('C:\\proj')
    expect(s?.state).toBe('starting')
    expect(s?.sessionId).toBeNull()
  })

  it('correlate renseigne sessionId + transcriptPath et passe en active', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\proj')
    reg.correlate('tab1', 'sess-123', 'C:\\t.jsonl')
    const s = reg.get('tab1')
    expect(s?.sessionId).toBe('sess-123')
    expect(s?.transcriptPath).toBe('C:\\t.jsonl')
    expect(s?.state).toBe('active')
  })

  it('setState change l\'état', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\proj')
    reg.setState('tab1', 'waiting')
    expect(reg.get('tab1')?.state).toBe('waiting')
  })

  it('ignore les tabId inconnus sans planter', () => {
    const reg = new SessionRegistry()
    expect(() => reg.correlate('absent', 's', 't')).not.toThrow()
    expect(() => reg.setState('absent', 'active')).not.toThrow()
    expect(reg.get('absent')).toBeUndefined()
  })

  it('remove supprime l\'entrée et count reflète le nombre de sessions', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'a')
    reg.register('tab2', 'b')
    expect(reg.count()).toBe(2)
    reg.remove('tab1')
    expect(reg.count()).toBe(1)
    expect(reg.get('tab1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL — `SessionRegistry` n'existe pas.

- [ ] **Step 3: Implémenter `src/main/SessionRegistry.ts`**

```ts
export type SessionState = 'starting' | 'active' | 'waiting' | 'done'

export interface SessionInfo {
  tabId: string
  cwd: string
  sessionId: string | null
  transcriptPath: string | null
  state: SessionState
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionInfo>()

  register(tabId: string, cwd: string): void {
    this.sessions.set(tabId, { tabId, cwd, sessionId: null, transcriptPath: null, state: 'starting' })
  }

  correlate(tabId: string, sessionId: string, transcriptPath: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    s.sessionId = sessionId
    s.transcriptPath = transcriptPath
    s.state = 'active'
  }

  setState(tabId: string, state: SessionState): void {
    const s = this.sessions.get(tabId)
    if (s) s.state = state
  }

  get(tabId: string): SessionInfo | undefined { return this.sessions.get(tabId) }
  remove(tabId: string): void { this.sessions.delete(tabId) }
  count(): number { return this.sessions.size }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm test`
Expected: PASS (SessionRegistry 5/5 + tests existants).

- [ ] **Step 5: Commit**

```powershell
git add src/main/SessionRegistry.ts tests/SessionRegistry.test.ts
git commit -m "feat(v1b): SessionRegistry (etat des sessions par tabId) + tests"
```

---

## Task B.2 : applyHookEvent — routage des events (TDD pur)

**Files:**
- Create: `src/main/hookEvents.ts`
- Test: `tests/hookEvents.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/hookEvents.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { SessionRegistry } from '../src/main/SessionRegistry'
import { applyHookEvent } from '../src/main/hookEvents'

describe('applyHookEvent', () => {
  it('SessionStart corrèle et passe en active', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    applyHookEvent(reg, {
      hook_event_name: 'SessionStart', tabId: 'tab1',
      session_id: 'sess-1', transcript_path: 'C:\\t.jsonl'
    })
    expect(reg.get('tab1')?.sessionId).toBe('sess-1')
    expect(reg.get('tab1')?.state).toBe('active')
  })

  it('Stop passe la session en waiting', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    applyHookEvent(reg, { hook_event_name: 'Stop', tabId: 'tab1' })
    expect(reg.get('tab1')?.state).toBe('waiting')
  })

  it('Notification passe la session en waiting', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    applyHookEvent(reg, { hook_event_name: 'Notification', tabId: 'tab1' })
    expect(reg.get('tab1')?.state).toBe('waiting')
  })

  it('ignore un event sans tabId', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    expect(() => applyHookEvent(reg, { hook_event_name: 'Stop' })).not.toThrow()
    expect(reg.get('tab1')?.state).toBe('starting')
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL — `applyHookEvent` n'existe pas.

- [ ] **Step 3: Implémenter `src/main/hookEvents.ts`**

```ts
import type { SessionRegistry } from './SessionRegistry'

export interface HookEvent {
  hook_event_name?: string
  tabId?: string | null
  session_id?: string
  transcript_path?: string
  agent_id?: string
  agent_type?: string
  agent_transcript_path?: string
  [key: string]: unknown
}

/** Route un event de hook vers le SessionRegistry. SubagentStop = traité en V1-C. */
export function applyHookEvent(reg: SessionRegistry, e: HookEvent): void {
  const tabId = e.tabId
  if (!tabId) return
  switch (e.hook_event_name) {
    case 'SessionStart':
      if (e.session_id && e.transcript_path) reg.correlate(tabId, e.session_id, e.transcript_path)
      reg.setState(tabId, 'active')
      break
    case 'Stop':
    case 'Notification':
      reg.setState(tabId, 'waiting')
      break
    default:
      break
  }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm test`
Expected: PASS (hookEvents 4/4 + reste).

- [ ] **Step 5: Commit**

```powershell
git add src/main/hookEvents.ts tests/hookEvents.test.ts
git commit -m "feat(v1b): routage des events de hook vers le Registry + tests"
```

---

## Task B.3 : HookServer (HTTP local, TDD avec POST réel)

**Files:**
- Create: `src/main/HookServer.ts`
- Test: `tests/HookServer.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/HookServer.test.ts`**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { HookServer } from '../src/main/HookServer'

let server: HookServer | null = null
afterEach(() => { server?.stop(); server = null })

describe('HookServer', () => {
  it('démarre sur un port éphémère et transmet le JSON POST à onEvent', async () => {
    const received: unknown[] = []
    server = new HookServer((e) => received.push(e))
    const port = await server.start()
    expect(port).toBeGreaterThan(0)

    const res = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      body: JSON.stringify({ hook_event_name: 'Stop', tabId: 'tab1' })
    })
    expect(res.status).toBe(200)
    expect(received).toEqual([{ hook_event_name: 'Stop', tabId: 'tab1' }])
  })

  it('ignore un body non-JSON sans planter (toujours 200)', async () => {
    const received: unknown[] = []
    server = new HookServer((e) => received.push(e))
    const port = await server.start()
    const res = await fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: 'pas du json' })
    expect(res.status).toBe(200)
    expect(received).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL — `HookServer` n'existe pas.

- [ ] **Step 3: Implémenter `src/main/HookServer.ts`**

```ts
import { createServer, type Server } from 'node:http'

/** Mini-serveur HTTP local qui reçoit les POST des hooks et les transmet à onEvent. */
export class HookServer {
  private server: Server | null = null
  private boundPort = 0

  constructor(private readonly onEvent: (event: unknown) => void) {}

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        if (req.method !== 'POST') { res.writeHead(404); res.end(); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try { this.onEvent(JSON.parse(body)) } catch { /* body non-JSON : ignore */ }
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
  }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm test`
Expected: PASS (HookServer 2/2 + reste).

- [ ] **Step 5: Commit**

```powershell
git add src/main/HookServer.ts tests/HookServer.test.ts
git commit -m "feat(v1b): HookServer HTTP local (port dynamique) + tests"
```

---

## Task B.4 : Générateur de settings hooks + script forward

**Files:**
- Create: `src/main/hubHooks.ts`
- Test: `tests/hubHooks.test.ts`
- Create: `resources/hooks/hook-forward.mjs`

- [ ] **Step 1: Écrire le test qui échoue `tests/hubHooks.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildHooksConfig } from '../src/main/hubHooks'

describe('buildHooksConfig', () => {
  it('génère les 4 hooks pointant vers le script forward', () => {
    const cfg = buildHooksConfig('C:\\app\\hook-forward.mjs') as {
      hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>
    }
    const events = Object.keys(cfg.hooks)
    expect(events.sort()).toEqual(['Notification', 'SessionStart', 'Stop', 'SubagentStop'])
    const cmd = cfg.hooks.SessionStart[0].hooks[0]
    expect(cmd.type).toBe('command')
    expect(cmd.command).toContain('hook-forward.mjs')
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL — `buildHooksConfig` n'existe pas.

- [ ] **Step 3: Implémenter `src/main/hubHooks.ts`**

```ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Construit l'objet settings de hooks (4 events) pointant vers le script forward. */
export function buildHooksConfig(forwardScriptPath: string): object {
  const entry = [{ hooks: [{ type: 'command', command: `node "${forwardScriptPath}"` }] }]
  return {
    hooks: {
      SessionStart: entry,
      Stop: entry,
      Notification: entry,
      SubagentStop: entry
    }
  }
}

/** Écrit hub-hooks.json dans `dir` et renvoie son chemin. */
export function writeHooksSettings(dir: string, forwardScriptPath: string): string {
  const path = join(dir, 'hub-hooks.json')
  writeFileSync(path, JSON.stringify(buildHooksConfig(forwardScriptPath), null, 2), 'utf8')
  return path
}
```

- [ ] **Step 4: Créer le script `resources/hooks/hook-forward.mjs`**

```js
// Hook forward generique : lit l'event sur stdin, ajoute tabId (env), POST au HookServer.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const port = process.env.DIFAI_HUB_PORT
const payload = JSON.stringify({ ...input, tabId: process.env.DIFAI_HUB_TAB ?? null })

try {
  await fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: payload })
} catch {
  // hub absent : ne jamais bloquer la session claude
}
```

- [ ] **Step 5: Lancer → succès**

Run: `npm test`
Expected: PASS (hubHooks 1/1 + reste).

- [ ] **Step 6: Commit**

```powershell
git add src/main/hubHooks.ts tests/hubHooks.test.ts resources/hooks/hook-forward.mjs
git commit -m "feat(v1b): generateur hub-hooks.json + script hook-forward"
```

---

## Task B.5 : Étendre PtyManager pour passer args + env (--settings)

**Files:**
- Modify: `src/main/PtyManager.ts`
- Modify: `src/main/ptyFactory.ts`
- Modify: `tests/PtyManager.test.ts`

**Changement :** `PtySpawner` reçoit désormais `args: string[]`. `create()` accepte `opts?: { args?; env? }` pour injecter `--settings` et `DIFAI_HUB_PORT`.

- [ ] **Step 1: Mettre à jour les tests `tests/PtyManager.test.ts`**

Remplacer le `fakePty`/`spawn` pour la nouvelle signature `(file, args, opts)`. Modifier le 1er test et ajouter un test args. Le spawner reçoit maintenant 3 args : `spawn.mock.calls[0]` = `[file, args, opts]`.

Remplacer le test « crée une session… » par :
```ts
  it('crée une session : spawner reçoit claudePath, args et cwd + DIFAI_HUB_TAB', () => {
    const pty = fakePty()
    const spawn = vi.fn(() => pty)
    const mgr = new PtyManager({ spawn, claudePath: 'C:\\claude.exe' })

    const tabId = mgr.create('C:\\proj', { args: ['--settings', 'C:\\h.json'], env: { DIFAI_HUB_PORT: '7711' } })

    expect(tabId).toBeTruthy()
    const [file, args, opts] = spawn.mock.calls[0]
    expect(file).toBe('C:\\claude.exe')
    expect(args).toEqual(['--settings', 'C:\\h.json'])
    expect(opts.cwd).toBe('C:\\proj')
    expect(opts.env.DIFAI_HUB_TAB).toBe(tabId)
    expect(opts.env.DIFAI_HUB_PORT).toBe('7711')
  })
```

Dans les autres tests, `mgr.create('C:\\p')` reste valide (args/env optionnels).

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL — signature spawner / `create` incompatible.

- [ ] **Step 3: Mettre à jour `src/main/PtyManager.ts`**

Remplacer le type `PtySpawner` et la méthode `create` :
```ts
export type PtySpawner = (file: string, args: string[], opts: SpawnOptions) => PtyProcess
```
```ts
  create(cwd: string, opts?: { args?: string[]; env?: Record<string, string> }): string {
    const tabId = randomUUID()
    const pty = this.spawn(this.claudePath, opts?.args ?? [], {
      name: 'xterm-color',
      cols: 110,
      rows: 32,
      cwd,
      env: { ...process.env, DIFAI_HUB_TAB: tabId, ...(opts?.env ?? {}) }
    })
    pty.onData((data) => this.dataCb(tabId, data))
    pty.onExit(({ exitCode }) => {
      this.exitCb(tabId, exitCode)
      this.ptys.delete(tabId)
    })
    this.ptys.set(tabId, pty)
    return tabId
  }
```

- [ ] **Step 4: Mettre à jour `src/main/ptyFactory.ts`**

```ts
import pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

// Adapte node-pty à l'interface PtySpawner (file, args, opts).
export const nodePtySpawner: PtySpawner = (file, args, opts) => pty.spawn(file, args, opts)
```

- [ ] **Step 5: Lancer → succès**

Run: `npm test`
Expected: PASS (tous les tests, dont le nouveau test args).

- [ ] **Step 6: Commit**

```powershell
git add src/main/PtyManager.ts src/main/ptyFactory.ts tests/PtyManager.test.ts
git commit -m "feat(v1b): PtyManager passe args (--settings) + env (port) au spawn"
```

---

## Task B.6 : Intégration main (HookServer + Registry + hooks + log corrélation)

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Câbler le tout dans `src/main/index.ts`**

Remplacer le haut du fichier (imports + instanciation + handlers) par :
```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'
import { SessionRegistry } from './SessionRegistry'
import { HookServer } from './HookServer'
import { applyHookEvent, type HookEvent } from './hookEvents'
import { writeHooksSettings } from './hubHooks'

let mainWindow: BrowserWindow | null = null
let hooksSettingsPath = ''

const registry = new SessionRegistry()
const hookServer = new HookServer((e) => {
  const event = e as HookEvent
  applyHookEvent(registry, event)
  const tabId = event.tabId
  if (tabId) {
    const s = registry.get(tabId)
    console.log('[hub] event', event.hook_event_name, '| tab', tabId.slice(0, 8),
      '| sessionId', s?.sessionId?.slice(0, 8) ?? '-', '| etat', s?.state)
  }
})
const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })

ptyManager.onData((tabId, data) => mainWindow?.webContents.send('pty:data', tabId, data))
ptyManager.onExit((tabId, code) => {
  registry.setState(tabId, 'done')
  mainWindow?.webContents.send('pty:exit', tabId, code)
})

ipcMain.handle('session:new', (_e, cwd: string) => {
  const tabId = ptyManager.create(cwd, {
    args: ['--settings', hooksSettingsPath],
    env: { DIFAI_HUB_PORT: String(hookServer.port) }
  })
  registry.register(tabId, cwd)
  return tabId
})
ipcMain.on('session:input', (_e, tabId: string, data: string) => ptyManager.write(tabId, data))
ipcMain.on('session:resize', (_e, tabId: string, cols: number, rows: number) => ptyManager.resize(tabId, cols, rows))
```

- [ ] **Step 2: Démarrer le HookServer + générer hub-hooks.json dans `app.whenReady`**

Remplacer le bloc `app.whenReady().then(...)` par une version async qui démarre le serveur et écrit le settings AVANT de créer la fenêtre :
```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```powershell
git add src/main/index.ts
git commit -m "feat(v1b): integration HookServer + Registry + injection hooks via --settings"
```

---

## Task B.7 : Checkpoint humain — corrélation en conditions réelles

- [ ] **Step 1: Lancer l'app**

Run: `npm run dev`
Expected (**Daniel valide via la console du process main**) :
- `[hub] HookServer sur port <N> | hooks settings : ...hub-hooks.json`
- au démarrage de la session : `[hub] event SessionStart | tab xxxxxxxx | sessionId yyyyyyyy | etat active`
- le terminal claude fonctionne toujours normalement.
- après une réponse de claude : `[hub] event Stop | tab xxxxxxxx | ... | etat waiting`.

→ Prouve que la corrélation `tabId ↔ sessionId` et le suivi d'état fonctionnent **sans avoir modifié le `settings.json` de l'utilisateur**.

- [ ] **Step 2: Nettoyer les logs `[hub]` de debug si souhaité (ou les garder en V1-B, retirés en V1-C) et commit**

```powershell
git add -A
git commit -m "chore(v1b): correlation validee"
```

---

## Self-review (avant clôture V1-B)

- **Couverture :** SessionRegistry ✓, applyHookEvent ✓, HookServer ✓, hubHooks + forward ✓, PtyManager args/env ✓, intégration ✓, checkpoint ✓.
- **Placeholders :** aucun — code complet partout.
- **Cohérence des types :** `HookEvent` (tabId, hook_event_name, session_id, transcript_path) cohérent entre `hookEvents`, `HookServer` (onEvent), et `hook-forward.mjs` (payload) ; `SessionState` partagé ; `PtySpawner (file,args,opts)` cohérent entre `PtyManager`, `ptyFactory`, tests.

## Limites connues de V1-B (pour les sous-plans suivants)

- `SubagentStop` est reçu mais pas encore exploité (rail d'agents = V1-C).
- L'état n'est pas encore poussé au renderer (UI d'état/clignotement = V1-D).
- `hub-hooks.json` référence un chemin de `resources/` valable en dev ; le packaging (extraResources) sera traité au moment du build distribuable (V2).
