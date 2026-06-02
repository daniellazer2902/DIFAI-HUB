# DIFAI-HUB V1-A — Squelette Electron + terminal embarqué

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Une fenêtre Electron affiche un terminal `xterm.js` interactif relié à une vraie session `claude` lancée via node-pty, avec corrélation `tabId` prête.

**Architecture:** electron-vite + TypeScript. Main process : `PtyManager` (gestion des pty par `tabId`) + `claudePath` (résolution de l'exe). Preload : pont IPC étroit (`contextBridge`). Renderer : un terminal xterm relié au pty par IPC. La logique pure (claudePath, PtyManager) est testée sous Vitest avec node-pty injecté/mocké ; l'intégration GUI est validée par checkpoint humain.

**Tech Stack:** Electron 33, electron-vite 2, TypeScript 5, node-pty 1, @xterm/xterm 5 + @xterm/addon-fit, @electron/rebuild, Vitest 2.

**Emplacement:** racine du repo `DIFAI-HUB/` (l'app EST le projet ; `poc/` reste un dossier de référence).

**Branche:** continuer sur `feat/poc-derisquage` (ou créer `feat/v1a-electron-shell` — au choix de l'exécutant ; ne jamais committer sur main).

**Findings POC réutilisés:** node-pty s'installe en prebuild win32-x64 ; `claude` = `claude.exe` à résoudre via `where claude` (node-pty ne parcourt pas le PATH) ; le `tabId` passe par l'env `DIFAI_HUB_TAB`.

---

## Task A.1 : Scaffold electron-vite + fenêtre vide

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.ts`
- Modify: `.gitignore` (ajouter `out/`, `dist/` déjà présents)

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "difai-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "rebuild": "electron-rebuild -f -w node-pty"
  },
  "dependencies": {
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/xterm": "^5.5.0",
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@types/node": "^22.0.0",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.7.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Créer `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()] // garde node-pty hors du bundle (module natif)
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // pas de framework : vanilla TS
  }
})
```

- [ ] **Step 3: Créer `tsconfig.json` et `tsconfig.node.json`**

`tsconfig.json` :
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```
`tsconfig.node.json` :
```json
{
  "extends": "./tsconfig.json",
  "include": ["electron.vite.config.ts"]
}
```

- [ ] **Step 4: Créer `src/main/index.ts` (fenêtre vide)**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: Créer `src/preload/index.ts` (vide pour l'instant)**

```ts
// API IPC exposée au renderer — remplie en Task A.5.
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('hub', {})
```

- [ ] **Step 6: Créer `src/renderer/index.html` et `src/renderer/src/main.ts`**

`src/renderer/index.html` :
```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>DIFAI-HUB</title>
  </head>
  <body>
    <div id="app">DIFAI-HUB — démarrage…</div>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```
`src/renderer/src/main.ts` :
```ts
const el = document.getElementById('app')
if (el) el.textContent = 'DIFAI-HUB prêt.'
```

- [ ] **Step 7: Installer et lancer (checkpoint humain léger)**

Run (PowerShell, racine) :
```powershell
npm install
npm run dev
```
Expected: une fenêtre Electron s'ouvre affichant « DIFAI-HUB prêt. ». **Daniel confirme visuellement.** Fermer la fenêtre.

- [ ] **Step 8: Commit**

```powershell
git add package.json electron.vite.config.ts tsconfig.json tsconfig.node.json src/ .gitignore
git commit -m "feat(v1a): scaffold electron-vite + fenetre vide"
```

---

## Task A.2 : Résolution du chemin de claude.exe (TDD)

**Files:**
- Create: `src/main/claudePath.ts`
- Test: `tests/claudePath.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Créer `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
```

- [ ] **Step 2: Écrire le test qui échoue `tests/claudePath.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { resolveClaudePath } from '../src/main/claudePath'

describe('resolveClaudePath', () => {
  it('retourne le premier .exe d\'une sortie "where" multi-lignes (Windows)', () => {
    const fakeWhere = () => 'C:\\Users\\x\\.local\\bin\\claude.exe\r\nC:\\autre\\claude.bat\r\n'
    expect(resolveClaudePath('win32', fakeWhere)).toBe('C:\\Users\\x\\.local\\bin\\claude.exe')
  })

  it('retourne "claude" tel quel hors Windows', () => {
    const fakeWhere = () => { throw new Error('which appelé à tort') }
    expect(resolveClaudePath('linux', fakeWhere)).toBe('claude')
  })

  it('lève une erreur claire si aucun .exe trouvé', () => {
    const fakeWhere = () => 'C:\\rien\\claude.bat\r\n'
    expect(() => resolveClaudePath('win32', fakeWhere)).toThrow(/claude\.exe introuvable/)
  })
})
```

- [ ] **Step 3: Lancer le test → échec attendu**

Run: `npm test`
Expected: FAIL — `resolveClaudePath` n'existe pas.

- [ ] **Step 4: Implémenter `src/main/claudePath.ts`**

```ts
import { execSync } from 'node:child_process'

type WhereFn = (cmd: string) => string

const defaultWhere: WhereFn = (cmd) => execSync(`where ${cmd}`, { encoding: 'utf8' })

/**
 * Résout le chemin de l'exécutable claude.
 * Sous Windows, node-pty (CreateProcess) ne parcourt pas le PATH et ne sait pas
 * lancer un shim .cmd/.bat → il faut le chemin absolu du .exe.
 */
export function resolveClaudePath(platform: NodeJS.Platform = process.platform, where: WhereFn = defaultWhere): string {
  if (platform !== 'win32') return 'claude'
  const out = where('claude')
  const exe = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().endsWith('.exe'))
  if (!exe) throw new Error('claude.exe introuvable via "where claude"')
  return exe
}
```

- [ ] **Step 5: Lancer le test → succès**

Run: `npm test`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```powershell
git add src/main/claudePath.ts tests/claudePath.test.ts vitest.config.ts
git commit -m "feat(v1a): resolution du chemin claude.exe + tests"
```

---

## Task A.3 : PtyManager (TDD avec node-pty injecté)

**Files:**
- Create: `src/main/PtyManager.ts`
- Test: `tests/PtyManager.test.ts`

**Conception :** `PtyManager` ne dépend pas directement de `node-pty` ; il reçoit une fabrique `spawn` injectable (interface `PtySpawner`). En test on injecte un faux ; en prod on injecte node-pty. Un `pty` est indexé par `tabId`.

- [ ] **Step 1: Écrire le test qui échoue `tests/PtyManager.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { PtyManager } from '../src/main/PtyManager'

