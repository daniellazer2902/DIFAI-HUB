# Lecteur Markdown / Obsidian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lire un vault Obsidian (dossier de `.md`) ou un fichier `.md` isolé directement dans DIFAI-IDE, avec rendu GFM + bases Obsidian (wikilinks, embeds image, callouts), liens cliquables, images, et live-reload — en lecture seule.

**Architecture:** Nouveau `kind: 'note'` d'item (à côté de `claude`/`ado`/`cmd`). Un module main `notesModule` lit le disque (arbo, fichier, asset→data URI), surveille via chokidar et ouvre les liens externes. Côté renderer, un pipeline pur `preprocessObsidian → markdown-it → sanitizeMarkdownHtml` produit le HTML, et le composant `NotesView` (arborescence + viewer `MarkdownView`) gère navigation, images différées et live-reload. La logique pure (arbo, résolution de chemins, préprocessing, rendu, sanitize, transforms DOM) est extraite et testée en isolation ; le module main et les composants sont du glue vérifié au build + manuellement.

**Tech Stack:** Electron + React 19 + Zustand (existant) ; ajout `markdown-it` + `highlight.js` ; `chokidar` (déjà présent) ; tests `vitest` + `jsdom`.

---

## File Structure

**Partagé**
- Modify `src/shared/ipc.ts` — types Notes + canaux IPC + signatures `HubApi`.

**Main (logique pure + glue)**
- Create `src/main/notes/noteTree.ts` — `buildNoteTree(root, listDir)` : arbo + index wikilink.
- Create `src/main/notes/assets.ts` — `mimeForExt`, `readAssetDataUri`.
- Create `src/main/notes/paths.ts` — `isInside`, `resolveRelativeLink`, `normNoteKey`, `resolveWikilink`.
- Create `src/main/modules/notesModule.ts` — handlers IPC + watchers chokidar (glue).
- Modify `src/main/index.ts` — enregistre le module.

**Preload**
- Modify `src/preload/index.ts` — expose l'API notes.

**Renderer — logique pure (testée)**
- Create `src/renderer/src/markdown/obsidian.ts` — `stripFrontmatter`, `preprocessObsidian`.
- Create `src/renderer/src/markdown/render.ts` — `renderMarkdown(md, ctx)` (markdown-it configuré).
- Create `src/renderer/src/markdown/domTransforms.ts` — `transformCallouts`, `transformTaskLists`.
- Create `src/renderer/src/sanitizeMarkdown.ts` — `sanitizeMarkdownHtml`.
- Modify `src/renderer/src/util.ts` — `dirOf`, `joinPath`.
- Modify `src/renderer/src/settings.ts` — `readDefaultVault`, `writeDefaultVault`.

**Renderer — state & UI**
- Modify `src/renderer/src/store.ts` — `kind:'note'`, `TabKind 'note'`, champ `note`, refs, persistance.
- Modify `src/renderer/src/App.tsx` — saute les items `note` au relancement pty.
- Create `src/renderer/src/components/MarkdownView.tsx` — rendu HTML + images différées + embeds + clics.
- Create `src/renderer/src/components/NoteTree.tsx` — arborescence repliable.
- Create `src/renderer/src/components/NotesView.tsx` — orchestration (arbo + viewer + historique + live-reload).
- Modify `src/renderer/src/components/Pane.tsx` — onglet + corps `note` + entrées menu `+`.
- Modify `src/renderer/src/components/icons.tsx` — `NotesIcon`.
- Modify `src/renderer/src/components/Settings.tsx` — réglage « Vault par défaut ».
- Modify `src/renderer/index.html` — CSS du viewer/arbo/markdown + thème highlight.

---

## Task 1 : Types & canaux IPC partagés

**Files:**
- Modify: `src/shared/ipc.ts`

- [ ] **Step 1 : Ajouter les canaux dans l'objet `IPC`**

Dans l'objet `IPC` (avant la ligne `// main -> renderer`), ajouter les entrées renderer→main :

```ts
  // Notes / Markdown (renderer -> main)
  NotesPickFolder: 'notes:pick-folder',
  NotesPickFile: 'notes:pick-file',
  NotesTree: 'notes:tree',
  NotesRead: 'notes:read',
  NotesAsset: 'notes:asset',
  NotesOpenExternal: 'notes:open-external',
  NotesWatch: 'notes:watch',
  NotesUnwatch: 'notes:unwatch',
```

Dans la section `// main -> renderer`, ajouter :

```ts
  NotesChanged: 'notes:changed',
```

- [ ] **Step 2 : Ajouter les types Notes** (après le bloc ADO, avant `export type Unsub`)

```ts
// --- Notes / Markdown (lecteur Obsidian) ---
export interface NoteTreeNode {
  name: string            // nom affiché (fichier ou dossier)
  path: string            // chemin absolu
  dir: boolean
  children?: NoteTreeNode[] // présent si dir
}
export interface NotesTree {
  root: string
  tree: NoteTreeNode                 // nœud racine (dir)
  index: Record<string, string>      // clé = nom de fichier .md sans extension, en minuscules -> chemin absolu
}
export interface NoteFile { path: string; markdown: string }
export interface NoteAsset { dataUri: string }
export type NotesResult<T> = { ok: true; data: T } | { ok: false; error: string }
/** Sous-ensemble persistable d'un item note. */
export interface PersistNote { root: string; rootKind: 'vault' | 'file'; activePath: string | null }
```

- [ ] **Step 3 : Étendre `PersistItem`**

Remplacer la ligne `export interface PersistItem ...` par (ajout de `'note'` au kind et du champ `note`) :

```ts
export interface PersistItem { id: string; name: string; cwd: string; split?: 1 | 2; kind?: 'claude' | 'ado' | 'cmd' | 'note'; claudeArgs?: string[]; ado?: { view: 'tree' | 'board'; iterationPath: string | null }; note?: PersistNote }
```

