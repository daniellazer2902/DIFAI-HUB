# DIFAI-HUB V1-C — Agents visibles : TranscriptWatcher + rail + console

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Quand une session dispatche des subagents, ils apparaissent en live dans un rail à droite ; un clic affiche leur console (vue formatée, lecture seule) en split à côté du terminal — remplacement simple (une console à la fois).

**Architecture:** Quand une session est corrélée (transcript_path + sessionId connus), le main démarre un `TranscriptWatcher` (chokidar) sur `<session>\subagents\`. Le `.meta.json` (présent dès la création) donne `agentType` + `description` → event `agent:added`. Le `.jsonl` grossit en live → lecture des nouvelles lignes complètes → `parseTranscriptLine` → entrées formatées → event `agent:lines`. Le renderer peuple le rail (par onglet actif) et, si la console d'un agent est ouverte, y append les lignes. Parsing + dédup incrémentale = logique pure testée ; le wiring chokidar est validé au checkpoint.

**Tech Stack:** chokidar (déjà installé), Vitest. Pas de nouvelle dépendance.

**Branche:** `feat/poc-derisquage`.

**Findings réutilisés (POC):** transcripts agents dans `<session>\subagents\agent-<id>.jsonl` (+ `.meta.json` = `{agentType, description, toolUseId}`), écrits en live ; lignes JSON typées (`type` user/assistant, `message.content` string ou array de `text`/`tool_use`/`tool_result`).

---

## Task C.1 : parseTranscriptLine (TDD pur)

**Files:**
- Create: `src/main/transcriptParser.ts`
- Test: `tests/transcriptParser.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/transcriptParser.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseTranscriptLine } from '../src/main/transcriptParser'