function fakePty() {
  const handlers: { data: ((d: string) => void)[]; exit: ((e: { exitCode: number }) => void)[] } = { data: [], exit: [] }
  return {
    write: vi.fn(),
    kill: vi.fn(),
    onData: (cb: (d: string) => void) => handlers.data.push(cb),
    onExit: (cb: (e: { exitCode: number }) => void) => handlers.exit.push(cb),
    _emitData: (d: string) => handlers.data.forEach((h) => h(d)),
    _emitExit: (code: number) => handlers.exit.forEach((h) => h({ exitCode: code }))
  }
}

describe('PtyManager', () => {
  it('crée une session avec un tabId unique et lance le spawner avec cwd + DIFAI_HUB_TAB', () => {
    const pty = fakePty()
    const spawn = vi.fn(() => pty)
    const mgr = new PtyManager({ spawn, claudePath: 'C:\\claude.exe' })

    const tabId = mgr.create('C:\\proj')

    expect(tabId).toBeTruthy()
    expect(spawn).toHaveBeenCalledOnce()
    const opts = spawn.mock.calls[0][1]
    expect(opts.cwd).toBe('C:\\proj')
    expect(opts.env.DIFAI_HUB_TAB).toBe(tabId)
  })

  it('route les données du pty vers le callback onData avec le bon tabId', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const received: { tabId: string; data: string }[] = []
    mgr.onData((tabId, data) => received.push({ tabId, data }))

    const tabId = mgr.create('C:\\p')
    pty._emitData('hello')

    expect(received).toEqual([{ tabId, data: 'hello' }])
  })

  it('write transmet l\'entrée au bon pty', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const tabId = mgr.create('C:\\p')
    mgr.write(tabId, 'ls\r')
    expect(pty.write).toHaveBeenCalledWith('ls\r')
  })

  it('kill termine le pty et oublie le tabId', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const tabId = mgr.create('C:\\p')
    mgr.kill(tabId)
    expect(pty.kill).toHaveBeenCalled()
    expect(mgr.has(tabId)).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer → échec**

Run: `npm test`
Expected: FAIL — `PtyManager` n'existe pas.

- [ ] **Step 3: Implémenter `src/main/PtyManager.ts`**

```ts
import { randomUUID } from 'node:crypto'

export interface PtyProcess {
  write(data: string): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
}

export interface SpawnOptions {
  name: string
  cols: number
  rows: number
  cwd: string
  env: NodeJS.ProcessEnv
}

export type PtySpawner = (file: string, opts: SpawnOptions) => PtyProcess

export class PtyManager {
  private readonly spawn: PtySpawner
  private readonly claudePath: string
  private readonly ptys = new Map<string, PtyProcess>()
  private dataCb: (tabId: string, data: string) => void = () => {}
  private exitCb: (tabId: string, exitCode: number) => void = () => {}

  constructor(deps: { spawn: PtySpawner; claudePath: string }) {
    this.spawn = deps.spawn
    this.claudePath = deps.claudePath
  }

  onData(cb: (tabId: string, data: string) => void): void { this.dataCb = cb }
  onExit(cb: (tabId: string, exitCode: number) => void): void { this.exitCb = cb }

  create(cwd: string): string {
    const tabId = randomUUID()
    const pty = this.spawn(this.claudePath, {
      name: 'xterm-color',
      cols: 110,
      rows: 32,
      cwd,
      env: { ...process.env, DIFAI_HUB_TAB: tabId }
    })
    pty.onData((data) => this.dataCb(tabId, data))
    pty.onExit(({ exitCode }) => {
      this.exitCb(tabId, exitCode)
      this.ptys.delete(tabId)
    })
    this.ptys.set(tabId, pty)
    return tabId
  }

  write(tabId: string, data: string): void { this.ptys.get(tabId)?.write(data) }
  kill(tabId: string): void {
    const pty = this.ptys.get(tabId)
    if (!pty) return
    pty.kill()
    this.ptys.delete(tabId)
  }
  has(tabId: string): boolean { return this.ptys.has(tabId) }
}
```

- [ ] **Step 4: Lancer → succès**

Run: `npm test`
Expected: PASS (claudePath 3/3 + PtyManager 4/4).

- [ ] **Step 5: Commit**

```powershell
git add src/main/PtyManager.ts tests/PtyManager.test.ts
git commit -m "feat(v1a): PtyManager (gestion pty par tabId) + tests"
```

---

## Task A.4 : Brancher node-pty réel + rebuild Electron

**Files:**
- Create: `src/main/ptyFactory.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Créer l'adaptateur `src/main/ptyFactory.ts`**

```ts
import pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

// Adapte node-pty à l'interface PtySpawner attendue par PtyManager.
export const nodePtySpawner: PtySpawner = (file, opts) => pty.spawn(file, [], opts)
```

- [ ] **Step 2: Rebuild node-pty pour l'ABI d'Electron**

Run (PowerShell, racine) :
```powershell
npm run rebuild
```
Expected: `@electron/rebuild` recompile/relie node-pty pour Electron sans erreur. (Si échec node-gyp, installer Visual Studio Build Tools + Python et relancer.)

- [ ] **Step 3: Vérifier le chargement de node-pty dans le main — log temporaire**

Modifier `src/main/index.ts` : ajouter en haut, après les imports, un log de fumée dans `app.whenReady` AVANT `createWindow()` :
```ts
  // Vérif fumée node-pty (sera retiré en A.5)
  const { resolveClaudePath } = await import('./claudePath')
  console.log('[main] claude résolu :', resolveClaudePath())
```
(rendre le callback `app.whenReady().then(async () => { ... })`).

- [ ] **Step 4: Lancer et vérifier (checkpoint humain)**

Run: `npm run dev`
Expected: la console du process main affiche `[main] claude résolu : C:\Users\...\claude.exe`. **Daniel confirme** qu'aucune erreur « module version mismatch » de node-pty n'apparaît. Fermer.

- [ ] **Step 5: Commit**

```powershell
git add src/main/ptyFactory.ts src/main/index.ts
git commit -m "feat(v1a): adaptateur node-pty + rebuild Electron verifie"
```

---

## Task A.5 : IPC preload + handlers main

**Files:**
- Modify: `src/preload/index.ts`
- Create: `src/preload/api.d.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Définir l'API exposée `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const hub = {
  newSession: (cwd: string): Promise<string> => ipcRenderer.invoke('session:new', cwd),
  sendInput: (tabId: string, data: string): void => ipcRenderer.send('session:input', tabId, data),
  onData: (cb: (tabId: string, data: string) => void): void => {
    ipcRenderer.on('pty:data', (_e, tabId: string, data: string) => cb(tabId, data))
  },
  onExit: (cb: (tabId: string, code: number) => void): void => {
    ipcRenderer.on('pty:exit', (_e, tabId: string, code: number) => cb(tabId, code))
  }
}

