# Lecteur images/HTML + skill `/dide-open` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au lecteur Markdown de DIFAI-IDE d'afficher images et fichiers HTML, et fournir une skill `/dide-open` qui ouvre un fichier/dossier en onglet dans le groupe de la session Claude courante.

**Architecture:** Partie A étend le lecteur existant (`notesModule` main + `NotesView`/`MarkdownView`/`NoteTree` renderer) : classification par extension, listing des images/html dans l'arbre, vues dédiées (img + iframe sandboxée). Partie B réutilise le bridge hooks existant (`HookServer` HTTP local + env `DIFAI_HUB_PORT`/`DIFAI_HUB_TAB`) : la skill POST une commande, un nouveau module main la route vers le renderer via IPC, qui ouvre le fichier/dossier dans le bon groupe.

**Tech Stack:** Electron, TypeScript, React, Zustand (store), Vitest (tests). Skill Claude Code (SKILL.md + script node).

## Global Constraints

- Lecture seule — aucune édition de fichier.
- HTML rendu en `<iframe sandbox="allow-scripts" srcdoc=…>` SANS `allow-same-origin` (isolation).
- Garde sécurité chemins via `isInside(root, target)` conservée sur toute lecture.
- Borne de taille des fichiers lus : `MAX_BYTES = 10 * 1024 * 1024` (réutiliser la constante de `assets.ts`).
- Index wikilink reste `.md`-only.
- Commits sans aucune mention d'assistance IA ; messages UTF-8 (accents préservés).
- Tests : `npx vitest run <fichier>` ; typecheck via `npm run build` (esbuild ne typecheck pas seul — lancer `npx tsc --noEmit -p .` si dispo, sinon `npm run build`).
- Skill installée en **global** (`~/.claude/skills/dide-open/`), pas dans le repo.

---

## Partie A — Lecteur images + HTML

### Task 1: Util `classifyNoteFile`

**Files:**
- Create: `src/shared/noteKind.ts`
- Test: `tests/noteKind.test.ts`

**Interfaces:**
- Produces: `export type NoteKind = 'md' | 'image' | 'html'` ; `export function classifyNoteFile(path: string): NoteKind | null` (null = type non supporté).

- [ ] **Step 1: Write the failing test**

```ts
// tests/noteKind.test.ts
import { describe, it, expect } from 'vitest'
import { classifyNoteFile } from '../src/shared/noteKind'

describe('classifyNoteFile', () => {
  it('classe les markdown', () => {
    expect(classifyNoteFile('a.md')).toBe('md')
    expect(classifyNoteFile('a.MARKDOWN')).toBe('md')
  })
  it('classe les images', () => {
    for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
      expect(classifyNoteFile(`x.${e}`)).toBe('image')
    expect(classifyNoteFile('X.PNG')).toBe('image')
  })
  it('classe le html', () => {
    expect(classifyNoteFile('p.html')).toBe('html')
    expect(classifyNoteFile('p.HTM')).toBe('html')
  })
  it('renvoie null pour les types non supportés', () => {
    expect(classifyNoteFile('a.txt')).toBeNull()
    expect(classifyNoteFile('a')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/noteKind.test.ts`