- [ ] **Step 4 : Ajouter les méthodes au contrat `HubApi`** (avant la `}` finale de l'interface)

```ts
  notesPickFolder(): Promise<string | null>
  notesPickFile(): Promise<string | null>
  notesTree(root: string): Promise<NotesResult<NotesTree>>
  notesRead(root: string, path: string): Promise<NotesResult<NoteFile>>
  notesAsset(root: string, path: string): Promise<NotesResult<NoteAsset>>
  notesOpenExternal(url: string): void
  notesWatch(itemId: string, root: string): void
  notesUnwatch(itemId: string): void
  onNotesChanged(cb: (itemId: string, event: string, path: string) => void): Unsub
```

- [ ] **Step 5 : Vérifier la compilation des types**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: aucune erreur liée à `ipc.ts` (des erreurs « not implemented » apparaîtront ailleurs tant que preload/main ne sont pas faits — c'est attendu, on les corrige aux tâches suivantes).

- [ ] **Step 6 : Commit**

```bash
git add src/shared/ipc.ts
git commit -m "feat(notes): types et canaux IPC du lecteur Markdown"
```

---

## Task 2 : `buildNoteTree` (arborescence + index)

**Files:**
- Create: `src/main/notes/noteTree.ts`
- Test: `tests/noteTree.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/noteTree.test.ts
// NB : chemins construits avec join() pour rester cross-platform (Windows utilise \ ).
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { buildNoteTree, type DirEntry } from '../src/main/notes/noteTree'

const V = join('/', 'v')
const SUB = join(V, 'sub')
const fsMap: Record<string, DirEntry[]> = {
  [V]: [
    { name: 'b.md', dir: false },
    { name: 'a.md', dir: false },
    { name: 'sub', dir: true },
    { name: '.obsidian', dir: true },
    { name: 'image.png', dir: false },
    { name: 'notes.txt', dir: false }
  ],
  [SUB]: [{ name: 'a.md', dir: false }]
}
const listDir = (dir: string): DirEntry[] => fsMap[dir] ?? []

describe('buildNoteTree', () => {
  it('ne garde que les .md et les dossiers, dossiers en premier puis tri alpha', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.map((c) => c.name)).toEqual(['sub', 'a.md', 'b.md'])
  })

  it('ignore .obsidian et les dotfolders', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.tree.children!.some((c) => c.name === '.obsidian')).toBe(false)
  })

  it('construit un index nom->chemin, plus court chemin en cas de collision', () => {
    const t = buildNoteTree(V, listDir)
    expect(t.index['a']).toBe(join(V, 'a.md'))
    expect(t.index['b']).toBe(join(V, 'b.md'))
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/noteTree.test.ts`
Expected: FAIL — `buildNoteTree` introuvable.

- [ ] **Step 3 : Implémenter**

```ts
// src/main/notes/noteTree.ts
import { join } from 'node:path'
import type { NoteTreeNode, NotesTree } from '../../shared/ipc'

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

/** Construit l'arborescence (.md + dossiers) et l'index nom->chemin pour les wikilinks. */
export function buildNoteTree(root: string, listDir: ListDir): NotesTree {
  const index: Record<string, string> = {}

  function walk(dir: string, name: string): NoteTreeNode {
    const entries = listDir(dir)
    const dirs = entries.filter((e) => e.dir && !isIgnoredDir(e.name)).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries.filter((e) => !e.dir && MD_RE.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))
    const children: NoteTreeNode[] = []
    for (const d of dirs) children.push(walk(join(dir, d.name), d.name))
    for (const f of files) {
      const path = join(dir, f.name)
      children.push({ name: f.name, path, dir: false })
      const key = noteKey(f.name)
      const prev = index[key]
      if (!prev || path.length < prev.length) index[key] = path
    }
    return { name, path: dir, dir: true, children }
  }

  return { root, tree: walk(root, root), index }
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/noteTree.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/main/notes/noteTree.ts tests/noteTree.test.ts
git commit -m "feat(notes): construction de l'arborescence + index wikilink"
```

---

## Task 3 : Résolution de chemins (`paths.ts`)

**Files:**
- Create: `src/main/notes/paths.ts`
- Test: `tests/notePaths.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/notePaths.test.ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { isInside, resolveRelativeLink, normNoteKey, resolveWikilink } from '../src/main/notes/paths'

describe('isInside', () => {
  const root = resolve('/vault')
  it('accepte un chemin sous la racine', () => {
    expect(isInside(root, resolve('/vault/sub/a.md'))).toBe(true)
    expect(isInside(root, root)).toBe(true)
  })
  it('rejette un chemin hors racine (path traversal)', () => {
    expect(isInside(root, resolve('/vault/../secret.md'))).toBe(false)
    expect(isInside(root, resolve('/autre/a.md'))).toBe(false)
  })
})

describe('resolveRelativeLink', () => {
  it('résout relativement au dossier du fichier source', () => {
    const from = resolve('/vault/sub/doc.md')
    expect(resolveRelativeLink(from, '../a.md')).toBe(resolve('/vault/a.md'))
    expect(resolveRelativeLink(from, 'img/x.png')).toBe(resolve('/vault/sub/img/x.png'))
  })
})

describe('resolveWikilink', () => {
  const index = { 'a': '/vault/a.md', 'mon doc': '/vault/Mon Doc.md' }
  it('trouve par nom insensible à la casse, ignore #ancre et chemin', () => {
    expect(resolveWikilink(index, 'A')).toBe('/vault/a.md')
    expect(resolveWikilink(index, 'Mon Doc#section')).toBe('/vault/Mon Doc.md')
    expect(resolveWikilink(index, 'folder/a')).toBe('/vault/a.md')
  })
  it('renvoie null si absent', () => {
    expect(resolveWikilink(index, 'inconnu')).toBeNull()
  })
})

describe('normNoteKey', () => {
  it('retire dossier, extension, #ancre et met en minuscules', () => {
    expect(normNoteKey('folder/Mon Doc.md#x')).toBe('mon doc')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/notePaths.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
// src/main/notes/paths.ts
import { resolve, dirname, sep } from 'node:path'

/** Vrai si `target` est sous `root` (égal ou descendant), après normalisation. */
export function isInside(root: string, target: string): boolean {
  const r = resolve(root)
  const t = resolve(target)
  return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep)
}

/** Résout un lien relatif par rapport au DOSSIER du fichier source (chemin absolu). */
export function resolveRelativeLink(fromFile: string, href: string): string {
  return resolve(dirname(fromFile), href)
}

/** Normalise une cible de wikilink en clé d'index : sans dossier, sans extension, sans #ancre, minuscules. */
export function normNoteKey(target: string): string {
  const noAnchor = target.split('#')[0]
  const base = noAnchor.split(/[\\/]/).pop() ?? noAnchor
  return base.replace(/\.(md|markdown)$/i, '').trim().toLowerCase()
}

/** Résout un wikilink via l'index nom->chemin ; null si introuvable. */
export function resolveWikilink(index: Record<string, string>, target: string): string | null {
  return index[normNoteKey(target)] ?? null
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/notePaths.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/main/notes/paths.ts tests/notePaths.test.ts
git commit -m "feat(notes): resolution de chemins (confinement, relatif, wikilink)"
```

---

## Task 4 : Assets → data URI (`assets.ts`)

**Files:**
- Create: `src/main/notes/assets.ts`
- Test: `tests/noteAssets.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/noteAssets.test.ts
import { describe, it, expect } from 'vitest'
import { mimeForExt, toDataUri } from '../src/main/notes/assets'

describe('mimeForExt', () => {
  it('mappe les extensions image courantes', () => {
    expect(mimeForExt('.png')).toBe('image/png')
    expect(mimeForExt('.JPG')).toBe('image/jpeg')
    expect(mimeForExt('.svg')).toBe('image/svg+xml')
    expect(mimeForExt('.webp')).toBe('image/webp')
  })
  it('renvoie null pour une extension non supportée', () => {
    expect(mimeForExt('.exe')).toBeNull()
  })
})

describe('toDataUri', () => {
  it('encode mime + base64', () => {
    expect(toDataUri('image/png', Buffer.from('AB'))).toBe('data:image/png;base64,QUI=')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/noteAssets.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// src/main/notes/assets.ts
import { extname } from 'node:path'
import { readFileSync, statSync } from 'node:fs'

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon'
}
const MAX_BYTES = 10 * 1024 * 1024 // 10 Mo

export function mimeForExt(ext: string): string | null {
  return MIME[ext.toLowerCase()] ?? null
}

export function toDataUri(mime: string, buf: Buffer): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Lit une image locale -> data URI, ou null (type non supporté / trop volumineux / illisible). */
export function readAssetDataUri(absPath: string): string | null {
  const mime = mimeForExt(extname(absPath))
  if (!mime) return null
  try {
    if (statSync(absPath).size > MAX_BYTES) return null
    return toDataUri(mime, readFileSync(absPath))
  } catch {
    return null
  }
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/noteAssets.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/main/notes/assets.ts tests/noteAssets.test.ts
git commit -m "feat(notes): lecture d'images locales en data URI"
```

---

## Task 5 : Module main `notesModule` + câblage

**Files:**
- Create: `src/main/modules/notesModule.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1 : Implémenter le module** (glue : pas de test unitaire, vérifié au build + manuellement)

```ts
// src/main/modules/notesModule.ts
import { readdirSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { dialog, shell } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { NotesResult, NotesTree, NoteFile, NoteAsset } from '../../shared/ipc'
import { buildNoteTree, type DirEntry } from '../notes/noteTree'
import { isInside } from '../notes/paths'
import { readAssetDataUri } from '../notes/assets'

const MD_RE = /\.(md|markdown)$/i

function listDir(dir: string): DirEntry[] {
  return readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() }))
}

export function createNotesModule(): HubModule {
  return {
    name: 'notes',
    register(ctx: AppContext): void {
      const watchers = new Map<string, FSWatcher>() // itemId -> watcher

      ctx.ipc.handle(IPC.NotesPickFolder, async () => {
        const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
        return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
      })
      ctx.ipc.handle(IPC.NotesPickFile, async () => {
        const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] })
        return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
      })
      ctx.ipc.handle(IPC.NotesTree, (_e, root: string): NotesResult<NotesTree> => {
        try { return { ok: true, data: buildNoteTree(root, listDir) } }
        catch (err) { return { ok: false, error: (err as Error).message } }
      })
      ctx.ipc.handle(IPC.NotesRead, (_e, root: string, path: string): NotesResult<NoteFile> => {
        try {
          if (!isInside(root, path) || !MD_RE.test(path)) return { ok: false, error: 'Chemin hors vault' }
          return { ok: true, data: { path, markdown: readFileSync(path, 'utf8') } }
        } catch (err) { return { ok: false, error: (err as Error).message } }
      })
      ctx.ipc.handle(IPC.NotesAsset, (_e, root: string, path: string): NotesResult<NoteAsset> => {
        if (!isInside(root, path)) return { ok: false, error: 'Asset hors vault' }
        const dataUri = readAssetDataUri(path)
        return dataUri ? { ok: true, data: { dataUri } } : { ok: false, error: `Image illisible: ${extname(path)}` }
      })
      // Fire-and-forget (preload utilise ipcRenderer.send) -> ctx.ipc.on, comme sessionModule pour input/resize/kill.
      ctx.ipc.on(IPC.NotesOpenExternal, (_e, url: string) => {
        if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
      })
      ctx.ipc.on(IPC.NotesWatch, (_e, itemId: string, root: string) => {
        watchers.get(itemId)?.close()
        const w = chokidar.watch(root, {
          ignoreInitial: true, depth: 12,
          ignored: (p: string) => /(^|[\\/])(\.obsidian|\.git|\.trash|node_modules)([\\/]|$)/.test(p)
        })
        const emit = (event: string) => (p: string) => ctx.sender.send(IPC.NotesChanged, itemId, event, p)
        w.on('change', emit('change')).on('add', emit('add')).on('unlink', emit('unlink'))
         .on('addDir', emit('addDir')).on('unlinkDir', emit('unlinkDir'))
        watchers.set(itemId, w)
      })
      ctx.ipc.on(IPC.NotesUnwatch, (_e, itemId: string) => {
        watchers.get(itemId)?.close()
        watchers.delete(itemId)
      })
    }
  }
}
```

- [ ] **Step 2 : Enregistrer le module dans `index.ts`**

Ajouter l'import (avec les autres `createXModule`) :

```ts
import { createNotesModule } from './modules/notesModule'
```

Ajouter `createNotesModule()` au tableau `modules` (après `createCmdModule(...)`):

```ts
  createCmdModule({ shellPath: resolvePowerShellPath(), shellArgs: process.platform === 'win32' ? ['-NoLogo'] : [] }),
  createNotesModule()
