# Lecteur images/HTML + skill `/dide-open` — Design

Date : 2026-06-23
Branche : `feat/reader-images-html-dide-open` (depuis `main`)

## Objectif

Deux fonctionnalités complémentaires autour du lecteur Markdown de DIFAI-IDE :

1. **Partie A — Lecteur images + HTML** : pouvoir consulter dans le lecteur, en plus des `.md`,
   les images (`.png`, `.jpeg`, …) et les fichiers `.html`. Ces fichiers apparaissent dans
   l'arbre d'un vault et peuvent aussi être ouverts en onglet autonome.
2. **Partie B — Skill `/dide-open`** : une skill Claude Code qui, invoquée depuis une session
   hébergée par un onglet difai-ide, ouvre un fichier (ou un dossier) en onglet dans le groupe
   de la session courante — sans avoir à connaître le chemin en dur côté utilisateur.

## Contexte existant (réutilisé)

- Lecteur : module main `notesModule` (`src/main/modules/notesModule.ts`) + vues renderer
  `NotesView` / `MarkdownView` / `NoteTree`. Items `kind: 'note'` avec
  `note: { root, rootKind: 'vault' | 'file', activePath }`.
- Arbre : `buildNoteTree` (`src/main/notes/noteTree.ts`) ne liste aujourd'hui que les `.md`
  et construit un index nom→chemin pour les wikilinks.
- Assets : `readAssetDataUri` (`src/main/notes/assets.ts`) lit déjà png/jpg/jpeg/gif/svg/webp/bmp/ico
  → data URI, borné à `MAX_BYTES` (10 Mo). Exposé via `IPC.NotesAsset`.
- Sécurité chemins : `isInside(root, target)` (`src/main/notes/paths.ts`) — vrai si `target === root`
  ou descendant. Donc un fichier standalone (`root === path`) passe la garde.
- **Bridge hooks (clé pour la Partie B)** : chaque session Claude lancée dans un onglet reçoit
  les variables d'env `DIFAI_HUB_PORT` (port du `HookServer`) et `DIFAI_HUB_TAB` (le `tabId`
  de l'onglet) — cf. `PtyManager.ts:49` et `sessionModule.ts`. Le `HookServer`
  (`src/main/HookServer.ts`) accepte tout POST JSON et le diffuse à ses abonnés via `onEvent`.
  Le script `resources/hooks/hook-forward.mjs` POST déjà vers ce serveur.
- Corrélation : les items renderer portent un champ `tabId` (le tabId pty). `SessionRegistry`
  (main) mappe `tabId → { cwd, sessionId, … }`.

## Partie A — Lecteur images + HTML

### Classification de fichier