Expected: FAIL (`Cannot find module '../src/shared/noteKind'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/noteKind.ts
export type NoteKind = 'md' | 'image' | 'html'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

/** Classe un fichier par extension. null = type non pris en charge par le lecteur. */
export function classifyNoteFile(path: string): NoteKind | null {
  const m = /\.([a-z0-9]+)$/i.exec(path)
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (ext === 'md' || ext === 'markdown') return 'md'
  if (ext === 'html' || ext === 'htm') return 'html'
  if (IMAGE_EXT.has(ext)) return 'image'
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/noteKind.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/noteKind.ts tests/noteKind.test.ts
git commit -m "feat(notes): util classifyNoteFile (md/image/html)"
```

---

### Task 2: Arbre du vault — lister images + html avec `kind`

**Files:**
- Modify: `src/shared/ipc.ts` (type `NoteTreeNode`, ~ligne 116-122)
- Modify: `src/main/notes/noteTree.ts`
- Modify: `tests/noteTree.test.ts`

**Interfaces:**
- Consumes: `classifyNoteFile` (Task 1).
- Produces: `NoteTreeNode` gagne `kind?: NoteKind` (présent sur les fichiers ; absent sur les dossiers). `buildNoteTree` liste désormais les fichiers md/image/html ; l'index reste md-only.

- [ ] **Step 1: Update type `NoteTreeNode`**

Dans `src/shared/ipc.ts`, ajouter l'import en tête et le champ `kind`. L'interface actuelle :

```ts
export interface NoteTreeNode {
  name: string
  path: string
  dir: boolean
  children?: NoteTreeNode[] // présent si dir
}
```

devient :

```ts
import type { NoteKind } from './noteKind'
// … (l'import va en haut du fichier, avec les autres)

export interface NoteTreeNode {
  name: string
  path: string
  dir: boolean
  kind?: NoteKind          // présent sur les fichiers (md/image/html) ; absent sur les dossiers
  children?: NoteTreeNode[] // présent si dir
}
```

- [ ] **Step 2: Update the failing test**

Remplacer le contenu de `tests/noteTree.test.ts` par :

```ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { buildNoteTree, type DirEntry } from '../src/main/notes/noteTree'

const V = join('/', 'v')        // séparateur natif (\v sur Windows, /v sur POSIX)
const SUB = join(V, 'sub')

const fsMap: Record<string, DirEntry[]> = {
  [V]: [
    { name: 'b.md', dir: false },
    { name: 'a.md', dir: false },
    { name: 'sub', dir: true },
    { name: '.obsidian', dir: true },
    { name: 'image.png', dir: false },
    { name: 'page.html', dir: false },
    { name: 'notes.txt', dir: false }
  ],
  [SUB]: [{ name: 'a.md', dir: false }]
}
const listDir = (dir: string): DirEntry[] => fsMap[dir] ?? []

describe('buildNoteTree', () => {
  it('garde md/image/html + dossiers, dossiers en premier puis tri alpha', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.map((c) => c.name)).toEqual(['sub', 'a.md', 'b.md', 'image.png', 'page.html'])
  })

  it('exclut les types non supportés (.txt)', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.some((c) => c.name === 'notes.txt')).toBe(false)
  })

  it('renseigne kind sur les fichiers', () => {
    const t = buildNoteTree(V, listDir)
    const byName = Object.fromEntries(t.tree.children!.map((c) => [c.name, c]))
    expect(byName['a.md'].kind).toBe('md')
    expect(byName['image.png'].kind).toBe('image')
    expect(byName['page.html'].kind).toBe('html')
    expect(byName['sub'].kind).toBeUndefined()
  })

  it('ignore .obsidian et les dotfolders', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.some((c) => c.name === '.obsidian')).toBe(false)
  })

  it('index nom->chemin md-only (pas image/html), plus court chemin si collision', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.index['a']).toBe(join(V, 'a.md'))
    expect(t.index['b']).toBe(join(V, 'b.md'))
    expect(t.index['image']).toBeUndefined()
    expect(t.index['page']).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/noteTree.test.ts`
Expected: FAIL (image.png/page.html absents de la sortie, `kind` undefined).

- [ ] **Step 4: Update `noteTree.ts`**

Remplacer le contenu par (le tri place les fichiers après les dossiers ; les fichiers sont triés alpha, tous types confondus ; l'index ne prend que les md) :

```ts
// src/main/notes/noteTree.ts
import { join } from 'node:path'
import type { NoteTreeNode, NotesTree } from '../../shared/ipc'
import { classifyNoteFile } from '../../shared/noteKind'

export interface DirEntry { name: string; dir: boolean }
export type ListDir = (dir: string) => DirEntry[]

const IGNORED_DIRS = new Set(['.obsidian', '.git', '.trash', 'node_modules'])
const MD_RE = /\.(md|markdown)$/i

function isIgnoredDir(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name)
}

function noteKey(fileName: string): string {
  return fileName.replace(MD_RE, '').toLowerCase()
}

/** Construit l'arborescence (md/image/html + dossiers) et l'index nom->chemin (md-only, wikilinks). */
export function buildNoteTree(root: string, listDir: ListDir): NotesTree {
  const index: Record<string, string> = {}

  function walk(dir: string, name: string): NoteTreeNode {
    const entries = listDir(dir)
    const dirs = entries.filter((e) => e.dir && !isIgnoredDir(e.name)).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries
      .filter((e) => !e.dir && classifyNoteFile(e.name) !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
    const children: NoteTreeNode[] = []
    for (const d of dirs) children.push(walk(join(dir, d.name), d.name))
    for (const f of files) {
      const path = join(dir, f.name)
      const kind = classifyNoteFile(f.name)!
      children.push({ name: f.name, path, dir: false, kind })
      if (kind === 'md') {
        const key = noteKey(f.name)
        const prev = index[key]
        if (!prev || path.length < prev.length) index[key] = path
      }
    }
    return { name, path: dir, dir: true, children }
  }

  return { root, tree: walk(root, root), index }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/noteTree.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/main/notes/noteTree.ts tests/noteTree.test.ts
git commit -m "feat(notes): liste images/html dans l'arbre avec kind, index md-only"
```

---

### Task 3: Lecture brute HTML (`NotesReadRaw`)

**Files:**
- Modify: `src/shared/ipc.ts` (constante `IPC`, type `NoteRaw`, `HubApi`)
- Modify: `src/main/modules/notesModule.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/notesReadRaw.test.ts`

**Interfaces:**
- Produces:
  - `IPC.NotesReadRaw = 'notes:read-raw'`
  - `export interface NoteRaw { path: string; content: string }`
  - main handler `IPC.NotesReadRaw(root, path) => NotesResult<NoteRaw>` (garde `isInside`, borne `MAX_BYTES`, html uniquement)
  - `HubApi.notesReadRaw(root: string, path: string): Promise<NotesResult<NoteRaw>>`
- Une fonction pure testable `readHtmlRaw(root, path, fsRead)` extraite dans `src/main/notes/htmlRaw.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/notesReadRaw.test.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { readHtmlRaw } from '../src/main/notes/htmlRaw'

const ROOT = join('/', 'v')
const ok = (size: number, content: string) => ({
  read: (_p: string) => content,
  size: (_p: string) => size
})

describe('readHtmlRaw', () => {
  it('lit un .html sous le root', () => {
    const p = join(ROOT, 'page.html')
    const r = readHtmlRaw(ROOT, p, ok(100, '<h1>hi</h1>'))
    expect(r).toEqual({ ok: true, data: { path: p, content: '<h1>hi</h1>' } })
  })
  it('refuse un chemin hors root', () => {
    const r = readHtmlRaw(ROOT, join('/', 'other', 'x.html'), ok(10, 'x'))
    expect(r.ok).toBe(false)
  })
  it('refuse un fichier non-html', () => {
    const r = readHtmlRaw(ROOT, join(ROOT, 'a.md'), ok(10, 'x'))
    expect(r.ok).toBe(false)
  })
  it('refuse au-delà de la borne de taille', () => {
    const p = join(ROOT, 'big.html')
    const r = readHtmlRaw(ROOT, p, ok(11 * 1024 * 1024, 'x'))
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/notesReadRaw.test.ts`
Expected: FAIL (`Cannot find module '../src/main/notes/htmlRaw'`).

- [ ] **Step 3: Write `htmlRaw.ts`**

```ts
// src/main/notes/htmlRaw.ts
import { isInside } from './paths'
import type { NotesResult, NoteRaw } from '../../shared/ipc'

const HTML_RE = /\.(html|htm)$/i
const MAX_BYTES = 10 * 1024 * 1024 // 10 Mo

export interface RawFs {
  read: (path: string) => string
  size: (path: string) => number
}

/** Lecture brute d'un fichier .html borné, sous garde isInside. Fonction pure (fs injecté) pour test. */
export function readHtmlRaw(root: string, path: string, fs: RawFs): NotesResult<NoteRaw> {
  if (!isInside(root, path) || !HTML_RE.test(path)) return { ok: false, error: 'Chemin hors vault ou non-HTML' }
  try {
    if (fs.size(path) > MAX_BYTES) return { ok: false, error: 'Fichier HTML trop volumineux' }
    return { ok: true, data: { path, content: fs.read(path) } }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
```

- [ ] **Step 4: Add the shared type + IPC channel**

Dans `src/shared/ipc.ts` :
- Dans l'objet `IPC`, sous `NotesRead: 'notes:read',` ajouter : `NotesReadRaw: 'notes:read-raw',`
- Sous `export interface NoteFile { path: string; markdown: string }` ajouter : `export interface NoteRaw { path: string; content: string }`
- Dans `HubApi`, sous la ligne `notesRead(...)`, ajouter : `notesReadRaw(root: string, path: string): Promise<NotesResult<NoteRaw>>`

- [ ] **Step 5: Wire the main handler**

Dans `src/main/modules/notesModule.ts`, ajouter l'import en tête :

```ts
import { readFileSync, statSync } from 'node:fs'   // statSync est peut-être déjà importé — fusionner l'import
import { readHtmlRaw } from '../notes/htmlRaw'
import type { NoteRaw } from '../../shared/ipc'     // fusionner avec l'import de types existant
```

Puis, après le handler `IPC.NotesRead`, ajouter :

```ts
ctx.ipc.handle(IPC.NotesReadRaw, (_e, root: string, path: string): NotesResult<NoteRaw> =>
  readHtmlRaw(root, path, { read: (p) => readFileSync(p, 'utf8'), size: (p) => statSync(p).size })
)
```

- [ ] **Step 6: Wire the preload**

Dans `src/preload/index.ts`, après la ligne `notesRead: (root, path) => …`, ajouter :

```ts
  notesReadRaw: (root, path) => ipcRenderer.invoke(IPC.NotesReadRaw, root, path),
```

- [ ] **Step 7: Run test + typecheck**

Run: `npx vitest run tests/notesReadRaw.test.ts`
Expected: PASS (4 tests).
Run: `npm run build`
Expected: build OK (pas d'erreur TS).

- [ ] **Step 8: Commit**

```bash
git add src/shared/ipc.ts src/main/notes/htmlRaw.ts src/main/modules/notesModule.ts src/preload/index.ts tests/notesReadRaw.test.ts
git commit -m "feat(notes): lecture brute HTML bornee (NotesReadRaw)"
```

---

### Task 4: Icônes d'arbre par `kind`

**Files:**
- Modify: `src/renderer/src/components/NoteTree.tsx`

**Interfaces:**
- Consumes: `NoteTreeNode.kind` (Task 2).

- [ ] **Step 1: Update the file entry render**

Dans `NoteTree.tsx`, le bloc fichier (lignes ~35-40) affiche toujours `<NotesIcon/>` et retire l'extension `.md`. Le remplacer pour distinguer le `kind` : image et html gardent leur extension visible, et reçoivent un emoji. Remplacer le `return` final de `NoteTreeEntry` par :

```tsx
  const isMd = node.kind === 'md' || node.kind === undefined
  const label = isMd ? node.name.replace(/\.(md|markdown)$/i, '') : node.name
  const icon = node.kind === 'image' ? <span className="nt-emoji">🖼</span>
    : node.kind === 'html' ? <span className="nt-emoji">🌐</span>
    : <NotesIcon />
  return (
    <div className={`nt-row file${node.path === activePath ? ' active' : ''}`} style={pad} onClick={() => onOpen(node.path)} title={node.name}>
      <span className="nt-ic">{icon}</span>
      <span className="nt-name">{label}</span>
    </div>
  )
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NoteTree.tsx
git commit -m "feat(notes): icones image/html dans l'arbre du vault"
```

---

### Task 5: Vues image + HTML dans `NotesView`

**Files:**
- Create: `src/renderer/src/components/ImageView.tsx`
- Create: `src/renderer/src/components/HtmlView.tsx`
- Modify: `src/renderer/src/components/NotesView.tsx`
- Modify: `src/renderer/src/index.html` (styles `.img-view` / `.html-view`)

**Interfaces:**
- Consumes: `classifyNoteFile` (Task 1), `window.hub.notesAsset` (existant), `window.hub.notesReadRaw` (Task 3).

- [ ] **Step 1: Create `ImageView.tsx`**

```tsx
// src/renderer/src/components/ImageView.tsx
import React, { useEffect, useState } from 'react'

interface Props { root: string; filePath: string }

/** Affiche une image locale (data URI via notesAsset). Lecture seule, fit-to-width. */
export function ImageView({ root, filePath }: Props): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setSrc(null); setErr(null)
    void window.hub.notesAsset(root, filePath).then((r) => {
      if (cancelled) return
      if (r.ok) setSrc(r.data.dataUri)
      else setErr(r.error)
    })
    return () => { cancelled = true }
  }, [root, filePath])
  if (err) return <div className="notes-center notes-err">{err}</div>
  if (!src) return <div className="notes-center">Chargement…</div>
  return <div className="img-view"><img src={src} alt={filePath} /></div>
}
```

- [ ] **Step 2: Create `HtmlView.tsx`**

```tsx
// src/renderer/src/components/HtmlView.tsx
import React, { useEffect, useState } from 'react'

interface Props { root: string; filePath: string }

/** Affiche un .html dans une iframe sandboxée (scripts inline OK, isolée du reste de l'app). */
export function HtmlView({ root, filePath }: Props): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setContent(null); setErr(null)
    void window.hub.notesReadRaw(root, filePath).then((r) => {
      if (cancelled) return
      if (r.ok) setContent(r.data.content)
      else setErr(r.error)
    })
    return () => { cancelled = true }
  }, [root, filePath])
  if (err) return <div className="notes-center notes-err">{err}</div>
  if (content === null) return <div className="notes-center">Chargement…</div>
  // allow-scripts SANS allow-same-origin : origine opaque, pas d'accès à l'app, réseau bloqué.
  return <iframe className="html-view" sandbox="allow-scripts" srcDoc={content} title={filePath} />
}
```

- [ ] **Step 3: Branch in `NotesView.tsx`**

Ajouter l'import en tête :

```tsx
import { classifyNoteFile } from '../../../shared/noteKind'
import { ImageView } from './ImageView'
import { HtmlView } from './HtmlView'
```

Dans `NotesView`, calculer le `kind` de `activePath` (après la ligne `const activePath = note.activePath`) :

```tsx
  const activeKind = activePath ? classifyNoteFile(activePath) : null
```

Ne lire le markdown que pour les `md`. Modifier `readFile` :

```tsx
  const readFile = useCallback(async (path: string) => {
    if (classifyNoteFile(path) !== 'md') { setMarkdown(''); setErr(null); return }
    const r = await window.hub.notesRead(note.root, path)
    if (r.ok) { setMarkdown(r.data.markdown); setErr(null) }
    else { setErr(r.error); setMarkdown('') }
  }, [note.root])
```

Remplacer le rendu du contenu (le bloc ternaire dans `.notes-content`) par un branchement sur `activeKind` :

```tsx
        <div className="notes-content">
          {err
            ? <div className="notes-center notes-err">{err}</div>
            : !activePath
              ? <div className="notes-center">Aucun fichier.</div>
              : activeKind === 'image'
                ? <ImageView root={note.root} filePath={activePath} />
                : activeKind === 'html'
                  ? <HtmlView root={note.root} filePath={activePath} />
                  : <MarkdownView root={note.root} filePath={activePath} markdown={markdown} index={index} onOpenInternal={(p) => open(p)} query={query} activeIdx={activeIdx} onMatchCount={setMatchCount} />}
        </div>
```

Note : la barre Ctrl+F reste affichée mais inerte pour image/html (`matchCount` reste 0 car `MarkdownView` n'est pas monté). C'est acceptable ; pas de changement requis.

- [ ] **Step 4: Add styles**

Dans `src/renderer/src/index.html`, dans le `<style>`, ajouter (à côté des règles `.md-view` / `.notes-content`) :

```css
.img-view { width: 100%; height: 100%; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 16px; box-sizing: border-box; }
.img-view img { max-width: 100%; height: auto; }
.html-view { width: 100%; height: 100%; border: 0; background: #fff; }
.nt-emoji { font-size: 13px; line-height: 1; }
```

- [ ] **Step 5: Typecheck + run app**

Run: `npm run build`
Expected: build OK.
Vérif manuelle : ouvrir un vault contenant un `.png`, un `.jpeg` et un `.html` autoporté → l'arbre les liste, le clic affiche l'image / la page HTML rendue.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ImageView.tsx src/renderer/src/components/HtmlView.tsx src/renderer/src/components/NotesView.tsx src/renderer/src/index.html
git commit -m "feat(notes): vues image et HTML (iframe sandboxee) dans le lecteur"
```

---

## Partie B — Skill `/dide-open` + bridge

### Task 6: Canal IPC `DideOpen` + preload

**Files:**
- Modify: `src/shared/ipc.ts` (`IPC`, `DideOpenPayload`, `HubApi`)
- Modify: `src/preload/index.ts`

**Interfaces:**
- Produces:
  - `IPC.DideOpen = 'dide:open'`
  - `export interface DideOpenPayload { tabId: string | null; absPath: string; isDir: boolean }`
  - `HubApi.onDideOpen(cb: (p: DideOpenPayload) => void): Unsub`

- [ ] **Step 1: Add channel + type**

Dans `src/shared/ipc.ts` :
- Dans `IPC`, sous `NotesChanged: 'notes:changed'`, ajouter (attention à la virgule sur la ligne précédente) : `,\n  DideOpen: 'dide:open'`
- Après `export type Unsub = () => void`, ajouter : `export interface DideOpenPayload { tabId: string | null; absPath: string; isDir: boolean }`
- Dans `HubApi`, après `onNotesChanged(...)`, ajouter : `onDideOpen(cb: (p: DideOpenPayload) => void): Unsub`

- [ ] **Step 2: Wire preload**

Dans `src/preload/index.ts`, mettre à jour l'import de types pour inclure `DideOpenPayload`, puis après la ligne `onNotesChanged: …`, ajouter (ajouter la virgule après la ligne précédente) :

```ts
  onDideOpen: (cb) => on(IPC.DideOpen, (p) => cb(p as DideOpenPayload))
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts
git commit -m "feat(dide-open): canal IPC DideOpen + preload"
```

---

### Task 7: Store `openNoteRoot` (file ou vault)

**Files:**
- Modify: `src/renderer/src/store.ts` (interface `HubState` ~ligne 115 ; impl `openNoteFile` ~ligne 278)
- Test: `tests/store.test.ts` (ajout d'un bloc describe)

**Interfaces:**
- Produces: `openNoteRoot: (absPath: string, rootKind: 'vault' | 'file', nearItemId: string) => void`. `openNoteFile` devient un wrapper (`rootKind: 'file'`). Déduplication : un item note avec le même `root` est réactivé.

- [ ] **Step 1: Write the failing test**

Ajouter ce `describe` à la fin de `tests/store.test.ts`. Il réutilise les helpers déjà présents en tête du fichier : `mkItem(id, over?)`, et les actions `useHub.getState().addGroup(name)` / `.addItem(groupId, item)` / `.reset()`.

```ts
describe('openNoteRoot', () => {
  beforeEach(() => useHub.getState().reset())

  it('ouvre un vault dans le groupe de l\'item de référence (activePath null)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('it1'))
    useHub.getState().openNoteRoot('/some/vault', 'vault', 'it1')
    const note = useHub.getState().groups.flatMap((x) => x.items).find((i) => i.kind === 'note')
    expect(note?.note).toEqual({ root: '/some/vault', rootKind: 'vault', activePath: null })
  })

  it('ouvre un fichier (activePath = le fichier)', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('it1'))
    useHub.getState().openNoteRoot('/some/file.md', 'file', 'it1')
    const note = useHub.getState().groups.flatMap((x) => x.items).find((i) => i.kind === 'note')
    expect(note?.note).toEqual({ root: '/some/file.md', rootKind: 'file', activePath: '/some/file.md' })
  })

  it('déduplique : même root => réactive l\'item existant sans en créer un nouveau', () => {
    const g = useHub.getState().addGroup('M')
    useHub.getState().addItem(g, mkItem('it1'))
    useHub.getState().openNoteRoot('/some/vault', 'vault', 'it1')
    const countAfterFirst = useHub.getState().groups.flatMap((x) => x.items).filter((i) => i.kind === 'note').length
    useHub.getState().openNoteRoot('/some/vault', 'vault', 'it1')
    const countAfterSecond = useHub.getState().groups.flatMap((x) => x.items).filter((i) => i.kind === 'note').length
    expect(countAfterFirst).toBe(1)
    expect(countAfterSecond).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL (`openNoteRoot is not a function`).

- [ ] **Step 3: Update the interface**

Dans `src/renderer/src/store.ts`, dans `interface HubState`, remplacer la ligne :

```ts
  openNoteFile: (absPath: string, nearItemId: string) => void
```

par :

```ts
  openNoteFile: (absPath: string, nearItemId: string) => void
  openNoteRoot: (absPath: string, rootKind: 'vault' | 'file', nearItemId: string) => void
```

- [ ] **Step 4: Implement**

Remplacer l'implémentation actuelle de `openNoteFile` (lignes ~278-291) par `openNoteRoot` + wrapper :

```ts
  openNoteFile: (absPath, nearItemId) => get().openNoteRoot(absPath, 'file', nearItemId),
  openNoteRoot: (absPath, rootKind, nearItemId) => {
    const s = get()
    const existing = s.groups.flatMap((g) => g.items).find((i) => i.kind === 'note' && i.note?.root === absPath)
    if (existing) { get().setActiveItem(existing.id); return }
    const group = s.groups.find((g) => g.items.some((i) => i.id === nearItemId))
    if (!group) return
    const src = group.items.find((i) => i.id === nearItemId)
    const split: 1 | 2 = src?.split === 2 ? 1 : 2
    get().addItem(group.id, {
      id: uid('note'), name: basename(absPath), cwd: '', pinned: false, tabId: null, state: 'done',
      agents: [], openAgentId: null, split, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'note', note: { root: absPath, rootKind, activePath: rootKind === 'file' ? absPath : null }
    })
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(dide-open): store openNoteRoot (file ou vault) + dedup"
```

---

### Task 8: Module main `dideOpenModule`

**Files:**
- Create: `src/main/notes/resolveDideTarget.ts` (logique pure testable)
- Create: `src/main/modules/dideOpenModule.ts`
- Modify: `src/main/index.ts` (import + ajout au tableau `modules`)
- Test: `tests/resolveDideTarget.test.ts`

**Interfaces:**
- Consumes: `ctx.hookServer.onEvent`, `ctx.registry.get(tabId)`, `ctx.sender.send`, `IPC.DideOpen`, `DideOpenPayload` (Task 6).
- Produces:
  - `resolveDideTarget(rawPath, cwd, fs) => { absPath: string; isDir: boolean } | null` (null = introuvable)
  - module `createDideOpenModule(): HubModule`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/resolveDideTarget.test.ts
import { describe, it, expect } from 'vitest'
import { isAbsolute, join } from 'node:path'
import { resolveDideTarget } from '../src/main/notes/resolveDideTarget'

const CWD = join('/', 'home', 'proj')
const files = new Set([join(CWD, 'out.md'), join('/', 'abs', 'x.html')])
const dirs = new Set([join(CWD, 'docs')])
const fs = {
  exists: (p: string) => files.has(p) || dirs.has(p),
  isDir: (p: string) => dirs.has(p)
}

describe('resolveDideTarget', () => {
  it('résout un chemin relatif via le cwd (fichier)', () => {
    expect(resolveDideTarget('out.md', CWD, fs)).toEqual({ absPath: join(CWD, 'out.md'), isDir: false })
  })
  it('résout un dossier relatif', () => {
    expect(resolveDideTarget('docs', CWD, fs)).toEqual({ absPath: join(CWD, 'docs'), isDir: true })
  })
  it('accepte un chemin absolu', () => {
    const p = join('/', 'abs', 'x.html')
    expect(resolveDideTarget(p, CWD, fs)).toEqual({ absPath: p, isDir: false })
    expect(isAbsolute(p)).toBe(true)
  })
  it('renvoie null si le chemin n\'existe pas', () => {
    expect(resolveDideTarget('nope.md', CWD, fs)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/resolveDideTarget.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write `resolveDideTarget.ts`**

```ts
// src/main/notes/resolveDideTarget.ts
import { isAbsolute, resolve } from 'node:path'

export interface TargetFs {
  exists: (path: string) => boolean
  isDir: (path: string) => boolean
}

/** Résout un chemin (absolu ou relatif au cwd) et indique fichier/dossier. null si absent. */
export function resolveDideTarget(rawPath: string, cwd: string, fs: TargetFs): { absPath: string; isDir: boolean } | null {
  const absPath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(cwd, rawPath)
  if (!fs.exists(absPath)) return null
  return { absPath, isDir: fs.isDir(absPath) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/resolveDideTarget.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `dideOpenModule.ts`**

```ts
// src/main/modules/dideOpenModule.ts
import { existsSync, statSync } from 'node:fs'
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { DideOpenPayload } from '../../shared/ipc'
import { resolveDideTarget } from '../notes/resolveDideTarget'

interface DideEvent { kind?: string; tabId?: string | null; path?: string }

/** Reçoit les commandes /dide-open (POST sur le HookServer) et les route vers le renderer. */
export function createDideOpenModule(): HubModule {
  return {
    name: 'dide-open',
    register(ctx: AppContext): void {
      ctx.hookServer.onEvent((raw: unknown) => {
        const e = raw as DideEvent
        if (e?.kind !== 'dide-open' || typeof e.path !== 'string') return
        const tabId = typeof e.tabId === 'string' ? e.tabId : null
        const cwd = (tabId && ctx.registry.get(tabId)?.cwd) || ctx.defaultCwd
        const target = resolveDideTarget(e.path, cwd, {
          exists: (p) => existsSync(p),
          isDir: (p) => statSync(p).isDirectory()
        })
        if (!target) { console.warn(`[dide-open] cible introuvable: ${e.path} (cwd=${cwd})`); return }
        const payload: DideOpenPayload = { tabId, absPath: target.absPath, isDir: target.isDir }
        ctx.sender.send(IPC.DideOpen, payload)
      })
    }
  }
}
```

- [ ] **Step 6: Register the module**

Dans `src/main/index.ts` :
- Ajouter l'import après `import { createNotesModule } …` : `import { createDideOpenModule } from './modules/dideOpenModule'`
- Dans le tableau `modules`, ajouter après `createNotesModule()` (ajouter la virgule) : `createDideOpenModule()`

- [ ] **Step 7: Typecheck**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 8: Commit**

```bash
git add src/main/notes/resolveDideTarget.ts src/main/modules/dideOpenModule.ts src/main/index.ts tests/resolveDideTarget.test.ts
git commit -m "feat(dide-open): module main de routage hook -> IPC"
```

---

### Task 9: Câblage renderer (`App.tsx`)

**Files:**
- Modify: `src/renderer/src/App.tsx` (bloc `useEffect` de câblage IPC, ~ligne 50-71)

**Interfaces:**
- Consumes: `window.hub.onDideOpen` (Task 6), `store.openNoteRoot` (Task 7), `store.itemByTab` (existant).

- [ ] **Step 1: Subscribe to DideOpen**

Dans le `useEffect` de câblage IPC d'`App.tsx`, ajouter au tableau `unsubs` (avant le `return`) :

```tsx
    unsubs.push(window.hub.onDideOpen((p) => {
      const s = useHub.getState()
      // Item de la session émettrice → on ouvre dans SON groupe ; sinon fallback sur le groupe actif.
      const near = (p.tabId && s.itemByTab(p.tabId)) || s.groups.find((g) => g.id === s.activeGroupId)?.items[0]
      if (!near) return
      useHub.getState().openNoteRoot(p.absPath, p.isDir ? 'vault' : 'file', near.id)
    }))
```

> Vérifier dans `store.ts` le nom exact du sélecteur de groupe actif (`activeGroupId`) et que `groups[].items[0]` existe ; si le groupe actif peut être vide, le fallback `near` sera `undefined` et on ne fait rien (sûr).

- [ ] **Step 2: Typecheck + manual check**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(dide-open): ouverture renderer dans le groupe de la session"
```

---

### Task 10: Skill globale `/dide-open`

**Files:**
- Create: `~/.claude/skills/dide-open/SKILL.md`
- Create: `~/.claude/skills/dide-open/post.mjs`

> Sous Git Bash le chemin est `~/.claude/skills/dide-open/` ; sous PowerShell `C:\Users\daniel.gavriline\.claude\skills\dide-open\`.

**Interfaces:**
- Consumes: env `DIFAI_HUB_PORT`, `DIFAI_HUB_TAB` (présents dans toute session hébergée par difai-ide) ; endpoint `POST http://127.0.0.1:$DIFAI_HUB_PORT/` attendu par `dideOpenModule` (Task 8).

- [ ] **Step 1: Write `post.mjs`**

```js
// ~/.claude/skills/dide-open/post.mjs
// Usage: node post.mjs "<chemin fichier ou dossier>"
const path = process.argv[2]
const port = process.env.DIFAI_HUB_PORT
const tabId = process.env.DIFAI_HUB_TAB ?? null

if (!port) {
  console.error('Pas dans difai-ide (DIFAI_HUB_PORT absent) — /dide-open indisponible.')
  process.exit(1)
}
if (!path) {
  console.error('Chemin manquant. Usage: /dide-open <chemin>')
  process.exit(1)
}

try {
  await fetch(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'dide-open', tabId, path })
  })
  console.log(`Demande d'ouverture envoyée à difai-ide : ${path}`)
} catch (err) {
  console.error(`Échec de l'envoi à difai-ide : ${err.message}`)
  process.exit(1)
}
```

- [ ] **Step 2: Write `SKILL.md`**

```markdown
---
name: dide-open
description: Ouvre un fichier ou un dossier en onglet dans difai-ide, dans le groupe de la session courante. Utiliser quand l'utilisateur demande "ouvre-moi dans difai", "/dide-open <chemin>", "affiche ce fichier dans l'IDE", "ouvre le .md/.html/image que tu viens de générer". Fonctionne uniquement dans une session hébergée par difai-ide (variables DIFAI_HUB_PORT/DIFAI_HUB_TAB).
---

# /dide-open — Ouvrir dans difai-ide

Ouvre un fichier (md, image, html) ou un dossier (comme vault) en onglet dans
difai-ide, dans le groupe de la session courante.

## Procédure

1. Déterminer le chemin cible. Si l'utilisateur dit « ce que tu viens de générer »,
   utiliser le chemin du dernier fichier que tu as créé/écrit dans ce tour.
   Le chemin peut être relatif (résolu côté difai-ide par rapport au cwd de la session)
   ou absolu.
2. Lancer le POST via le script (multiplateforme, ne dépend pas du shell) :

   ```bash
   node "$HOME/.claude/skills/dide-open/post.mjs" "<chemin>"
   ```

   Sous PowerShell :

   ```powershell
   node "$env:USERPROFILE\.claude\skills\dide-open\post.mjs" "<chemin>"
   ```

3. Rapporter à l'utilisateur le résultat affiché par le script.

## Notes

- Si le script répond « Pas dans difai-ide », la session n'est pas hébergée par
  l'IDE : l'ouverture n'est pas possible, l'indiquer simplement.
- L'ouverture se fait dans le groupe de la session émettrice. Si difai-ide ne
  retrouve pas la session, il ouvre dans le groupe actif courant.
```

- [ ] **Step 3: Manual end-to-end check**

Dans une session Claude lancée depuis un onglet difai-ide (après avoir buildé/relancé l'app avec les Tasks 6-9) :
- Créer un fichier de test, ex. `notes-demo.md`.
- Invoquer `/dide-open notes-demo.md`.
- Attendu : un nouvel onglet note s'ouvre dans le groupe courant et affiche le fichier.
- Tester aussi avec un `.png`, un `.html`, et un dossier (ouverture en vault).

- [ ] **Step 4: (pas de commit repo)**

La skill vit hors du repo (`~/.claude/skills/`). Rien à committer ici. Noter dans la PR que la skill est installée globalement (la documenter pour réinstallation : copier les 2 fichiers).

---

## Notes de fin

- Après l'ensemble, relancer la suite de tests complète : `npx vitest run` (tout vert) et `npm run build` (OK).
- Mettre à jour la mémoire projet (`difai-ide-notes-markdown.md`) : le lecteur gère désormais image + HTML ; nouveau bridge `/dide-open`.
- La copie déployée `Desktop/difai-ide` devra être mise à jour chirurgicalement (cf. mémoire `difai-ide-deploy-copy`) — hors scope de ce plan.