contextBridge.exposeInMainWorld('hub', hub)
export type Hub = typeof hub
```

- [ ] **Step 2: Déclarer le type global `src/preload/api.d.ts`**

```ts
import type { Hub } from './index'

declare global {
  interface Window {
    hub: Hub
  }
}
```

- [ ] **Step 3: Câbler les handlers dans `src/main/index.ts`**

Remplacer le bloc `app.whenReady().then(...)` et ajouter l'instanciation du PtyManager + les handlers IPC. Retirer le log de fumée de A.4. Nouveau contenu pertinent :

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { PtyManager } from './PtyManager'
import { nodePtySpawner } from './ptyFactory'
import { resolveClaudePath } from './claudePath'

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager({ spawn: nodePtySpawner, claudePath: resolveClaudePath() })

ptyManager.onData((tabId, data) => mainWindow?.webContents.send('pty:data', tabId, data))
ptyManager.onExit((tabId, code) => mainWindow?.webContents.send('pty:exit', tabId, code))

ipcMain.handle('session:new', (_e, cwd: string) => ptyManager.create(cwd))
ipcMain.on('session:input', (_e, tabId: string, data: string) => ptyManager.write(tabId, data))
```

(Conserver `createWindow()` mais assigner `mainWindow = win`, et `win.on('closed', () => { mainWindow = null })`.)