describe('parseTranscriptLine', () => {
  it('user + content string => prompt', () => {
    const raw = JSON.stringify({ type: 'user', message: { role: 'user', content: 'Liste les .mjs' } })
    expect(parseTranscriptLine(raw)).toEqual([{ kind: 'prompt', text: 'Liste les .mjs' }])
  })

  it('assistant + texte => text', () => {
    const raw = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Voici' }] } })
    expect(parseTranscriptLine(raw)).toEqual([{ kind: 'text', text: 'Voici' }])
  })

  it('assistant + tool_use => tool (nom de l\'outil)', () => {
    const raw = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Glob', input: {} }] } })
    expect(parseTranscriptLine(raw)).toEqual([{ kind: 'tool', text: 'Glob' }])
  })

  it('user + tool_result => result (tronqué)', () => {
    const long = 'x'.repeat(500)
    const raw = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: long }] } })
    const out = parseTranscriptLine(raw)
    expect(out[0].kind).toBe('result')
    expect(out[0].text.length).toBeLessThanOrEqual(200)
  })

  it('plusieurs items dans un message assistant => plusieurs entrées', () => {
    const raw = JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'text', text: 'Je cherche' }, { type: 'tool_use', name: 'Bash' }
    ] } })
    expect(parseTranscriptLine(raw)).toEqual([
      { kind: 'text', text: 'Je cherche' }, { kind: 'tool', text: 'Bash' }
    ])
  })

  it('ligne non-JSON ou type ignoré => []', () => {
    expect(parseTranscriptLine('pas du json')).toEqual([])
    expect(parseTranscriptLine(JSON.stringify({ type: 'attachment' }))).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer → échec.** Run: `npm test` → FAIL (`parseTranscriptLine` absent).

- [ ] **Step 3: Implémenter `src/main/transcriptParser.ts`**

```ts
export type ConsoleLineKind = 'prompt' | 'text' | 'tool' | 'result'
export interface ConsoleLine { kind: ConsoleLineKind; text: string }

interface ContentItem { type?: string; text?: string; name?: string; content?: unknown }
interface RawLine { type?: string; message?: { content?: unknown } }

function truncate(s: string, n = 200): string { return s.length > n ? s.slice(0, n) + '…' : s }

function stringify(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : (c as ContentItem)?.text ?? '')).join(' ')
  }
  return ''
}

/** Transforme une ligne brute de transcript d'agent en entrées de console lisibles. */
export function parseTranscriptLine(raw: string): ConsoleLine[] {
  let obj: RawLine
  try { obj = JSON.parse(raw) } catch { return [] }
  const content = obj.message?.content
  const out: ConsoleLine[] = []

  if (obj.type === 'user') {
    if (typeof content === 'string') {
      out.push({ kind: 'prompt', text: truncate(content) })
    } else if (Array.isArray(content)) {
      for (const item of content as ContentItem[]) {
        if (item?.type === 'tool_result') out.push({ kind: 'result', text: truncate(stringify(item.content)) })
      }
    }
  } else if (obj.type === 'assistant' && Array.isArray(content)) {
    for (const item of content as ContentItem[]) {
      if (item?.type === 'text' && item.text) out.push({ kind: 'text', text: truncate(item.text) })
      else if (item?.type === 'tool_use') out.push({ kind: 'tool', text: item.name ?? 'tool' })
    }
  }
  return out
}
```

- [ ] **Step 4: Lancer → succès.** Run: `npm test` → PASS.

- [ ] **Step 5: Commit**
```powershell
git add src/main/transcriptParser.ts tests/transcriptParser.test.ts
git commit -m "feat(v1c): parseTranscriptLine (jsonl agent -> entrees console) + tests"
```

---

## Task C.2 : Helpers chemin + dédup incrémentale (TDD pur)

**Files:**
- Create: `src/main/transcriptPaths.ts`
- Test: `tests/transcriptPaths.test.ts`

- [ ] **Step 1: Écrire le test qui échoue `tests/transcriptPaths.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { subagentsDir, newCompleteLines } from '../src/main/transcriptPaths'

describe('subagentsDir', () => {
  it('déduit <dir>/<sessionId>/subagents du transcript_path', () => {
    const got = subagentsDir('C:\\u\\.claude\\projects\\slug\\sess-1.jsonl', 'sess-1')
    expect(got).toBe('C:\\u\\.claude\\projects\\slug\\sess-1\\subagents')
  })
})

describe('newCompleteLines', () => {
  it('retourne les lignes complètes au-delà de seen et le nouveau compte', () => {
    const text = 'a\nb\nc\n'
    expect(newCompleteLines(text, 0)).toEqual({ lines: ['a', 'b', 'c'], count: 3 })
    expect(newCompleteLines(text, 2)).toEqual({ lines: ['c'], count: 3 })
  })

  it('ignore une dernière ligne partielle (sans \\n final)', () => {
    const text = 'a\nb\npartiel'
    expect(newCompleteLines(text, 0)).toEqual({ lines: ['a', 'b'], count: 2 })
  })

  it('rien de neuf => lignes vides', () => {
    expect(newCompleteLines('a\nb\n', 2)).toEqual({ lines: [], count: 2 })
  })
})
```

- [ ] **Step 2: Lancer → échec.**

- [ ] **Step 3: Implémenter `src/main/transcriptPaths.ts`**

```ts
import { dirname, join } from 'node:path'

/** <dir(transcript)>/<sessionId>/subagents */
export function subagentsDir(transcriptPath: string, sessionId: string): string {
  return join(dirname(transcriptPath), sessionId, 'subagents')
}

/**
 * À partir du texte complet d'un .jsonl et du nombre de lignes déjà vues,
 * renvoie les nouvelles lignes COMPLÈTES (terminées par \n) et le nouveau compte.
 * Une dernière ligne partielle (sans \n) est ignorée jusqu'à ce qu'elle soit complète.
 */
export function newCompleteLines(text: string, seen: number): { lines: string[]; count: number } {
  const lastNl = text.lastIndexOf('\n')
  if (lastNl === -1) return { lines: [], count: seen }
  const complete = text.slice(0, lastNl)
  const all = complete.split('\n').filter((l) => l.trim().length > 0)
  if (all.length <= seen) return { lines: [], count: all.length }
  return { lines: all.slice(seen), count: all.length }
}
```

- [ ] **Step 4: Lancer → succès.**

- [ ] **Step 5: Commit**
```powershell
git add src/main/transcriptPaths.ts tests/transcriptPaths.test.ts
git commit -m "feat(v1c): helpers subagentsDir + dedup incrementale de lignes + tests"
```

---

## Task C.3 : TranscriptWatcher (chokidar + meta + incrémental)

**Files:**
- Create: `src/main/TranscriptWatcher.ts`

(Pas de test unitaire chokidar — la logique pure est déjà testée en C.1/C.2 ; le wiring FS est validé au checkpoint C.7.)

- [ ] **Step 1: Implémenter `src/main/TranscriptWatcher.ts`**

```ts
import chokidar, { type FSWatcher } from 'chokidar'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { parseTranscriptLine, type ConsoleLine } from './transcriptParser'
import { newCompleteLines } from './transcriptPaths'

export interface AgentMeta { agentType: string; description: string }
export interface WatcherSink {
  onAgentAdded: (agentId: string, meta: AgentMeta) => void
  onAgentLines: (agentId: string, lines: ConsoleLine[]) => void
}

/** Surveille <session>/subagents/ : meta.json => agent ajouté, .jsonl => lignes live. */
export class TranscriptWatcher {
  private watcher: FSWatcher | null = null
  private readonly seen = new Map<string, number>() // path .jsonl -> lignes déjà émises
  private readonly known = new Set<string>()        // agentId déjà annoncés

  constructor(private readonly sink: WatcherSink) {}

  watch(dir: string): void {
    this.stop()
    this.watcher = chokidar.watch(dir, { ignoreInitial: false, depth: 0 })
    this.watcher.on('add', (p) => this.handle(p))
    this.watcher.on('change', (p) => this.handle(p))
  }

  private handle(path: string): void {
    const name = basename(path)
    const meta = name.match(/^agent-(.+)\.meta\.json$/)
    if (meta) return this.handleMeta(path, meta[1])
    const jsonl = name.match(/^agent-(.+)\.jsonl$/)
    if (jsonl) return this.handleJsonl(path, jsonl[1])
  }

  private handleMeta(path: string, agentId: string): void {
    if (this.known.has(agentId)) return
    try {
      const m = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentMeta>
      this.known.add(agentId)
      this.sink.onAgentAdded(agentId, { agentType: m.agentType ?? 'agent', description: m.description ?? '' })
    } catch { /* fichier en cours d'écriture : réessayé au prochain event */ }
  }

  private handleJsonl(path: string, agentId: string): void {
    try {
      if (statSync(path).size === 0) return
      const text = readFileSync(path, 'utf8')
      const { lines, count } = newCompleteLines(text, this.seen.get(path) ?? 0)
      this.seen.set(path, count)
      const parsed = lines.flatMap(parseTranscriptLine)
      if (parsed.length) this.sink.onAgentLines(agentId, parsed)
    } catch { /* ignore */ }
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
    this.seen.clear()
    this.known.clear()
  }
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur.

- [ ] **Step 3: Commit**
```powershell
git add src/main/TranscriptWatcher.ts
git commit -m "feat(v1c): TranscriptWatcher (meta.json + lecture live des .jsonl agents)"
```

---

## Task C.4 : IPC agents + démarrage du watcher à la corrélation

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Ajouter les canaux agents au preload `src/preload/index.ts`**

Ajouter dans l'objet `hub` (après `onExit`) :
```ts
  onAgentAdded: (cb: (tabId: string, agentId: string, agentType: string, description: string) => void): void => {
    ipcRenderer.on('agent:added', (_e, tabId, agentId, agentType, description) => cb(tabId, agentId, agentType, description))
  },
  onAgentLines: (cb: (tabId: string, agentId: string, lines: { kind: string; text: string }[]) => void): void => {
    ipcRenderer.on('agent:lines', (_e, tabId, agentId, lines) => cb(tabId, agentId, lines))
  }
```

- [ ] **Step 2: Démarrer un TranscriptWatcher par session corrélée dans `src/main/index.ts`**

Ajouter l'import :
```ts
import { TranscriptWatcher } from './TranscriptWatcher'
import { subagentsDir } from './transcriptPaths'
```
Ajouter une map de watchers et démarrer le watcher quand une session passe corrélée. Remplacer le callback du `HookServer` par une version qui, sur `SessionStart`, démarre le watcher :
```ts
const watchers = new Map<string, TranscriptWatcher>()

const hookServer = new HookServer((e) => {
  const event = e as HookEvent
  applyHookEvent(registry, event)
  const tabId = event.tabId
  if (!tabId) return
  const s = registry.get(tabId)
  console.log('[hub] event', event.hook_event_name, '| tab', tabId.slice(0, 8), '| etat', s?.state)

  if (event.hook_event_name === 'SessionStart' && s?.sessionId && s.transcriptPath && !watchers.has(tabId)) {
    const dir = subagentsDir(s.transcriptPath, s.sessionId)
    const w = new TranscriptWatcher({
      onAgentAdded: (agentId, meta) =>
        mainWindow?.webContents.send('agent:added', tabId, agentId, meta.agentType, meta.description),
      onAgentLines: (agentId, lines) =>
        mainWindow?.webContents.send('agent:lines', tabId, agentId, lines)
    })
    w.watch(dir)
    watchers.set(tabId, w)
  }
})
```
Et dans `ptyManager.onExit`, arrêter le watcher :
```ts
ptyManager.onExit((tabId, code) => {
  registry.setState(tabId, 'done')
  watchers.get(tabId)?.stop()
  watchers.delete(tabId)
  mainWindow?.webContents.send('pty:exit', tabId, code)
})
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur.

- [ ] **Step 4: Commit**
```powershell
git add src/preload/index.ts src/main/index.ts
git commit -m "feat(v1c): IPC agents + demarrage TranscriptWatcher a la correlation"
```

---

## Task C.5 : Renderer — layout B (terminal + rail + console) et rail d'agents

**Files:**
- Modify: `src/renderer/src/main.ts`
- Create: `src/renderer/src/rail.ts`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Styles dans `index.html`** — remplacer le bloc `<style>` existant par :
```html
<style>
  html, body, #app { margin: 0; height: 100%; background: #1e1e1e; color: #ddd; font-family: Consolas, monospace; }
  #row { display: flex; height: 100%; }
  #term { flex: 1; min-width: 0; }
  #console { flex: 1; min-width: 0; border-left: 1px solid #333; overflow-y: auto; padding: 6px; font-size: 12px; display: none; }
  #console.open { display: block; }
  #rail { width: 150px; border-left: 1px solid #333; overflow-y: auto; background: #181818; }
  .agent { padding: 6px 8px; border-bottom: 1px solid #2a2a2a; cursor: pointer; font-size: 11px; }
  .agent:hover { background: #242424; }
  .agent.sel { background: #33291a; outline: 1px solid #c80; }
  .agent .type { color: #7fd; }
  .agent.done .type { color: #888; }
  .cline { white-space: pre-wrap; line-height: 1.4; }
  .cline.tool { color: #fb7; }
  .cline.text { color: #cde; }
  .cline.prompt { color: #9c9; }
  .cline.result { color: #888; }
</style>
```

- [ ] **Step 2: Réécrire `src/renderer/src/main.ts`** pour le layout B :
```ts
import { mountTerminal } from './terminal'
import { mountRail } from './rail'

const root = document.getElementById('app')!
root.innerHTML = `
  <div id="row">
    <div id="term"></div>
    <div id="console"></div>
    <div id="rail"></div>
  </div>`

const cwd = 'C:\\Users\\daniel.gavriline\\Desktop\\Travail\\Claude apps\\DIFAI-HUB'

async function boot(): Promise<void> {
  const tabId = await window.hub.newSession(cwd)
  mountTerminal(document.getElementById('term')!, tabId)
  mountRail(tabId, document.getElementById('rail')!, document.getElementById('console')!)
}

boot()
```

- [ ] **Step 3: Créer `src/renderer/src/rail.ts`** (rail + console formatée, remplacement simple) :
```ts
interface Line { kind: string; text: string }

export function mountRail(tabId: string, rail: HTMLElement, consoleEl: HTMLElement): void {
  const agents = new Map<string, { type: string; desc: string; lines: Line[]; el: HTMLElement; done: boolean }>()
  let openAgent: string | null = null

  function renderConsole(agentId: string): void {
    const a = agents.get(agentId)
    if (!a) return
    consoleEl.innerHTML = a.lines.map((l) => `<div class="cline ${l.kind}">${icon(l.kind)} ${escapeHtml(l.text)}</div>`).join('')
    consoleEl.classList.add('open')
    consoleEl.scrollTop = consoleEl.scrollHeight
  }

  function select(agentId: string): void {
    openAgent = agentId
    for (const [id, a] of agents) a.el.classList.toggle('sel', id === agentId)
    renderConsole(agentId)
  }

  window.hub.onAgentAdded((tid, agentId, agentType, description) => {
    if (tid !== tabId || agents.has(agentId)) return
    const el = document.createElement('div')
    el.className = 'agent'
    el.innerHTML = `<div class="type">▸ ${escapeHtml(agentType)}</div><div>${escapeHtml(description.slice(0, 60))}</div>`
    el.addEventListener('click', () => select(agentId))
    rail.appendChild(el)
    agents.set(agentId, { type: agentType, desc: description, lines: [], el, done: false })
  })

  window.hub.onAgentLines((tid, agentId, lines) => {
    if (tid !== tabId) return
    const a = agents.get(agentId)
    if (!a) return
    a.lines.push(...lines)
    if (openAgent === agentId) renderConsole(agentId)
  })
}

function icon(kind: string): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

- [ ] **Step 4: Typecheck.** Run: `npx tsc -p tsconfig.json --noEmit` → 0 erreur.

- [ ] **Step 5: Commit**
```powershell
git add src/renderer/
git commit -m "feat(v1c): layout B + rail d'agents + console formatee (remplacement simple)"
```

---

## Task C.6 : Checkpoint humain — agents visibles

- [ ] **Step 1: Lancer l'app.** Run: `npm run dev`

Expected (**Daniel valide**) :
- Le terminal claude s'affiche (largeur réduite : rail à droite).
- Dans la session claude, dispatcher des agents (ex. « lance 3 agents Explore en parallèle qui listent les .md, .json, .mjs »).
- Les agents **apparaissent dans le rail** à droite (type + description) au fur et à mesure.
- **Clic sur un agent** → sa console s'ouvre en split (terminal rétréci), avec les `🔧 outils` / textes / résultats, **qui se remplissent en live**.
- Cliquer un autre agent **remplace** la console.

- [ ] **Step 2: Ajustements éventuels (selon retour Daniel), puis commit**
```powershell
git add -A
git commit -m "chore(v1c): agents visibles valides"
```

---

## Self-review (avant clôture V1-C)

- **Couverture :** parser ✓, helpers chemin/dédup ✓, watcher ✓, IPC + watcher start ✓, rail + console ✓, checkpoint ✓.
- **Placeholders :** aucun — code complet partout.
- **Cohérence des types :** `ConsoleLine {kind,text}` partagé parser↔watcher↔IPC↔rail ; `agent:added`/`agent:lines` identiques entre preload et main ; `WatcherSink` cohérent watcher↔main.

## Limites connues de V1-C (sous-plans suivants)

- État (active/waiting) pas encore affiché visuellement / clignotement = V1-D.
- Un seul onglet/projet = V1-E (sidebar + multi-onglets).
- Console : pas de défilement « suivre le bas » configurable ni de recherche (YAGNI V1).
- Le terminal xterm refit automatiquement quand la console s'ouvre/ferme (ResizeObserver déjà en place) — vérifié au checkpoint.