Nouvel util partagé `classifyNoteFile(path) → 'md' | 'image' | 'html'` (placé dans
`src/shared/` pour usage main + renderer, ou dupliqué minimalement si l'import cross-process
pose problème — décision à l'implémentation, défaut : `src/shared/noteKind.ts`).

- `md` : `.md`, `.markdown`
- `image` : `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`
- `html` : `.html`, `.htm`

### Arbre du vault

- `noteTree.ts` : lister aussi les fichiers `image` et `html` (en plus des `.md`), triés comme
  aujourd'hui. Chaque node fichier porte un champ `kind: 'md' | 'image' | 'html'`.
- **L'index wikilink reste `md`-only** — les images/html ne sont pas des cibles de wikilink.
- Type `NoteTreeNode` (`src/shared/ipc.ts`) : ajouter `kind?: 'md' | 'image' | 'html'`
  (absence = `md`, rétro-compatible).
- `NoteTree.tsx` : afficher une petite icône selon `kind` (🖼 image, 🌐 html, défaut note).
  Le clic appelle `open(path)` — inchangé.

### Lecture HTML

- Nouveau handler `IPC.NotesReadRaw(root, path) → NotesResult<{ path; content: string }>` :
  renvoie le texte brut du fichier `.html`, borné par `MAX_BYTES`, après contrôle `isInside`.
  (On n'étend pas `NotesRead`, dont le contrat `{ path, markdown }` reste dédié au markdown.)

### Rendu (NotesView)

`NotesView` calcule le `kind` de `activePath` et branche le rendu :

- `md` → `MarkdownView` (inchangé). Lecture via `notesRead`.
- `image` → nouveau `ImageView` : appelle `notesAsset(root, activePath)` → `<img>` avec
  ajustement CSS (fit-to-width, scroll si plus grand). **Pas** de lecture markdown.
- `html` → nouveau `HtmlView` : lit le brut via `notesReadRaw` → rend dans
  `<iframe sandbox="allow-scripts" srcdoc={content}>`.

Détails :

- L'effet de chargement initial (`rootKind: 'file'` et changement de racine) ne doit appeler
  `notesRead` que pour les `md`. Pour `image`/`html`, la vue dédiée fait sa propre lecture.
- La barre de recherche in-page (Ctrl+F) et les wikilinks ne s'appliquent qu'au markdown ;
  pour image/html, `matchCount = 0` et la barre reste inerte (ou masquée).
- `firstFile()` (sélection initiale dans un vault) : conserver « premier fichier non-dossier »
  (peut désormais être une image/html — acceptable).

### Sécurité HTML

- `sandbox="allow-scripts"` **sans** `allow-same-origin` : le JS/CSS inline s'exécute (artefacts
  HTML autoportés, ex. sortie de la skill artifact-design), mais l'iframe est en origine opaque —
  aucun accès au reste de l'app, et le réseau externe est bloqué par le sandbox.
- **Ne jamais** combiner `allow-scripts` + `allow-same-origin` (cela annulerait l'isolation).
- Conséquence assumée : un `.html` qui dépend de ressources externes/relatives n'affichera pas
  ces ressources. Cible = pages autoportées. Documenté, hors scope d'inliner les assets.
- `rootKind: 'file'` standalone (image/html) : `root === activePath`, `isInside` accepte.

## Partie B — Skill `/dide-open` + bridge

### Flux

```
/dide-open <chemin>   (session Claude hébergée par un onglet difai-ide)
 → skill : POST { kind:'dide-open', tabId:$DIFAI_HUB_TAB, path:<arg> } vers http://127.0.0.1:$DIFAI_HUB_PORT/
 → HookServer.dispatch (inchangé — accepte tout POST JSON)
 → dideOpenModule (main) : abonné via ctx.hookServer.onEvent, filtre kind==='dide-open'
       • résout le chemin : si relatif, join avec SessionRegistry.get(tabId).cwd
       • statSync → fichier | dossier ; valide l'existence (sinon ignore + log)
       • ctx.sender.send(IPC.DideOpen, { tabId, absPath, isDir })
 → preload : onDideOpen(cb)
 → App.tsx : trouve l'item où item.tabId === tabId → son groupe
       • store.openNoteRoot(absPath, isDir ? 'vault' : 'file', nearItemId)
       • si tabId introuvable → fallback : groupe actif courant
```

### Skill (`~/.claude/skills/dide-open/`)

- **Emplacement global** (user-level), pas dans le repo DIFAI-HUB : la skill doit être disponible
  dans **toute** session hébergée par difai-ide (GLMS, Messika, …), pas seulement quand la session
  est ouverte sur le repo DIFAI-HUB.
- Comportement : lit `$DIFAI_HUB_PORT` et `$DIFAI_HUB_TAB`. Si absents → message clair
  « pas dans difai-ide, /dide-open indisponible ». Sinon, POST le payload (path tel quel,
  relatif possible) et confirme à l'utilisateur l'ouverture demandée.
- Portabilité : la commande de POST doit fonctionner sous Windows (environnement principal).
  Décision d'implémentation : POST via `node` (présent, cross-plateforme) plutôt que curl.
- La **résolution du chemin et la détection fichier/dossier se font côté main** (a accès au fs
  et au cwd via `SessionRegistry`), pas dans la skill — évite les soucis de portabilité shell.

### Module main `dideOpenModule`

- Nouveau module (`src/main/modules/dideOpenModule.ts`), enregistré comme les autres dans
  `index.ts`. S'abonne à `ctx.hookServer.onEvent`, ne traite que `kind === 'dide-open'`.
- Résout, valide, puis `ctx.sender.send(IPC.DideOpen, payload)`.

### Store

- Généraliser `openNoteFile(absPath, nearItemId)` en `openNoteRoot(absPath, rootKind, nearItemId)`
  ouvrant un fichier **ou** un vault. `openNoteFile` devient un wrapper (`rootKind: 'file'`).
- Conserver la déduplication existante (un item note avec le même `root` est réactivé, pas dupliqué).

### IPC / preload

- `IPC.DideOpen: 'dide:open'` + type de payload `{ tabId: string | null; absPath: string; isDir: boolean }`.
- Preload : `onDideOpen(cb): Unsub` (pattern identique à `onNotesChanged`).

## Tests

- `classifyNoteFile` : mapping extensions (md/image/html, casse, inconnu).
- `noteTree` : images + html listés avec `kind` ; index wikilink reste md-only ; dossiers ignorés inchangés.
- `NotesReadRaw` : lecture brute html, borne `MAX_BYTES`, rejet hors `isInside`.
- `dideOpenModule` : résolution relatif/abs via cwd registry, détection fichier/dossier,
  `tabId` inconnu (payload émis quand même, fallback géré côté renderer), fichier inexistant ignoré.
- `store.openNoteRoot` : ouverture file vs vault, near item / groupe, déduplication.

## Hors scope (YAGNI)

- Édition de fichiers (lecture seule, comme aujourd'hui).
- Résolution/inlining des assets relatifs dans le HTML (srcdoc autoporté uniquement).
- Support PDF ou autres types de fichiers.
- Affichage d'un dossier d'images en galerie.