- [ ] **Step 4: Vérifier le typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: aucune erreur de type.

- [ ] **Step 5: Commit**

```powershell
git add src/preload/index.ts src/preload/api.d.ts src/main/index.ts
git commit -m "feat(v1a): IPC preload + handlers session main"
```

---

## Task A.6 : Renderer — terminal xterm relié au pty

**Files:**
- Create: `src/renderer/src/terminal.ts`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Wrapper terminal `src/renderer/src/terminal.ts`**

```ts
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function mountTerminal(container: HTMLElement, tabId: string): Terminal {
  const term = new Terminal({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(container)
  fit.fit()
  window.addEventListener('resize', () => fit.fit())

  // pty -> écran
  window.hub.onData((id, data) => { if (id === tabId) term.write(data) })
  // clavier -> pty
  term.onData((data) => window.hub.sendInput(tabId, data))

  return term
}
```

- [ ] **Step 2: Bootstrap `src/renderer/src/main.ts`**

```ts
import { mountTerminal } from './terminal'

const root = document.getElementById('app')!
root.innerHTML = '<div id="term" style="position:absolute;inset:0;"></div>'

const cwd = 'C:\\Users\\daniel.gavriline\\Desktop\\Travail\\Claude apps\\DIFAI-HUB'

async function boot(): Promise<void> {
  const tabId = await window.hub.newSession(cwd)
  mountTerminal(document.getElementById('term')!, tabId)
}

boot()
```

- [ ] **Step 3: Style minimal dans `index.html`**

Ajouter dans `<head>` :
```html
<style>
  html, body, #app { margin: 0; height: 100%; background: #1e1e1e; }
</style>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/
git commit -m "feat(v1a): terminal xterm relie au pty via IPC"
```

---

## Task A.7 : Intégration — checkpoint humain

- [ ] **Step 1: Lancer l'app complète**

Run: `npm run dev`
Expected (**Daniel valide**) :
- Une fenêtre s'ouvre avec un terminal sombre plein écran.
- Une session `claude` démarre **dans le terminal** (interface Claude Code visible).
- On peut **taper** dedans (ex. « dis bonjour ») et Claude répond.
- Pas d'erreur node-pty dans la console main.

- [ ] **Step 2: Si tout est bon, retirer tout reliquat de debug et commit final**

```powershell
git add -A
git commit -m "chore(v1a): nettoyage + integration terminal embarque OK"
```

---

## Self-review (avant de clôturer V1-A)

- **Couverture :** scaffold ✓, claudePath ✓, PtyManager ✓, node-pty réel + rebuild ✓, IPC ✓, renderer xterm ✓, intégration ✓.
- **Placeholders :** aucun — code complet à chaque step.
- **Cohérence des types :** `hub.newSession/sendInput/onData/onExit` identiques entre preload, `api.d.ts`, et renderer ; `PtySpawner`/`PtyProcess` cohérents entre `PtyManager`, `ptyFactory`, et les tests.

## Corrections appliquées à l'exécution (checkpoint GUI)

Trois ajustements découverts en validant l'app réelle (intégrés à V1-A) :
1. **Preload chargé en `.mjs`** : avec `"type":"module"`, electron-vite génère `out/preload/index.mjs` ; le main doit référencer `../preload/index.mjs` (sinon `window.hub` jamais exposé → écran noir).
2. **`fit()` via `ResizeObserver`** : appelé synchroniquement après `open()`, xterm calculait ~1 colonne. Le refit sur `ResizeObserver` règle l'affichage.
3. **Resize propagé au pty** : ajout de `PtyManager.resize` + IPC `session:resize` + appel depuis le renderer (sinon claude reste à 110×32 et se tasse en haut-gauche).

## Limites connues de V1-A (hors périmètre, pour les sous-plans suivants)

- Un seul onglet/terminal en dur (le multi-onglets + sidebar = V1-E).
- Pas encore de corrélation côté hub (HookServer/Registry = V1-B).
