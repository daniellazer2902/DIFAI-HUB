# Chemins `.md` cliquables dans le terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les chemins `.md` affichés dans le terminal Claude cliquables pour ouvrir le fichier dans un onglet Markdown.

**Architecture:** Un matcher de chemins pur (regex partagée) alimente le `WebLinksAddon` de xterm (gère le wrapping). Au clic, un IPC `main` résout/valide le chemin contre le `cwd` de l'item, puis une action store `openNoteFile` réutilise l'onglet note existant ou en crée un nouveau dans le volet opposé.

**Tech Stack:** Electron + React + Zustand, xterm.js 5.5 (`@xterm/addon-web-links` 0.11), Vitest, TypeScript strict.

## Global Constraints

- TypeScript strict ; esbuild ne typecheck pas → la vérif se fait avec `npx tsc -p tsconfig.json` (doit passer sans erreur).
- Tests : `npx vitest run <fichier>` (ou `npm test` pour tout).
- Source de vérité IPC : `src/shared/ipc.ts` (constante `IPC.*` + type dans `HubApi`), puis `src/preload/index.ts`, puis le module main.
- Items note : `kind:'note'`, `rootKind:'file'`, non épinglés (éphémères). `note.root` = chemin absolu du fichier.
- Dépendance à ajouter : `@xterm/addon-web-links@^0.11.0` (peer `@xterm/xterm ^5.0.0`, compatible 5.5).
- Commits : messages en français avec accents, encodage UTF-8 (`git commit -F-` via heredoc). Aucune mention d'auteur IA / pas de `Co-Authored-By`. Branche de travail : `feat/chemins-md-cliquables` (déjà active).
- Plateforme principale : Windows. Les helpers de chemin doivent rester cross-platform (cf. pièges connus du module notes).

---

## File Structure

- `src/renderer/src/mdLinks.ts` — **créer** — regex `.md` partagée + `findMdLinks` (pur, testable).
- `src/main/notes/resolveMd.ts` — **créer** — `resolveMdPath(cwd, token, exists)` (pur, testable).
- `src/shared/ipc.ts` — **modifier** — constante `NotesResolveFile` + méthode `notesResolveFile` dans `HubApi`.
- `src/preload/index.ts` — **modifier** — câblage `notesResolveFile`.
- `src/main/modules/notesModule.ts` — **modifier** — handler `IPC.NotesResolveFile`.
- `src/renderer/src/store.ts` — **modifier** — action `openNoteFile(absPath, nearItemId)`.
- `src/renderer/src/components/Terminal.tsx` — **modifier** — charge `WebLinksAddon`, handler de clic.
- `tests/mdLinks.test.ts`, `tests/resolveMd.test.ts` — **créer**.
- `tests/store.test.ts` — **modifier** — cas `openNoteFile`.

---

### Task 1 : Matcher de chemins `.md` (pur)

**Files:**
- Create: `src/renderer/src/mdLinks.ts`
- Test: `tests/mdLinks.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `export const MD_PATH_RE: RegExp` (global, insensible à la casse) — consommée par le `WebLinksAddon` (Task 5).
  - `export interface MdLink { start: number; end: number; token: string }`
  - `export function findMdLinks(text: string): MdLink[]`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/mdLinks.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { findMdLinks } from '../src/renderer/src/mdLinks'

const tokens = (s: string): string[] => findMdLinks(s).map((l) => l.token)

describe('findMdLinks', () => {
  it('chemin absolu Windows', () => {
    expect(tokens('écrit dans C:\\Users\\d\\docs\\rapport.md.')).toEqual(['C:\\Users\\d\\docs\\rapport.md'])
  })
  it('chemin absolu POSIX', () => {
    expect(tokens('voir /home/d/r.md')).toEqual(['/home/d/r.md'])
  })
  it('chemin relatif', () => {
    expect(tokens('cf docs/superpowers/specs/2026-06-19-x-design.md')).toEqual(['docs/superpowers/specs/2026-06-19-x-design.md'])
  })
  it('relatif avec ./ et ../', () => {
    expect(tokens('./a.md et ../b.markdown')).toEqual(['./a.md', '../b.markdown'])
  })
  it('nettoie backticks et guillemets', () => {
    expect(tokens('le fichier `rapport.md` et "notes.md"')).toEqual(['rapport.md', 'notes.md'])
  })
  it('nettoie parenthèses et ponctuation finale', () => {
    expect(tokens('(voir x.md), puis y.md;')).toEqual(['x.md', 'y.md'])
  })
  it('plusieurs sur une ligne', () => {
    expect(tokens('a.md b.md').length).toBe(2)
  })
  it('ignore les non-.md et .md5', () => {
    expect(tokens('script.ts, hash.md5, image.png')).toEqual([])
  })
  it('renvoie les bornes du token nettoyé', () => {
    const [l] = findMdLinks('x `a.md`')
    expect('x `a.md`'.slice(l.start, l.end)).toBe('a.md')
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run tests/mdLinks.test.ts`
Expected: FAIL — `findMdLinks` introuvable.