```

- [ ] **Step 3 : Vérifier le build main**

Run: `npx vitest run` puis `npm run build`
Expected: tests verts ; build OK (le renderer compilera après les tâches suivantes — si `npm run build` échoue uniquement sur le preload `HubApi`, c'est attendu jusqu'à la Task 6).

- [ ] **Step 4 : Commit**

```bash
git add src/main/modules/notesModule.ts src/main/index.ts
git commit -m "feat(notes): module main (arbo, lecture, assets, watch, openExternal)"
```

---

## Task 6 : Exposer l'API dans le preload

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1 : Ajouter les implémentations** dans l'objet `hub` (après `adoGetDetail`)

Ajouter une virgule après `adoGetDetail(...)` puis :

```ts
  notesPickFolder: () => ipcRenderer.invoke(IPC.NotesPickFolder),
  notesPickFile: () => ipcRenderer.invoke(IPC.NotesPickFile),
  notesTree: (root) => ipcRenderer.invoke(IPC.NotesTree, root),
  notesRead: (root, path) => ipcRenderer.invoke(IPC.NotesRead, root, path),
  notesAsset: (root, path) => ipcRenderer.invoke(IPC.NotesAsset, root, path),
  notesOpenExternal: (url) => ipcRenderer.send(IPC.NotesOpenExternal, url),
  notesWatch: (itemId, root) => ipcRenderer.send(IPC.NotesWatch, itemId, root),
  notesUnwatch: (itemId) => ipcRenderer.send(IPC.NotesUnwatch, itemId),
  onNotesChanged: (cb) => on(IPC.NotesChanged, (itemId, event, path) => cb(itemId as string, event as string, path as string))
```

> Note : `notesOpenExternal`/`notesWatch`/`notesUnwatch` n'attendent pas de valeur de retour → `ipcRenderer.send` (côté module : `ctx.ipc.on`, cf. Task 5). Les autres (`tree`/`read`/`asset`/`pick*`) renvoient une valeur → `ipcRenderer.invoke` (côté module : `ctx.ipc.handle`). Ne pas mélanger : `send` ne déclenche pas un handler `handle`.

- [ ] **Step 2 : Vérifier la compilation**

Run: `npx tsc --noEmit -p tsconfig.node.json`
Expected: aucune erreur (le contrat `HubApi` est désormais satisfait par le preload).

- [ ] **Step 3 : Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(notes): expose l'API notes via le preload"
```

---

## Task 7 : Préprocessing Obsidian (`obsidian.ts`)

**Files:**
- Create: `src/renderer/src/markdown/obsidian.ts`
- Test: `tests/obsidian.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/obsidian.test.ts
import { describe, it, expect } from 'vitest'
import { stripFrontmatter, preprocessObsidian } from '../src/renderer/src/markdown/obsidian'

describe('stripFrontmatter', () => {
  it('retire un bloc frontmatter en tête', () => {
    expect(stripFrontmatter('---\ntitle: x\n---\n# H')).toBe('# H')
  })
  it('laisse le texte sans frontmatter intact', () => {
    expect(stripFrontmatter('# H\n---\nok')).toBe('# H\n---\nok')
  })
})

describe('preprocessObsidian', () => {
  it('convertit un wikilink simple', () => {
    expect(preprocessObsidian('voir [[Page]]')).toContain('[Page](wikilink:Page)')
  })
  it('convertit un wikilink avec alias', () => {
    expect(preprocessObsidian('voir [[Page|le libellé]]')).toContain('[le libellé](wikilink:Page)')
  })
  it('convertit un embed image en image markdown', () => {
    expect(preprocessObsidian('![[schema.png]]')).toContain('![](schema.png)')
  })
  it('convertit un embed de note en div data-embed', () => {
    expect(preprocessObsidian('![[Ma Note]]')).toContain('data-embed="Ma Note"')
  })
  it('ne transforme pas un embed en wikilink', () => {
    const out = preprocessObsidian('![[schema.png]]')
    expect(out).not.toContain('wikilink:')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/obsidian.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// src/renderer/src/markdown/obsidian.ts
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i

/** Retire un bloc frontmatter YAML (--- ... ---) en tête de document. */
export function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? md.slice(m[0].length) : md
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Convertit la syntaxe Obsidian en Markdown standard :
 * - embeds `![[fichier.png]]` -> image ; `![[Note]]` -> div data-embed (transclusion gérée par le viewer)
 * - wikilinks `[[cible|alias]]` -> lien markdown avec schéma `wikilink:`
 * L'ordre (embeds avant wikilinks) évite que `![[...]]` soit pris pour un wikilink.
 */
export function preprocessObsidian(md: string): string {
  let out = stripFrontmatter(md)
  out = out.replace(/!\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const [targetRaw, alias] = inner.split('|')
    const target = targetRaw.trim()
    if (IMG_EXT.test(target.split('#')[0])) return `![${alias?.trim() ?? ''}](${target})`
    const note = target.split('#')[0].trim()
    return `\n\n<div class="md-embed" data-embed="${escapeAttr(note)}"></div>\n\n`
  })
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const [targetRaw, alias] = inner.split('|')
    const target = targetRaw.trim()
    const display = (alias ?? target.split('#')[0]).trim()
    return `[${display}](wikilink:${encodeURI(target)})`
  })
  return out
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/obsidian.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/markdown/obsidian.ts tests/obsidian.test.ts
git commit -m "feat(notes): preprocessing Obsidian (frontmatter, wikilinks, embeds)"
```

---

## Task 8 : Sanitiseur Markdown (`sanitizeMarkdown.ts`)

**Files:**
- Create: `src/renderer/src/sanitizeMarkdown.ts`
- Test: `tests/sanitizeMarkdown.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/sanitizeMarkdown.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeMarkdownHtml } from '../src/renderer/src/sanitizeMarkdown'

describe('sanitizeMarkdownHtml', () => {
  it('supprime script et handlers', () => {
    expect(sanitizeMarkdownHtml('<p onclick="x()">a</p><script>b</script>')).toBe('<p>a</p>')
  })
  it('conserve les tables et le code avec classes', () => {
    const out = sanitizeMarkdownHtml('<pre><code class="hljs language-ts">x</code></pre>')
    expect(out).toContain('class="hljs language-ts"')
    expect(sanitizeMarkdownHtml('<table><tr><td>1</td></tr></table>')).toContain('<td>1</td>')
  })
  it('conserve data-href et retire un href interne', () => {
    const out = sanitizeMarkdownHtml('<a data-href="/v/a.md" class="md-link">a</a>')
    expect(out).toContain('data-href="/v/a.md"')
  })
  it('force target/rel sur les liens externes', () => {
    const out = sanitizeMarkdownHtml('<a href="https://x.com">x</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('conserve les en-têtes H5/H6 et data-embed/data-asset', () => {
    expect(sanitizeMarkdownHtml('<h5>x</h5>')).toBe('<h5>x</h5>')
    expect(sanitizeMarkdownHtml('<img data-asset="a.png" alt="">')).toContain('data-asset="a.png"')
    expect(sanitizeMarkdownHtml('<div data-embed="N"></div>')).toContain('data-embed="N"')
  })
  it('garde les images data: et supprime les images http', () => {
    expect(sanitizeMarkdownHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png')
    expect(sanitizeMarkdownHtml('<img src="http://x/y.png">')).not.toContain('http://x')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/sanitizeMarkdown.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// src/renderer/src/sanitizeMarkdown.ts
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'UL', 'OL', 'LI', 'A',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'CODE', 'BLOCKQUOTE',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'DIV', 'SPAN', 'HR', 'INPUT'
])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'NOSCRIPT'])
const KEEP_DATA = new Set(['data-href', 'data-asset', 'data-embed'])

/** Sanitise le HTML issu de notre rendu Markdown (allowlist élargie vs ADO : classes, data-*, H5/H6, checkboxes). */
export function sanitizeMarkdownHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  cleanChildren(doc.body)
  return doc.body.innerHTML
}

function cleanChildren(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (DROP.has(child.tagName)) { child.remove(); continue }
    cleanChildren(child)
    if (!ALLOWED.has(child.tagName)) {
      const parent = child.parentNode as Node
      while (child.firstChild) parent.insertBefore(child.firstChild, child)
      parent.removeChild(child)
      continue
    }
    cleanAttributes(child)
  }
}

function cleanAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const val = attr.value.trim()
    if (name.startsWith('on')) { el.removeAttribute(attr.name); continue }
    if (name === 'class' || KEEP_DATA.has(name)) continue
    if (el.tagName === 'A' && name === 'href') {
      if (/^(https?:|mailto:)/i.test(val)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
      else el.removeAttribute(attr.name)
      continue
    }
    if (el.tagName === 'IMG' && (name === 'src' || name === 'alt')) {
      if (name === 'src' && !/^data:/i.test(val)) el.removeAttribute(attr.name)
      continue
    }
    if (el.tagName === 'INPUT') {
      if (name === 'type' && val.toLowerCase() === 'checkbox') continue
      if (name === 'checked' || name === 'disabled') continue
      el.removeAttribute(attr.name); continue
    }
    if (/^H[1-6]$/.test(el.tagName) && name === 'id') continue
    if (name === 'colspan' || name === 'rowspan') continue
    el.removeAttribute(attr.name)
  }
  // Toute checkbox rendue est en lecture seule.
  if (el.tagName === 'INPUT') el.setAttribute('disabled', '')
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/sanitizeMarkdown.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/sanitizeMarkdown.ts tests/sanitizeMarkdown.test.ts
git commit -m "feat(notes): sanitiseur Markdown (allowlist elargie)"
```

