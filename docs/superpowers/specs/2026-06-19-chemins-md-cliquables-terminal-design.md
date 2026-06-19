# Chemins `.md` cliquables dans le terminal → onglet Markdown

Date : 2026-06-19
Branche d'origine : `feat/detection-attente-question` (créer une branche dédiée pour le dev)

## Problème

Quand Claude rédige un rapport `.md` pendant une session, l'utilisateur doit
aller le chercher manuellement dans l'explorateur de fichiers puis l'ouvrir.
On veut pouvoir l'ouvrir directement depuis la sortie du terminal Claude.

## Besoin (décisions actées)

- **Déclencheur** : les chemins `.md` affichés dans la sortie du terminal sont
  **cliquables** ; un clic ouvre le fichier dans un onglet Markdown. Aucune
  action de Claude requise, aucune commande/skill.
- **Comportement à l'ouverture** : si le `.md` est **déjà ouvert** dans un
  onglet note, on **active** cet onglet ; sinon on **crée** un nouvel item note.
- **Mécanisme technique** : addon officiel `@xterm/addon-web-links` avec une
  regex custom (gère le retour à la ligne des chemins longs). Clic simple.

## Architecture

L'infra d'affichage d'un `.md` seul existe déjà : un item `kind:'note'` avec
`rootKind:'file'` (cf. `2026-06-09-lecteur-markdown-obsidian-design.md`).
Le travail porte sur **le déclencheur** (liens cliquables) et **l'ouverture**
(résolution + dédoublonnage + placement de l'onglet).

### 1. Matcher de chemins — `src/renderer/src/mdLinks.ts` (pur, testable)

```ts
export interface MdLink { start: number; end: number; token: string }
export function findMdLinks(text: string): MdLink[]
```

- Capture les chemins se terminant par `.md` ou `.markdown` :
  - absolus Windows : `C:\Users\…\rapport.md`
  - absolus POSIX : `/home/…/rapport.md`
  - relatifs : `docs/x.md`, `./x.md`, `../x.md`, `rapport.md`
- Nettoie les wrappers et la ponctuation finale : backticks, guillemets
  simples/doubles, parenthèses, virgule/point/`:`/`;` en fin de token.
- `start`/`end` = bornes du token **nettoyé** dans `text` (offsets de colonne).
- Volontairement **permissif** : c'est la vérification d'existence au clic qui
  fait le filtre réel. On ne touche pas au système de fichiers ici.

### 2. Intégration xterm — `src/renderer/src/components/Terminal.tsx`

- Charger `WebLinksAddon` (dépendance `@xterm/addon-web-links`, à ajouter).
- Configurer une **regex `.md`** (équivalente au matcher) et un handler
  `onActivate(event, token)`.
- Au clic : appeler `window.hub.notesResolveFile(cwd, token)` où `cwd` est le
  `cwd` de l'item courant (résolu via `useHub` à partir du `tabId`).
  - `null` → afficher « Fichier introuvable : … » via `confirm()` (ConfirmHost).
  - chemin absolu → `useHub.getState().openNoteFile(absPath, itemId)`.
- Garder le `Terminal` mince : toute la logique d'ouverture vit dans le store.

> Remarque : la regex passée à l'addon et `findMdLinks` partagent la même
> source de vérité (exporter la regex depuis `mdLinks.ts`). Le matcher unitaire
> sert aux tests ; l'addon consomme la regex.

### 3. IPC `NotesResolveFile(cwd, token)` — `src/main/modules/notesModule.ts`

```ts
ctx.ipc.handle(IPC.NotesResolveFile, (_e, cwd: string, token: string): string | null)
```

- `const abs = resolve(cwd, token)` (`node:path`).
- Retourne `abs` si : extension `.md`/`.markdown` **et** `existsSync(abs)` **et**
  `statSync(abs).isFile()`. Sinon `null`.
- Attention cross-platform (`resolve`/`join`), cf. pièges connus du module notes
  (tests cross-platform, `NODE_ENV=production` masque devDeps).

À déclarer dans `src/shared/ipc.ts` (constante `IPC.NotesResolveFile`) et
exposer dans le `preload` (`window.hub.notesResolveFile`).

### 4. Action store `openNoteFile` — `src/renderer/src/store.ts`

```ts
openNoteFile: (absPath: string, nearItemId: string) => void
```

- **Dédoublonnage** : chercher un item `kind:'note'` dont `note.root === absPath`.
  - Trouvé → `setActiveItem(found.id)` (réutilisation, comme choisi).
- **Création** sinon :
  - Groupe = celui qui contient `nearItemId`.
  - `split` = **volet opposé** à celui du terminal cliqué (terminal + rapport
    côte à côte) : si l'item source est `split:1` → note `split:2`, et inversement.
  - `name` = basename du fichier.
  - Item note non épinglé (éphémère), `note: { root: absPath, rootKind:'file', activePath: absPath }`.
  - `addItem(groupId, item)` puis l'item devient actif (addItem le fait déjà).
- Centraliser ici la création (réutiliser la logique de `addNoteItem` de la
  Sidebar) pour rester testable et garder `Terminal.tsx` mince.

### 5. Feedback « introuvable »

Réutiliser le `confirm()` impératif existant (ConfirmHost) pour un message
informatif simple. Pas de nouveau composant.

## Flux

```
Sortie terminal
  │  (WebLinksAddon + regex .md)
  ▼
clic sur token .md  ──► notesResolveFile(cwd, token)  [main]
                              │
                   null ◄─────┤────► absPath
                    │                  │
        confirm("introuvable")   openNoteFile(absPath, itemId)  [store]
                                       │
                          déjà ouvert ?├─ oui ─► setActiveItem
                                       └─ non ─► addItem(note, volet opposé)
```

## Tests

- `mdLinks.test.ts` : formes variées — absolu Windows/POSIX, relatif, `./`,
  backticks, guillemets, ponctuation finale, plusieurs par ligne, aucun match,
  token sans extension `.md` ignoré.
- `store` : `openNoteFile` — (a) active un onglet existant si `note.root`
  correspond ; (b) crée un item note dans le **volet opposé** au terminal ;
  (c) résout le bon groupe à partir de `nearItemId`.
- Résolution main : `path.resolve` + validation extension/existence/fichier
  (tests cross-platform).

## Hors périmètre (v1)

- **Pas de vérification au survol** : un `foo.md` inexistant reste souligné ;
  le clic affiche « introuvable ». Amélioration possible ultérieurement
  (vérif d'existence on-hover pour ne souligner que les fichiers réels).
- Pas de menu contextuel (clic droit), pas de commande/skill côté Claude.
- Liens limités au Markdown (`.md`/`.markdown`) — pas d'autres types de fichiers.

## Note d'implémentation (déviation par rapport au mécanisme initial)

Le mécanisme prévu (`@xterm/addon-web-links` + `urlRegex`) **ne fonctionne pas**
pour des chemins de fichiers : l'addon valide chaque token via `new URL()` et ne
crée de lien que pour des URL `http(s)`. `urlRegex` ne sert qu'à pré-filtrer.

Remplacé par un **`term.registerLinkProvider` maison** basé sur `findMdLinks` /
`mdLinkRanges` (aucune validation URL). La dépendance `@xterm/addon-web-links` a
été retirée.

**Limite induite** : le provider analyse chaque ligne tampon indépendamment ; un
chemin `.md` qui *wrappe* sur deux lignes du terminal n'est pas détecté (le
mécanisme initial gérait ce cas — c'était sa raison d'être). Acceptable pour V1 :
les chemins de rapports tiennent en général sur une ligne, et l'utilisateur peut
élargir le volet. La gestion du wrapping (reconstruction de la ligne logique +
mapping des colonnes avec caractères larges) est une amélioration ultérieure.
```