- [ ] **Step 3: Implémenter le matcher**

Créer `src/renderer/src/mdLinks.ts` :

```ts
// Chemins .md/.markdown dans du texte de terminal. Permissif : la vérif
// d'existence (côté main) fait le filtre réel. Exclut espaces et wrappers
// (backticks, guillemets, parenthèses, crochets, accolades, virgule, ;).
// `md5` est exclu par la frontière de mot \b après l'extension.
export const MD_PATH_RE = /[^\s"'`<>|*?()[\]{},;]*\.(?:markdown|md)\b/gi

export interface MdLink { start: number; end: number; token: string }

export function findMdLinks(text: string): MdLink[] {
  const re = new RegExp(MD_PATH_RE.source, MD_PATH_RE.flags)
  const out: MdLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue }
    out.push({ start: m.index, end: m.index + m[0].length, token: m[0] })
  }
  return out
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run tests/mdLinks.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/mdLinks.ts tests/mdLinks.test.ts
git commit -F- <<'EOF'
feat(terminal): matcher de chemins .md (mdLinks)
EOF
```

---

### Task 2 : Résolution `.md` côté main (pur)

**Files:**
- Create: `src/main/notes/resolveMd.ts`
- Test: `tests/resolveMd.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `export function resolveMdPath(cwd: string, token: string, exists: (p: string) => boolean): string | null` — utilisée par le handler IPC (Task 3). Retourne le chemin absolu canonique si extension `.md`/`.markdown` ET `exists(abs)`, sinon `null`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/resolveMd.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { resolveMdPath } from '../src/main/notes/resolveMd'