---

## Task 9 : Dépendances markdown-it + highlight.js

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1 : Installer**

Run: `npm install markdown-it@^14 highlight.js@^11 && npm install -D @types/markdown-it@^14`
Expected: ajout aux dependencies/devDependencies, pas d'erreur.

- [ ] **Step 2 : Vérifier que les tests existants passent toujours**

Run: `npx vitest run`
Expected: PASS (aucun test cassé par l'ajout des deps).

- [ ] **Step 3 : Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(notes): ajout markdown-it + highlight.js"
```

---

## Task 10 : Rendu Markdown (`render.ts`)

**Files:**
- Create: `src/renderer/src/markdown/render.ts`
- Test: `tests/markdownRender.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/markdownRender.test.ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown, type RenderContext } from '../src/renderer/src/markdown/render'

const ctx: RenderContext = {
  resolveHref(href) {
    if (/^https?:/.test(href)) return { type: 'external', url: href }
    if (href.startsWith('wikilink:')) {
      const t = decodeURI(href.slice('wikilink:'.length))
      return t === 'Connue' ? { type: 'internal', path: '/v/Connue.md' } : { type: 'missing' }
    }
    return { type: 'internal', path: '/v/' + href }
  }
}

describe('renderMarkdown', () => {
  it('rend les tables GFM', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', ctx)
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })
  it('transforme un wikilink connu en data-href', () => {
    const html = renderMarkdown('[x](wikilink:Connue)', ctx)
    expect(html).toContain('data-href="/v/Connue.md"')
    expect(html).not.toContain('href="wikilink:')
  })
  it('marque un wikilink manquant', () => {
    const html = renderMarkdown('[x](wikilink:Absente)', ctx)
    expect(html).toContain('wikilink-missing')
  })
  it('garde un lien externe avec son href', () => {
    const html = renderMarkdown('[g](https://g.com)', ctx)
    expect(html).toContain('href="https://g.com"')
  })
  it('rend une image relative en data-asset (src différé)', () => {
    const html = renderMarkdown('![alt](img/x.png)', ctx)
    expect(html).toContain('data-asset="img/x.png"')
    expect(html).not.toContain('src="img/x.png"')
  })
  it('applique le preprocessing Obsidian (frontmatter retiré)', () => {
    const html = renderMarkdown('---\nt: 1\n---\n# Titre', ctx)
    expect(html).toContain('<h1')
    expect(html).not.toContain('t: 1')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/markdownRender.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// src/renderer/src/markdown/render.ts
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { preprocessObsidian } from './obsidian'

export type HrefResolution =
  | { type: 'external'; url: string }
  | { type: 'internal'; path: string }
  | { type: 'missing' }

export interface RenderContext {
  resolveHref(href: string): HrefResolution
}

const md = new MarkdownIt({
  html: false,          // pas de HTML brut sauf nos div d'embed (réintroduites ci-dessous via html:true ? non)
  linkify: true,
  breaks: false,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try { return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang }).value}</code></pre>` } catch { /* ignore */ }
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`
  }
})

// On autorise UNIQUEMENT nos blocs d'embed (div data-embed) injectés par le preprocessing.
md.set({ html: true })

// Lien : résolution interne/externe/manquant via le contexte (passé dans env).
const defaultRender = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') ?? ''
  const ctx = (env as { ctx?: RenderContext }).ctx
  const r = ctx ? ctx.resolveHref(href) : { type: 'external' as const, url: href }
  const hrefIdx = token.attrIndex('href')
  if (r.type === 'external') {
    token.attrSet('href', r.url)
  } else if (r.type === 'internal') {
    if (hrefIdx >= 0) token.attrs!.splice(hrefIdx, 1)
    token.attrSet('data-href', r.path)
    token.attrJoin('class', 'md-link')
  } else {
    if (hrefIdx >= 0) token.attrs!.splice(hrefIdx, 1)
    token.attrJoin('class', 'md-link wikilink-missing')
  }
  return defaultRender(tokens, idx, options, env, self)
}

// Image : externe/data conservée ; sinon src différé via data-asset (chargé par le composant).
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]
  const src = token.attrGet('src') ?? ''
  const alt = md.utils.escapeHtml(token.content ?? '')
  if (/^(https?:|data:)/i.test(src)) return `<img src="${md.utils.escapeHtml(src)}" alt="${alt}">`
  return `<img data-asset="${md.utils.escapeHtml(src)}" alt="${alt}">`
}

/** Markdown (avec syntaxe Obsidian) -> HTML non sanitisé (le composant sanitise avant injection). */
export function renderMarkdown(markdown: string, ctx: RenderContext): string {
  return md.render(preprocessObsidian(markdown), { ctx })
}
```

> Note d'implémentation : `html: true` est nécessaire pour laisser passer nos `<div data-embed>` (injectés par le preprocessing, donc fiables) ; tout HTML brut éventuellement présent dans le `.md` sera de toute façon filtré par `sanitizeMarkdownHtml`. Si un test de sécurité ultérieur le justifie, on pourra remplacer l'embed par un token custom plutôt que du HTML brut.

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/markdownRender.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/markdown/render.ts tests/markdownRender.test.ts
git commit -m "feat(notes): rendu markdown-it (liens, images differees, highlight)"
```

---

## Task 11 : Transforms DOM (callouts + task lists)

**Files:**
- Create: `src/renderer/src/markdown/domTransforms.ts`
- Test: `tests/domTransforms.test.ts`

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/domTransforms.test.ts
import { describe, it, expect } from 'vitest'
import { transformCallouts, transformTaskLists } from '../src/renderer/src/markdown/domTransforms'

function el(html: string): HTMLElement {
  const d = new DOMParser().parseFromString(html, 'text/html')
  return d.body
}

describe('transformCallouts', () => {
  it('convertit un blockquote [!note] en div.callout', () => {
    const root = el('<blockquote><p>[!note] Titre\ncorps</p></blockquote>')
    transformCallouts(root)
    const c = root.querySelector('.callout')
    expect(c).not.toBeNull()
    expect(c!.classList.contains('callout-note')).toBe(true)
    expect(root.querySelector('.callout-title')!.textContent).toBe('Titre')
  })
  it('laisse un blockquote normal intact', () => {
    const root = el('<blockquote><p>citation</p></blockquote>')
    transformCallouts(root)
    expect(root.querySelector('.callout')).toBeNull()
    expect(root.querySelector('blockquote')).not.toBeNull()
  })
})