describe('resolveMdPath', () => {
  it('résout un relatif .md existant contre cwd', () => {
    const cwd = resolve('/proj')
    const abs = resolveMdPath(cwd, 'docs/r.md', () => true)
    expect(abs).toBe(resolve(cwd, 'docs/r.md'))
  })
  it('accepte un absolu .md existant', () => {
    const abs = resolve('/proj/x.markdown')
    expect(resolveMdPath('/whatever', abs, () => true)).toBe(abs)
  })
  it('null si non .md même si existant', () => {
    expect(resolveMdPath('/proj', 'script.ts', () => true)).toBeNull()
  })
  it('null si fichier absent', () => {
    expect(resolveMdPath('/proj', 'docs/r.md', () => false)).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run tests/resolveMd.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le helper**

Créer `src/main/notes/resolveMd.ts` :

```ts
import { resolve } from 'node:path'

/** Chemin absolu .md/.markdown si existant (via `exists`), sinon null. */
export function resolveMdPath(cwd: string, token: string, exists: (p: string) => boolean): string | null {
  const abs = resolve(cwd, token)
  if (!/\.(?:md|markdown)$/i.test(abs)) return null
  return exists(abs) ? abs : null
}
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run tests/resolveMd.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/notes/resolveMd.ts tests/resolveMd.test.ts
git commit -F- <<'EOF'
feat(notes): resolveMdPath (validation chemin .md cote main)
EOF
```

---

### Task 3 : IPC `NotesResolveFile`

**Files:**
- Modify: `src/shared/ipc.ts` (bloc `// Notes / Markdown (renderer -> main)` ~ligne 27-35 ; interface `HubApi` ~ligne 165-173)
- Modify: `src/preload/index.ts:43-51`
- Modify: `src/main/modules/notesModule.ts` (imports + nouveau handler)

**Interfaces:**
- Consumes: `resolveMdPath` (Task 2).
- Produces: `window.hub.notesResolveFile(cwd: string, token: string): Promise<string | null>` — utilisée par Terminal (Task 5).

- [ ] **Step 1: Déclarer le canal IPC + la méthode du contrat**

Dans `src/shared/ipc.ts`, ajouter dans le bloc Notes (après `NotesUnwatch: 'notes:unwatch',`) :

```ts
  NotesResolveFile: 'notes:resolve-file',
```

Puis dans `interface HubApi`, après `notesUnwatch(itemId: string): void` :

```ts
  notesResolveFile(cwd: string, token: string): Promise<string | null>
```

- [ ] **Step 2: Câbler le preload**

Dans `src/preload/index.ts`, après la ligne `notesUnwatch: (itemId) => ipcRenderer.send(IPC.NotesUnwatch, itemId),` :

```ts
  notesResolveFile: (cwd, token) => ipcRenderer.invoke(IPC.NotesResolveFile, cwd, token),
```

- [ ] **Step 3: Implémenter le handler main**

Dans `src/main/modules/notesModule.ts` :

1. Ajouter aux imports `node:fs` la fonction `statSync` et `existsSync` :
```ts
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
```
2. Importer le helper en haut :
```ts
import { resolveMdPath } from '../notes/resolveMd'
```
3. Dans `register`, à côté des autres `ctx.ipc.handle(IPC.Notes…)`, ajouter :
```ts
ctx.ipc.handle(IPC.NotesResolveFile, (_e, cwd: string, token: string): string | null =>
  resolveMdPath(cwd, token, (p) => existsSync(p) && statSync(p).isFile())
)
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: aucune erreur (le contrat `HubApi` est satisfait par le preload).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/modules/notesModule.ts
git commit -F- <<'EOF'
feat(notes): IPC notesResolveFile (resolution chemin .md)
EOF
```

---

### Task 4 : Action store `openNoteFile`

**Files:**
- Modify: `src/renderer/src/store.ts` (import `basename` ; déclaration dans `interface HubState` ~ligne 109 ; implémentation dans `create<HubState>` ~après `setNoteActivePath`)
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `addItem`, `setActiveItem`, `uid`, `basename`.
- Produces: `openNoteFile: (absPath: string, nearItemId: string) => void` — réutilise l'onglet note si `note.root === absPath`, sinon crée un item note dans le groupe de `nearItemId`, volet opposé.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `tests/store.test.ts`, ajouter un bloc (après les tests existants, avant la dernière `})` du fichier de description, ou dans un nouveau `describe`). Le helper `mkItem` existe déjà en tête de fichier.

```ts
describe('openNoteFile', () => {
  beforeEach(() => useHub.getState().reset())

  it('crée un item note dans le volet opposé au terminal', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('term', { split: 1 }))
    useHub.getState().openNoteFile('C:/proj/rapport.md', 'term')
    const items = useHub.getState().groups.find((x) => x.id === g)!.items
    const note = items.find((i) => i.kind === 'note')!
    expect(note.note).toEqual({ root: 'C:/proj/rapport.md', rootKind: 'file', activePath: 'C:/proj/rapport.md' })
    expect(note.name).toBe('rapport.md')
    expect(note.split).toBe(2)
    expect(useHub.getState().activeItemId).toBe(note.id)
  })

  it('réutilise l\'onglet si le .md est déjà ouvert', () => {
    const g = useHub.getState().addGroup('G')
    useHub.getState().addItem(g, mkItem('term', { split: 1 }))
    useHub.getState().openNoteFile('C:/proj/r.md', 'term')
    const firstId = useHub.getState().groups.find((x) => x.id === g)!.items.find((i) => i.kind === 'note')!.id
    useHub.getState().openNoteFile('C:/proj/r.md', 'term')
    const notes = useHub.getState().groups.find((x) => x.id === g)!.items.filter((i) => i.kind === 'note')
    expect(notes).toHaveLength(1)
    expect(useHub.getState().activeItemId).toBe(firstId)
  })
})
```

- [ ] **Step 2: Lancer le test (échec attendu)**

Run: `npx vitest run tests/store.test.ts`
Expected: FAIL — `openNoteFile` n'existe pas.

- [ ] **Step 3: Implémenter l'action**

Dans `src/renderer/src/store.ts` :

1. Ajouter l'import en tête (après l'import zustand) :
```ts
import { basename } from './util'
```
2. Dans `interface HubState`, après `setNoteActivePath: (itemId: string, path: string) => void` :
```ts
  openNoteFile: (absPath: string, nearItemId: string) => void
```
3. Dans l'objet passé à `create<HubState>`, après l'implémentation de `setNoteActivePath` :
```ts
  openNoteFile: (absPath, nearItemId) => {
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
      kind: 'note', note: { root: absPath, rootKind: 'file', activePath: absPath }
    })
  },
```

- [ ] **Step 4: Lancer le test (succès attendu)**

Run: `npx vitest run tests/store.test.ts`
Expected: PASS (tous, dont les 2 nouveaux).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store.ts tests/store.test.ts
git commit -F- <<'EOF'
feat(store): openNoteFile (reutilise ou cree un onglet note, volet oppose)
EOF
```

---

### Task 5 : Intégration xterm (`WebLinksAddon`) dans le Terminal

**Files:**
- Modify: `package.json` (dépendance)
- Modify: `src/renderer/src/components/Terminal.tsx`

**Interfaces:**
- Consumes: `MD_PATH_RE` (Task 1), `window.hub.notesResolveFile` (Task 3), `useHub.openNoteFile` + `useHub.itemByTab` (Task 4), `confirm` (`src/renderer/src/confirm.ts`).
- Produces: comportement UI (pas d'API).

- [ ] **Step 1: Ajouter la dépendance**

Run: `npm install --save @xterm/addon-web-links@^0.11.0`
Expected: ajoutée dans `dependencies`, `node_modules/@xterm/addon-web-links` présent.

- [ ] **Step 2: Importer et charger l'addon**

Dans `src/renderer/src/components/Terminal.tsx`, après les imports existants :

```ts
import { WebLinksAddon } from '@xterm/addon-web-links'
import { MD_PATH_RE } from '../mdLinks'
import { confirm } from '../confirm'
```

Dans le `useEffect`, juste après `term.loadAddon(fit)` :

```ts
const links = new WebLinksAddon(
  (_event, uri) => { void openMdLink(uri) },
  { urlRegex: MD_PATH_RE }
)
term.loadAddon(links)
```

- [ ] **Step 3: Implémenter le handler de clic**

Toujours dans le composant `Terminal`, à l'intérieur du `useEffect` (avant le `return` de cleanup), définir :

```ts
async function openMdLink(token: string): Promise<void> {
  const item = useHub.getState().itemByTab(tabId)
  if (!item) return
  const abs = await window.hub.notesResolveFile(item.cwd, token)
  if (!abs) {
    await confirm({ title: 'Fichier introuvable', message: token, confirmLabel: 'OK' })
    return
  }
  useHub.getState().openNoteFile(abs, item.id)
}
```

> Note : `WebLinksAddon` se nettoie via `term.dispose()` déjà appelé dans le cleanup — pas de dispose explicite nécessaire.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 5: Vérification manuelle (xterm = pas de test unitaire)**

Run: `npm run dev`
Procédure :
1. Ouvrir une session Claude dans un dossier contenant un `.md` (ex. `docs/...`).
2. Demander à Claude d'afficher un chemin `.md` existant (ou `echo`/`ls` un `.md`).
3. Survoler le chemin → souligné ; cliquer → un onglet Markdown s'ouvre dans le **volet opposé** et affiche le fichier.
4. Recliquer le même chemin → l'onglet existant est réactivé (pas de doublon).
5. Cliquer un chemin `.md` inexistant → modale « Fichier introuvable ».

Expected: les 5 points OK.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/renderer/src/components/Terminal.tsx
git commit -F- <<'EOF'
feat(terminal): chemins .md cliquables -> ouverture onglet Markdown
EOF
```

---

### Task 6 : Vérification finale

- [ ] **Step 1: Suite complète + typecheck**

Run: `npm test`
Expected: tous les tests passent.

Run: `npx tsc -p tsconfig.json`
Expected: aucune erreur.

- [ ] **Step 2: Mettre à jour le README si la liste des fonctionnalités y est tenue**

Vérifier `README.md` (section fonctionnalités / lecteur Markdown) et ajouter une ligne : chemins `.md` cliquables dans le terminal. Si une telle section n'existe pas, ne rien forcer.

```bash
git add README.md
git commit -F- <<'EOF'
docs: chemins .md cliquables dans le terminal
EOF
```

---

## Self-Review

**Spec coverage :**
- Matcher de chemins (spec §1) → Task 1. ✓
- Intégration xterm / WebLinksAddon (spec §2) → Task 5. ✓
- IPC `NotesResolveFile` (spec §3) → Task 2 (helper pur) + Task 3 (IPC). ✓
- Action `openNoteFile` dédoublonnage + volet opposé (spec §4) → Task 4. ✓
- Feedback « introuvable » via ConfirmHost (spec §5) → Task 5 step 3. ✓
- Tests (spec §6) → Tasks 1, 2, 4 + vérif manuelle Task 5. ✓
- Hors périmètre v1 (pas de hover-verify, pas de menu contextuel) → respecté.

**Placeholder scan :** aucun TBD/TODO ; tout le code est fourni.

**Type consistency :** `MD_PATH_RE`/`findMdLinks` (Task 1) ↔ import Task 5 ; `resolveMdPath(cwd, token, exists)` (Task 2) ↔ handler Task 3 ; `notesResolveFile(cwd, token): Promise<string|null>` (Task 3) ↔ appel Task 5 ; `openNoteFile(absPath, nearItemId)` (Task 4) ↔ appel Task 5. Cohérent.