describe('transformTaskLists', () => {
  it('convertit [ ] et [x] en checkboxes désactivées', () => {
    const root = el('<ul><li>[ ] à faire</li><li>[x] fait</li></ul>')
    transformTaskLists(root)
    const boxes = root.querySelectorAll('input[type="checkbox"]')
    expect(boxes.length).toBe(2)
    expect((boxes[1] as HTMLInputElement).hasAttribute('checked')).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/domTransforms.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// src/renderer/src/markdown/domTransforms.ts
const CALLOUT_RE = /^\s*\[!(\w+)\]\s*(.*)$/

/** Transforme les blockquotes Obsidian `> [!type] titre` en <div class="callout callout-type">. */
export function transformCallouts(root: ParentNode): void {
  for (const bq of Array.from(root.querySelectorAll('blockquote'))) {
    const first = bq.firstElementChild
    const text = first?.textContent ?? ''
    const nlIdx = text.indexOf('\n')
    const firstLine = nlIdx >= 0 ? text.slice(0, nlIdx) : text
    const m = firstLine.match(CALLOUT_RE)
    if (!m) continue
    const [, typeRaw, title] = m
    const div = bq.ownerDocument!.createElement('div')
    div.className = `callout callout-${typeRaw.toLowerCase()}`
    const head = bq.ownerDocument!.createElement('div')
    head.className = 'callout-title'
    head.textContent = title.trim() || typeRaw
    const body = bq.ownerDocument!.createElement('div')
    body.className = 'callout-body'
    // Retire la 1re ligne (marqueur) du contenu, conserve le reste.
    if (first) {
      const rest = nlIdx >= 0 ? text.slice(nlIdx + 1) : ''
      first.textContent = rest
      if (!rest) first.remove()
    }
    while (bq.firstChild) body.appendChild(bq.firstChild)
    div.appendChild(head)
    div.appendChild(body)
    bq.replaceWith(div)
  }
}

/** Convertit les items de liste `[ ]` / `[x]` en checkboxes désactivées. */
export function transformTaskLists(root: ParentNode): void {
  for (const li of Array.from(root.querySelectorAll('li'))) {
    const m = li.textContent?.match(/^\s*\[( |x|X)\]\s?(.*)$/s)
    if (!m) continue
    const checked = m[1].toLowerCase() === 'x'
    li.classList.add('task-item')
    const box = li.ownerDocument!.createElement('input')
    box.setAttribute('type', 'checkbox')
    box.setAttribute('disabled', '')
    if (checked) box.setAttribute('checked', '')
    li.textContent = ' ' + m[2]
    li.prepend(box)
  }
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/domTransforms.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/markdown/domTransforms.ts tests/domTransforms.test.ts
git commit -m "feat(notes): transforms DOM (callouts, task lists)"
```

---

## Task 12 : Utilitaires de chemin renderer + réglage vault

**Files:**
- Modify: `src/renderer/src/util.ts`
- Modify: `src/renderer/src/settings.ts`
- Test: `tests/util.test.ts` (créer si absent) ; `tests/settings.test.ts` (optionnel)

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/util.test.ts  (ajouter ; créer le fichier s'il n'existe pas)
import { describe, it, expect } from 'vitest'
import { dirOf, joinPath } from '../src/renderer/src/util'

describe('dirOf', () => {
  it('renvoie le dossier (Windows et POSIX)', () => {
    expect(dirOf('C:\\v\\sub\\a.md')).toBe('C:\\v\\sub')
    expect(dirOf('/v/sub/a.md')).toBe('/v/sub')
  })
})

describe('joinPath', () => {
  it('joint en conservant le séparateur du dossier', () => {
    expect(joinPath('C:\\v\\sub', 'img/x.png')).toBe('C:\\v\\sub\\img\\x.png')
    expect(joinPath('/v/sub', '../a.md')).toBe('/v/a.md')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/util.test.ts`
Expected: FAIL — `dirOf`/`joinPath` introuvables.

- [ ] **Step 3 : Implémenter dans `util.ts`** (ajouter en fin de fichier)

```ts
/** Dossier parent d'un chemin (Windows ou POSIX), sans le séparateur final. */
export function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i <= 0 ? p : p.slice(0, i)
}

/** Joint un chemin relatif à un dossier, en résolvant `.`/`..`, avec le séparateur du dossier. */
export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  const parts = dir.split(/[\\/]/)
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join(sep)
}
```

- [ ] **Step 4 : Ajouter le réglage vault dans `settings.ts`** (en fin de fichier)

```ts
const DEFAULT_VAULT_KEY = 'difai.defaultVault'

/** Chemin du vault Obsidian par défaut (null = non défini). */
export function readDefaultVault(): string | null {
  try { return localStorage.getItem(DEFAULT_VAULT_KEY) } catch { return null }
}
export function writeDefaultVault(v: string | null): void {
  try {
    if (v) localStorage.setItem(DEFAULT_VAULT_KEY, v)
    else localStorage.removeItem(DEFAULT_VAULT_KEY)
  } catch { /* ignore */ }
}
```

- [ ] **Step 5 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/util.test.ts`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/renderer/src/util.ts src/renderer/src/settings.ts tests/util.test.ts
git commit -m "feat(notes): utils de chemin renderer + reglage vault par defaut"
```

---

## Task 13 : Store — kind `note`, refs, persistance

**Files:**
- Modify: `src/renderer/src/store.ts`
- Test: `tests/store.test.ts` (ajouts)

- [ ] **Step 1 : Écrire le test (échec)**

```ts
// tests/store.test.ts  (ajouter ce describe)
import { describe, it, expect, beforeEach } from 'vitest'
import { useHub } from '../src/renderer/src/store'

describe('items note', () => {
  beforeEach(() => useHub.getState().reset())

  it('ajoute un item note, persiste root/rootKind/activePath et recharge', () => {
    const gid = useHub.getState().addGroup('Docs')
    useHub.getState().addItem(gid, {
      id: 'n1', name: 'Vault', cwd: '', pinned: true, tabId: null, state: 'done', agents: [],
      openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'note', note: { root: '/v', rootKind: 'vault', activePath: '/v/a.md' }
    })
    const tree = useHub.getState().toPersistable()
    const persisted = tree.groups[0].items[0]
    expect(persisted.kind).toBe('note')
    expect(persisted.note).toEqual({ root: '/v', rootKind: 'vault', activePath: '/v/a.md' })

    useHub.getState().reset()
    useHub.getState().loadWorkspace(tree)
    const back = useHub.getState().itemById('n1')!
    expect(back.note).toEqual({ root: '/v', rootKind: 'vault', activePath: '/v/a.md' })
  })

  it('setNoteActivePath met à jour le fichier ouvert', () => {
    const gid = useHub.getState().addGroup('Docs')
    useHub.getState().addItem(gid, {
      id: 'n2', name: 'Vault', cwd: '', pinned: true, tabId: null, state: 'done', agents: [],
      openAgentId: null, split: 1, findOpen: false, agentsOpen: false, searchQuery: '',
      kind: 'note', note: { root: '/v', rootKind: 'vault', activePath: null }
    })
    useHub.getState().setNoteActivePath('n2', '/v/b.md')
    expect(useHub.getState().itemById('n2')!.note!.activePath).toBe('/v/b.md')
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL.

- [ ] **Step 3 : Implémenter les modifications du store**

(a) Importer le type :

```ts
import type { ConsoleLine, SessionState, WorkspaceTree, AdoBoard, PersistNote } from '../../shared/ipc'
```

(b) Étendre `TabKind` :

```ts
export type TabKind = 'session' | 'find' | 'agents' | 'ado' | 'note'
```

(c) Ajouter le champ `note` à l'interface `Item` (après `adoClosed?`) :

```ts
  /** État d'un item note (lecteur Markdown/Obsidian). */
  note?: PersistNote
```

et mettre à jour le type `kind` de `Item` :

```ts
  kind: 'claude' | 'ado' | 'cmd' | 'note'
```

(d) Déclarer l'action dans l'interface `HubState` (près des actions ado) :

```ts
  setNoteActivePath: (itemId: string, path: string) => void
```

(e) `KIND_PREFIX` et `parseRef` — gérer `note` :

```ts
const KIND_PREFIX: Record<TabKind, string> = { session: 's', find: 'f', agents: 'a', ado: 'd', note: 'n' }
```

Dans `parseRef`, remplacer la ligne `const kind: TabKind = ...` par :

```ts
  const kind: TabKind = p === 's' ? 'session' : p === 'f' ? 'find' : p === 'a' ? 'agents' : p === 'd' ? 'ado' : p === 'n' ? 'note' : 'session'
```

(f) Ajouter un helper `mainRef` (après `parseRef`) et l'utiliser partout où l'on calculait `tabRef('ado'|...)` pour l'onglet principal :

```ts
/** Ref de l'onglet principal d'un item selon son kind (session par défaut). */
export function mainRef(item: { id: string; kind: Item['kind'] }): string {
  if (item.kind === 'ado') return tabRef('ado', item.id)
  if (item.kind === 'note') return tabRef('note', item.id)
  return tabRef('session', item.id)
}
```

(g) `paneRefs` — pousser les items note comme onglet principal. Remplacer le bloc `for (const i of group.items)` par :

```ts
  for (const i of group.items) {
    if (i.split === sessionSplit) {
      if (i.kind === 'ado') { if (!i.adoClosed) refs.push(tabRef('ado', i.id)) }
      else if (i.kind === 'note') refs.push(tabRef('note', i.id))
      else if (i.tabId) refs.push(tabRef('session', i.id))
    }
    if (i.split === auxOwnerSplit && i.findOpen) refs.push(tabRef('find', i.id))
    if (i.split === auxOwnerSplit && i.agentsOpen) refs.push(tabRef('agents', i.id))
  }
```

(h) Dans `addItem`, remplacer `const ref = item.kind === 'ado' ? tabRef('ado', item.id) : tabRef('session', item.id)` par :

```ts
      const ref = mainRef(item)
```

(i) Dans `setActiveItem`, remplacer `const ref = item.kind === 'ado' ? tabRef('ado', itemId) : tabRef('session', itemId)` par :

```ts
      const ref = mainRef(item)
```

(j) Dans `setSplit`, remplacer `const ref = item?.kind === 'ado' ? tabRef('ado', itemId) : tabRef('session', itemId)` par :

```ts
      const ref = item ? mainRef(item) : tabRef('session', itemId)
```

(k) Ajouter l'action `setNoteActivePath` (près de `setAdoIteration`) :

```ts
  setNoteActivePath: (itemId, path) =>
    set((s) => ({ groups: mapItems(s.groups, (i) => i.id === itemId, (i) => ({ ...i, note: i.note ? { ...i.note, activePath: path } : i.note })) })),
```

(l) `toPersistable` — sérialiser `note`. Dans le `.map` des items, ajouter après la ligne ado :

```ts
          ...(i.kind === 'ado' && i.ado ? { ado: i.ado } : {}),
          ...(i.kind === 'note' && i.note ? { note: i.note } : {}),
```

(m) `loadWorkspace` — restaurer `note`. Dans le `.map` des items, ajouter après la ligne ado :

```ts
            kind: i.kind ?? 'claude', ...(i.kind === 'ado' ? { ado: i.ado ?? { view: 'tree', iterationPath: null } } : {}),
            ...(i.kind === 'note' ? { note: i.note ?? { root: '', rootKind: 'file', activePath: null } } : {}),
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS (anciens + nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/store.ts tests/store.test.ts
git commit -m "feat(notes): store — kind note, refs, persistance"
```

---

## Task 14 : Boot — ne pas relancer de pty pour les items note

**Files:**
- Modify: `src/renderer/src/App.tsx:106`

- [ ] **Step 1 : Modifier la boucle de relancement**

Remplacer la ligne :

```ts
          if (i.kind === 'ado') continue // board ADO : pas de pty à relancer
```

par :

```ts
          if (i.kind === 'ado' || i.kind === 'note') continue // board ADO / note : pas de pty à relancer
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: build OK (les composants NotesView/Pane arrivent ensuite ; ici App compile car la condition est purement sur `kind`).

- [ ] **Step 3 : Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(notes): boot ne relance pas de pty pour les items note"
```

---

## Task 15 : Icône Notes

**Files:**
- Modify: `src/renderer/src/components/icons.tsx`

- [ ] **Step 1 : Ajouter `NotesIcon`** (en fin de fichier)

```tsx
/** Document/Markdown — Font Awesome « file-lines » solid. */
export function NotesIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 384 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM112 256H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64H272c8.8 0 16 7.2 16 16s-7.2 16-16 16H112c-8.8 0-16-7.2-16-16s7.2-16 16-16z" />
    </svg>
  )
}
```

- [ ] **Step 2 : Commit**

```bash
git add src/renderer/src/components/icons.tsx
git commit -m "feat(notes): icone Notes"
```

---

## Task 16 : Composant `MarkdownView`

**Files:**
- Create: `src/renderer/src/components/MarkdownView.tsx`

- [ ] **Step 1 : Implémenter** (composant ; vérifié au build + manuellement)

```tsx
// src/renderer/src/components/MarkdownView.tsx
import React, { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown, type RenderContext, type HrefResolution } from '../markdown/render'
import { sanitizeMarkdownHtml } from '../sanitizeMarkdown'
import { transformCallouts, transformTaskLists } from '../markdown/domTransforms'
import { dirOf, joinPath } from '../util'

interface Props {
  root: string
  filePath: string
  markdown: string
  index: Record<string, string>
  onOpenInternal: (path: string) => void
}

export function MarkdownView({ root, filePath, markdown, index, onOpenInternal }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  const ctx = useMemo<RenderContext>(() => ({
    resolveHref(href: string): HrefResolution {
      if (/^(https?:|mailto:)/i.test(href)) return { type: 'external', url: href }
      if (href.startsWith('wikilink:')) {
        const target = decodeURI(href.slice('wikilink:'.length))
        const key = (target.split('#')[0].split(/[\\/]/).pop() ?? '').replace(/\.(md|markdown)$/i, '').trim().toLowerCase()
        const p = index[key]
        return p ? { type: 'internal', path: p } : { type: 'missing' }
      }
      // lien relatif vers un .md
      return { type: 'internal', path: joinPath(dirOf(filePath), href.split('#')[0]) }
    }
  }), [index, filePath])

  const html = useMemo(() => sanitizeMarkdownHtml(renderMarkdown(markdown, ctx)), [markdown, ctx])

  // Post-rendu : callouts, task lists, images différées, transclusions.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = 0
    transformCallouts(el)
    transformTaskLists(el)

    let cancelled = false
    // Images relatives -> data URI (essaie dossier du fichier puis racine du vault).
    for (const img of Array.from(el.querySelectorAll('img[data-asset]')) as HTMLImageElement[]) {
      const rel = img.getAttribute('data-asset') ?? ''
      const candidates = [joinPath(dirOf(filePath), rel), joinPath(root, rel)]
      void (async () => {
        for (const c of candidates) {
          const r = await window.hub.notesAsset(root, c)
          if (cancelled) return
          if (r.ok) { img.src = r.data.dataUri; img.removeAttribute('data-asset'); return }
        }
        if (!cancelled) img.alt = (img.alt || '') + ' (image introuvable)'
      })()
    }

    // Transclusions de notes (profondeur 1, sans embeds imbriqués).
    for (const div of Array.from(el.querySelectorAll('div.md-embed[data-embed]')) as HTMLDivElement[]) {
      const name = div.getAttribute('data-embed') ?? ''
      const key = name.replace(/\.(md|markdown)$/i, '').trim().toLowerCase()
      const path = index[key]
      if (!path) { div.textContent = `⧉ ${name} (note introuvable)`; div.classList.add('wikilink-missing'); continue }
      void (async () => {
        const r = await window.hub.notesRead(root, path)
        if (cancelled || !r.ok) return
        // Rendu sans transclusion imbriquée : on retire les div.md-embed du HTML produit.
        const inner = sanitizeMarkdownHtml(renderMarkdown(r.data.markdown, ctx))
        const tmp = document.createElement('div')
        tmp.innerHTML = inner
        tmp.querySelectorAll('div.md-embed').forEach((n) => n.remove())
        transformCallouts(tmp); transformTaskLists(tmp)
        div.innerHTML = `<div class="embed-title">⧉ ${escapeText(name)}</div>` + tmp.innerHTML
      })()
    }

    return () => { cancelled = true }
  }, [html, root, filePath, index, ctx])

  // Délégation des clics : liens internes / externes / ancres.
  function onClick(e: React.MouseEvent): void {
    const target = e.target as HTMLElement
    const internal = target.closest('[data-href]') as HTMLElement | null
    if (internal) { e.preventDefault(); onOpenInternal(internal.getAttribute('data-href') as string); return }
    const a = target.closest('a[href]') as HTMLAnchorElement | null
    if (a) {
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('#')) {
        e.preventDefault()
        ref.current?.querySelector(`#${CSS.escape(href.slice(1))}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (/^(https?:|mailto:)/i.test(href)) {
        e.preventDefault(); window.hub.notesOpenExternal(href)
      }
    }
  }

  return <div className="md-view" ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: TypeScript OK (le composant n'est pas encore monté ; on vérifie juste qu'il compile).

- [ ] **Step 3 : Commit**

```bash
git add src/renderer/src/components/MarkdownView.tsx
git commit -m "feat(notes): composant MarkdownView (rendu, images, transclusion, liens)"
```

---

## Task 17 : Composant `NoteTree`

**Files:**
- Create: `src/renderer/src/components/NoteTree.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
// src/renderer/src/components/NoteTree.tsx
import React, { useState } from 'react'
import type { NoteTreeNode } from '../../../shared/ipc'
import { Chevron } from './Chevron'
import { NotesIcon, FolderIcon } from './icons'

interface Props { node: NoteTreeNode; activePath: string | null; onOpen: (path: string) => void; depth?: number }

export function NoteTree({ node, activePath, onOpen, depth = 0 }: Props): React.JSX.Element {
  if (node.dir) {
    return (
      <div className="nt-dir">
        {(node.children ?? []).map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} depth={depth} />)}
      </div>
    )
  }
  return <NoteTreeEntry node={node} activePath={activePath} onOpen={onOpen} depth={depth} />
}

function NoteTreeEntry({ node, activePath, onOpen, depth }: Required<Props>): React.JSX.Element {
  const [open, setOpen] = useState(depth < 1)
  const pad = { paddingLeft: 6 + depth * 12 }
  if (node.dir) {
    return (
      <div className="nt-folder">
        <div className="nt-row" style={pad} onClick={() => setOpen((o) => !o)}>
          <Chevron open={open} />
          <span className="nt-ic"><FolderIcon /></span>
          <span className="nt-name">{node.name}</span>
        </div>
        {open && (node.children ?? []).map((c) => <NoteTreeEntry key={c.path} node={c} activePath={activePath} onOpen={onOpen} depth={depth + 1} />)}
      </div>
    )
  }
  return (
    <div className={`nt-row file${node.path === activePath ? ' active' : ''}`} style={pad} onClick={() => onOpen(node.path)} title={node.name}>
      <span className="nt-ic"><NotesIcon /></span>
      <span className="nt-name">{node.name.replace(/\.(md|markdown)$/i, '')}</span>
    </div>
  )
}
```

> Dépend de `Chevron` (existant, utilisé par AdoBoard). Vérifier son export par défaut/nommé : `import { Chevron } from './Chevron'`.

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3 : Commit**

```bash
git add src/renderer/src/components/NoteTree.tsx
git commit -m "feat(notes): composant NoteTree (arborescence repliable)"
```

---

## Task 18 : Composant `NotesView` (orchestration)

**Files:**
- Create: `src/renderer/src/components/NotesView.tsx`

- [ ] **Step 1 : Implémenter**

```tsx
// src/renderer/src/components/NotesView.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useHub, type Item } from '../store'
import type { NotesTree } from '../../../shared/ipc'
import { MarkdownView } from './MarkdownView'
import { NoteTree } from './NoteTree'
import { basename } from '../util'

interface Props { item: Item }

/** Trouve le premier fichier .md de l'arbre (parcours en profondeur). */
function firstFile(tree: NotesTree): string | null {
  const stack = [tree.tree]
  while (stack.length) {
    const n = stack.shift()!
    if (!n.dir) return n.path
    for (const c of n.children ?? []) stack.push(c)
  }
  return null
}

export function NotesView({ item }: Props): React.JSX.Element {
  const note = item.note ?? { root: '', rootKind: 'file' as const, activePath: null }
  const isVault = note.rootKind === 'vault'
  const [tree, setTree] = useState<NotesTree | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const histRef = useRef<{ stack: string[]; pos: number }>({ stack: [], pos: -1 })
  const [, force] = useState(0)
  const activePath = note.activePath

  const readFile = useCallback(async (path: string) => {
    const r = await window.hub.notesRead(note.root, path)
    if (r.ok) { setMarkdown(r.data.markdown); setErr(null) }
    else { setErr(r.error); setMarkdown('') }
  }, [note.root])

  const open = useCallback((path: string, pushHist = true) => {
    useHub.getState().setNoteActivePath(item.id, path)
    if (pushHist) {
      const h = histRef.current
      h.stack = h.stack.slice(0, h.pos + 1)
      if (h.stack[h.pos] !== path) { h.stack.push(path); h.pos = h.stack.length - 1 }
    }
    void readFile(path)
  }, [item.id, readFile])

  // Chargement initial + (re)chargement quand la racine change.
  useEffect(() => {
    let active = true
    if (isVault) {
      void window.hub.notesTree(note.root).then((r) => {
        if (!active) return
        if (!r.ok) { setErr(r.error); return }
        setTree(r.data)
        const start = activePath ?? firstFile(r.data)
        if (start) open(start, true)
      })
    } else {
      open(note.root, true)
    }
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.root, note.rootKind])

  // Live-reload.
  useEffect(() => {
    window.hub.notesWatch(item.id, note.root)
    const unsub = window.hub.onNotesChanged((id, event, path) => {
      if (id !== item.id) return
      if (event === 'change') { if (path === useHub.getState().itemById(item.id)?.note?.activePath) void readFile(path) }
      else if (isVault) void window.hub.notesTree(note.root).then((r) => { if (r.ok) setTree(r.data) })
    })
    return () => { unsub(); window.hub.notesUnwatch(item.id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, note.root, note.rootKind])

  const h = histRef.current
  const goBack = (): void => { if (h.pos > 0) { h.pos--; force((n) => n + 1); open(h.stack[h.pos], false) } }
  const goFwd = (): void => { if (h.pos < h.stack.length - 1) { h.pos++; force((n) => n + 1); open(h.stack[h.pos], false) } }

  const index = tree?.index ?? {}

  return (
    <div className="notes-view">
      <div className="notes-bar">
        {isVault && <button className="btn" title={collapsed ? 'Afficher l\'arborescence' : 'Masquer l\'arborescence'} onClick={() => setCollapsed((c) => !c)}>☰</button>}
        <button className="btn" title="Précédent" disabled={h.pos <= 0} onClick={goBack}>←</button>
        <button className="btn" title="Suivant" disabled={h.pos >= h.stack.length - 1} onClick={goFwd}>→</button>
        <span className="notes-crumb" title={activePath ?? ''}>{activePath ? basename(activePath).replace(/\.(md|markdown)$/i, '') : '—'}</span>
      </div>
      <div className="notes-body">
        {isVault && !collapsed && (
          <div className="notes-tree">
            {tree ? <NoteTree node={tree.tree} activePath={activePath} onOpen={(p) => open(p)} /> : <div className="notes-center">Chargement…</div>}
          </div>
        )}
        <div className="notes-content">
          {err
            ? <div className="notes-center notes-err">{err}</div>
            : activePath
              ? <MarkdownView root={note.root} filePath={activePath} markdown={markdown} index={index} onOpenInternal={(p) => open(p)} />
              : <div className="notes-center">Aucun fichier.</div>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3 : Commit**

```bash
git add src/renderer/src/components/NotesView.tsx
git commit -m "feat(notes): composant NotesView (arbo + viewer + historique + live-reload)"
```

---

## Task 19 : Intégration dans `Pane` (onglet, corps, menu +)

**Files:**
- Modify: `src/renderer/src/components/Pane.tsx`

- [ ] **Step 1 : Imports**

Ajouter `NotesIcon` à l'import d'icônes existant et importer `NotesView` + le réglage vault :

```tsx
import { TerminalIcon, EditIcon, PinIcon, TrashIcon, AzureIcon, ClaudeIcon, NotesIcon } from './icons'
import { NotesView } from './NotesView'
import { readDefaultVault } from '../settings'
```

- [ ] **Step 2 : `tabLabel`** — gérer `note` (l'item porte son nom). Remplacer la fonction par :

```tsx
function tabLabel(t: PaneTab): string {
  if (t.kind === 'session' || t.kind === 'ado' || t.kind === 'note') return t.item.name
  return `${t.item.name} - ${t.kind === 'find' ? 'Find' : 'Agents'}`
}
```

- [ ] **Step 3 : Fonctions d'ajout** (après `addCmd`, avant `closeSession`)

```tsx
  function addNoteItem(root: string, rootKind: 'vault' | 'file'): void {
    useHub.getState().addItem(group.id, {
      id: crypto.randomUUID(), name: basename(root), cwd: '', pinned: false, tabId: null, state: 'done',
      agents: [], openAgentId: null, split: side === 'right' ? 2 : 1, findOpen: false, agentsOpen: false,
      searchQuery: '', kind: 'note', note: { root, rootKind, activePath: rootKind === 'file' ? root : null }
    })
  }
  async function addNoteFolder(): Promise<void> { closeMenus(); const f = await window.hub.notesPickFolder(); if (f) addNoteItem(f, 'vault') }
  async function addNoteFile(): Promise<void> { closeMenus(); const f = await window.hub.notesPickFile(); if (f) addNoteItem(f, 'file') }
  function addDefaultVault(): void { closeMenus(); const v = readDefaultVault(); if (v) addNoteItem(v, 'vault') }
```

- [ ] **Step 4 : Onglet `note`** — ajouter une branche de rendu d'onglet juste après le bloc `if (t.kind === 'ado') { ... }` (modèle calqué sur ado, avec `NotesIcon` et fermeture = `removeItem`) :

```tsx
            if (t.kind === 'note') {
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
                  <span className="tab-ic"><NotesIcon /></span>
                  <span className="tab-title">{t.item.name}</span>
                  {t.item.pinned && <span className="tab-pin"><PinIcon /></span>}
                  <span className="tab-close" title="Fermer l'onglet" onClick={(e) => { e.stopPropagation(); useHub.getState().removeItem(t.item.id) }}>✕</span>
                </div>
              )
            }
```

- [ ] **Step 5 : Corps du pane** — rendre `NotesView`. Après le bloc `{active?.kind === 'ado' && (() => { ... })()}` ajouter :

```tsx
        {active?.kind === 'note' && (() => {
          const it = group.items.find((i) => i.id === active.itemId)
          return it ? <NotesView item={it} /> : null
        })()}
```

- [ ] **Step 6 : Entrées de menu** — dans le menu `+` (`add-menu`) et dans le menu de débordement (`tab-overflow-menu`), ajouter les trois entrées Markdown. Dans `add-menu`, après la ligne `<div onClick={addAdo}>…ADO – Azure</div>` :

```tsx
          {readDefaultVault() && <div onClick={addDefaultVault}><NotesIcon /> Vault par défaut</div>}
          <div onClick={addNoteFolder}><NotesIcon /> Markdown : ouvrir un dossier…</div>
          <div onClick={addNoteFile}><NotesIcon /> Markdown : ouvrir un fichier…</div>
```

Dans le `tab-overflow-menu`, après la ligne `<div className="ovf-add" onClick={() => { setOverflowOpen(false); addAdo() }}>…</div>` :

```tsx
                  {readDefaultVault() && <div className="ovf-add" onClick={() => { setOverflowOpen(false); addDefaultVault() }}><NotesIcon /> Vault par défaut</div>}
                  <div className="ovf-add" onClick={() => { setOverflowOpen(false); addNoteFolder() }}><NotesIcon /> Markdown : dossier…</div>
                  <div className="ovf-add" onClick={() => { setOverflowOpen(false); addNoteFile() }}><NotesIcon /> Markdown : fichier…</div>
```

- [ ] **Step 7 : Vérifier le build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 8 : Commit**

```bash
git add src/renderer/src/components/Pane.tsx
git commit -m "feat(notes): integration Pane (onglet note, corps, menu +)"
```

---

## Task 20 : Réglage « Vault par défaut »

**Files:**
- Modify: `src/renderer/src/components/Settings.tsx`

- [ ] **Step 1 : Imports + state local**

Ajouter à l'import settings : `readDefaultVault, writeDefaultVault`.

```tsx
import { writeConfirmOnClose, writeGlobalDefaultCwd, readDefaultVault, writeDefaultVault } from '../settings'
```

Dans le composant, ajouter un state local (les autres réglages viennent du store ; le vault vit en localStorage, on le lit en state local) :

```tsx
  const [vault, setVault] = React.useState<string | null>(readDefaultVault())
  async function pickVault(): Promise<void> { const f = await window.hub.notesPickFolder(); if (f) { setVault(f); writeDefaultVault(f) } }
  function resetVault(): void { setVault(null); writeDefaultVault(null) }
```

- [ ] **Step 2 : Ligne de réglage** — après la `setting-row` « Dossier par défaut », ajouter :

```tsx
      <div className="setting-row">
        <span className="setting-label">Vault Obsidian par défaut</span>
        <span className="setting-path" title={vault ?? ''}>{vault ?? '(non défini)'}</span>
        <button className="btn" onClick={pickVault}>Choisir…</button>
        {vault && <button className="btn" onClick={resetVault}>Réinitialiser</button>}
      </div>
```

- [ ] **Step 3 : Vérifier le build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4 : Commit**

```bash
git add src/renderer/src/components/Settings.tsx
git commit -m "feat(notes): reglage vault Obsidian par defaut"
```

---

## Task 21 : Styles (CSS)

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1 : Ajouter les styles** dans le bloc `<style>` (avant `</style>`). Inclut viewer markdown, arborescence, callouts, et un thème highlight minimal.

```css
      /* ----- Lecteur Notes / Markdown ----- */
      .notes-view { display: flex; flex-direction: column; height: 100%; min-height: 0; background: #1b1b1b; }
      .notes-bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #2a2a2a; flex: none; }
      .notes-bar .btn { background: #232323; border: 1px solid #3a3a3a; color: #ddd; border-radius: 5px; cursor: pointer; padding: 2px 8px; font-family: inherit; }
      .notes-bar .btn:disabled { opacity: .4; cursor: default; }
      .notes-crumb { color: #9ab; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .notes-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }
      .notes-tree { width: 240px; min-width: 180px; flex: none; overflow: auto; border-right: 1px solid #2a2a2a; padding: 6px 0; }
      .notes-content { flex: 1; min-width: 0; overflow: auto; }
      .notes-center { padding: 24px; color: #888; text-align: center; }
      .notes-err { color: #f88; }
      .nt-row { display: flex; align-items: center; gap: 5px; padding: 3px 8px; cursor: pointer; font-size: 12px; color: #cdd; white-space: nowrap; }
      .nt-row:hover { background: #242424; }
      .nt-row.file.active { background: #2d2f36; color: #fff; }
      .nt-ic { display: inline-flex; color: #9bd; flex: none; }
      .nt-name { overflow: hidden; text-overflow: ellipsis; }

      .md-view { padding: 18px 26px; max-width: 860px; margin: 0 auto; color: #ddd; font-family: -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.6; font-size: 14px; }
      .md-view h1, .md-view h2 { border-bottom: 1px solid #333; padding-bottom: .2em; }
      .md-view h1, .md-view h2, .md-view h3, .md-view h4, .md-view h5, .md-view h6 { line-height: 1.3; margin: 1.2em 0 .5em; color: #fff; }
      .md-view a, .md-view .md-link { color: #6cf; cursor: pointer; text-decoration: none; }
      .md-view a:hover, .md-view .md-link:hover { text-decoration: underline; }
      .md-view .wikilink-missing { color: #c77; border-bottom: 1px dashed #c77; cursor: default; }
      .md-view img { max-width: 100%; border-radius: 4px; }
      .md-view code { background: #2a2a2a; padding: .12em .35em; border-radius: 4px; font-family: Consolas, monospace; font-size: .92em; }
      .md-view pre { background: #161616; border: 1px solid #2c2c2c; border-radius: 6px; padding: 12px 14px; overflow: auto; }
      .md-view pre code { background: none; padding: 0; }
      .md-view blockquote { border-left: 3px solid #4a4a4a; margin: .6em 0; padding: .1em 1em; color: #bbb; }
      .md-view table { border-collapse: collapse; margin: .8em 0; display: block; overflow: auto; }
      .md-view th, .md-view td { border: 1px solid #3a3a3a; padding: 6px 10px; }
      .md-view th { background: #232323; }
      .md-view hr { border: none; border-top: 1px solid #333; margin: 1.4em 0; }
      .md-view li.task-item { list-style: none; margin-left: -1.2em; }
      .md-view li.task-item input { margin-right: 6px; }
      .md-view .callout { border: 1px solid #3a4250; border-left: 4px solid #4a90d9; border-radius: 6px; padding: 8px 12px; margin: .8em 0; background: #1f2530; }
      .md-view .callout-title { font-weight: bold; color: #cfe; margin-bottom: 4px; }
      .md-view .callout-warning, .md-view .callout-caution { border-left-color: #d9a441; background: #2a2620; }
      .md-view .callout-danger, .md-view .callout-error, .md-view .callout-bug { border-left-color: #d96a6a; background: #2a2020; }
      .md-view .callout-tip, .md-view .callout-success, .md-view .callout-note { border-left-color: #4a90d9; }
      .md-view .md-embed { border: 1px dashed #3a4250; border-radius: 6px; padding: 8px 12px; margin: .8em 0; background: #1d1d1d; }
      .md-view .md-embed .embed-title { color: #9ab; font-size: 12px; margin-bottom: 6px; }
      /* highlight.js — thème sombre minimal */
      .hljs-comment, .hljs-quote { color: #6a9955; }
      .hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #569cd6; }
      .hljs-string, .hljs-attr { color: #ce9178; }
      .hljs-number, .hljs-literal { color: #b5cea8; }
      .hljs-title, .hljs-function, .hljs-name { color: #dcdcaa; }
      .hljs-type, .hljs-class { color: #4ec9b0; }
      .hljs-variable, .hljs-template-variable { color: #9cdcfe; }
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3 : Commit**

```bash
git add src/renderer/index.html
git commit -m "feat(notes): styles du lecteur Markdown (viewer, arbo, callouts, highlight)"
```

---

## Task 22 : Vérification finale (build + tests + manuel)

**Files:** aucun (validation)

- [ ] **Step 1 : Tous les tests**

Run: `npx vitest run`
Expected: PASS (anciens + nouveaux : noteTree, notePaths, noteAssets, obsidian, sanitizeMarkdown, markdownRender, domTransforms, util, store).

- [ ] **Step 2 : Build complet**

Run: `npm run build`
Expected: build main + preload + renderer OK, sans erreur TypeScript.

- [ ] **Step 3 : Test manuel** (lancer l'app)

Run: `npm start`
Vérifier :
1. Menu `+` → « Markdown : ouvrir un fichier… » → choisir un `.md` → rendu correct (titres, tables, code, listes).
2. Menu `+` → « ouvrir un dossier… » → choisir un vault Obsidian → arborescence à gauche, clic sur un fichier → rendu à droite.
3. Cliquer un `[[wikilink]]` interne → navigue vers la note ; bouton ← revient.
4. Un lien externe `https://…` → s'ouvre dans le navigateur (pas dans l'app).
5. Une image relative s'affiche ; un callout `> [!note]` s'affiche encadré.
6. Modifier le `.md` ouvert dans Obsidian/Notepad → le viewer se rafraîchit (live-reload).
7. Réglages → définir un « Vault par défaut » → l'entrée « Vault par défaut » apparaît dans le menu `+`.
8. Épingler une note, fermer/relancer l'app → la note se rouvre au bon fichier.

- [ ] **Step 4 : Mettre à jour la documentation projet & mémoire**

Mettre à jour `README.md` (section features) et ajouter une entrée mémoire DIFAI-HUB décrivant le lecteur Markdown/Obsidian (architecture : kind note, notesModule, pipeline de rendu).

- [ ] **Step 5 : Commit final + push branche + PR**

```bash
git add README.md
git commit -m "docs(notes): lecteur Markdown/Obsidian dans le README"
git push -u origin feat/notes-markdown-viewer
```

Puis créer la PR vers `main` (le merge reste manuel — voir règles Git perso).

---

## Notes / limites connues (v1)

- **Transclusion** `![[Note]]` : profondeur 1, sans embeds imbriqués (le rendu interne retire les `div.md-embed`).
- **Résolution d'images d'embed** : essaie `dossier du fichier` puis `racine du vault` ; pas de recherche vault-wide par nom au-delà.
- **highlight.js** : import `lib/common` (langages courants) pour limiter le poids du bundle.
- **Pas d'édition** : lecture seule assumée ; modifier dans Obsidian, le viewer suit via live-reload.
- **CSP** : les images locales passent en `data:` (déjà autorisé par `img-src ... data:`), aucun accès réseau requis.
```
