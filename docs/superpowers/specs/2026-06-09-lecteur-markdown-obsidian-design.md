# Lecteur Markdown / Obsidian — Design

Date : 2026-06-09
Branche cible : `main` (via branche de feature dédiée)
Statut : validé (brainstorming), prêt pour plan d'implémentation

## Contexte & objectif

L'utilisateur tient sa documentation dans un vault Obsidian (dossier de fichiers
`.md`). Aujourd'hui il doit soit ouvrir Notepad++ (aucun formatage : tables
illisibles), soit ouvrir Obsidian et bricoler un vault pour lire proprement un
fichier. On veut lire ces `.md` **directement depuis DIFAI-IDE**, avec un rendu
correct (titres, tables, code, images, liens cliquables, syntaxe Obsidian
essentielle).

### Décision : on n'embarque PAS Obsidian

Obsidian est une app Electron fermée, sans API d'embarquement. `<webview>`/iframe
impossible (ce n'est pas un serveur web), reparenting de fenêtre OS = hack
fragile Windows-only. **On construit notre propre lecteur** qui lit le même
dossier de `.md` sur disque. Un vault Obsidian = juste un dossier de fichiers
Markdown.

Ce choix s'aligne sur les patterns déjà en place :
- le board ADO rend déjà du HTML sanitisé dans le renderer (`AdoDetail` +
  `sanitize.ts`, images inlinées en data URI) → même technique pour le Markdown ;
- `chokidar` est déjà une dépendance → live-reload gratuit ;
- le modèle d'item porte déjà un `kind` (`claude` | `ado` | `cmd`) → on ajoute
  `note`.

## Périmètre

### Inclus
- Niveau de rendu : **GFM complet + bases Obsidian** (titres, tables, code coloré,
  images, listes, citations, liens externes ; wikilinks `[[...]]` cliquables,
  embeds `![[...]]`, callouts `> [!note]`, frontmatter masqué, tags).
- Deux usages couverts par **un seul viewer** :
  1. ouvrir un **dossier (vault)** → arborescence + viewer + navigation par liens ;
  2. ouvrir un **fichier `.md` seul** → viewer direct.
- Point d'entrée : item autonome dans le menu `+`, + un **vault par défaut**
  mémorisé dans les réglages pour rouvrir en un clic.
- **Lecture seule** + **live-reload** (modif sur disque, ex. via Obsidian →
  rafraîchissement auto).

### Exclus (YAGNI)
- Édition de fichiers.
- Dataview / requêtes, Mermaid, LaTeX, graph view.
- Multi-vaults simultanés au niveau configuration (un vault par défaut suffit ;
  on peut toujours ouvrir plusieurs items vault).
- Liaison vault↔groupe (style ADO) : écartée au profit de l'item autonome.

## Moteur de rendu

`markdown-it` → HTML → `sanitizeMarkdownHtml` → `dangerouslySetInnerHTML`.
Choisi pour rester cohérent avec le rendu HTML ADO existant et minimiser
l'effort sur les extensions Obsidian (règles custom / préprocessing simples).
Alternative `react-markdown` + remark/rehype écartée : chaque extension Obsidian
exigerait un plugin remark dédié (effort supérieur) pour un gain d'idiomatisme
React non décisif ici.

Composé de :
- cœur `markdown-it` (tables, citations, listes, emphase) ;
- coloration syntaxique via `highlight.js` (option `highlight` de markdown-it) ;
- frontmatter YAML masqué (capturé, non rendu) ;
- règles/préprocessing custom Obsidian :
  - wikilinks `[[Cible]]` / `[[Cible|alias]]` → lien interne `data-href` ;
  - embeds `![[fichier.png]]` (image) et `![[Note]]` (transclusion simple : on
    inline le contenu de la note ciblée, profondeur 1, sans récursion) ;
  - callouts `> [!type] Titre` → `<div class="callout callout-<type>">`.

Les plugins/règles exacts seront figés dans le plan d'implémentation.

## Modèle de données

Extension de `PersistItem` (`src/shared/ipc.ts`) :

```ts
kind?: 'claude' | 'ado' | 'cmd' | 'note'
note?: {
  root: string            // dossier (vault) ou chemin du fichier
  rootKind: 'vault' | 'file'
  activePath: string | null  // fichier actuellement ouvert (abs). file => == root
}
```

Réglages (settings du lot 3) : `defaultVault: string | null`.

L'item `note` n'a pas de `tabId`/session PTY (comme l'item `ado`) : `tabId: null`,
`state: 'done'`.

## Process main — `notesModule` (pattern HubModule)

Nouveau module branché comme les autres (contrat IPC → preload → module main).

Canaux IPC (renderer → main) :
- `notes:pickFolder` → dialog dossier, renvoie chemin ou `null`.
- `notes:pickFile` → dialog fichier filtré `.md`/`.markdown`, renvoie chemin ou `null`.
- `notes:tree(root)` → `{ tree: NoteTreeNode; index: Record<string, string> }`
  - `tree` : arborescence dossiers + fichiers `.md` (tri dossiers d'abord puis
    alpha) ; ignore `.obsidian`, `.git`, `.trash`, dossiers commençant par `.`,
    `node_modules`.
  - `index` : `basenameSansExtension(lowercase) → cheminAbsolu` pour résoudre les
    wikilinks à la manière Obsidian (résolution vault-wide ; en cas de collision,
    chemin le plus court). Sert aussi à valider les liens (existant/orphelin).
- `notes:read(path)` → `{ markdown: string }` (UTF-8). Erreur structurée si
  hors-vault ou introuvable.
- `notes:asset(path)` → `{ dataUri: string }` : image locale lue et encodée en
  data URI (réutilise l'approche d'inline d'images ADO). Limite de taille
  raisonnable (ex. refuse > 10 Mo, renvoie placeholder).
- `notes:openExternal(url)` → `shell.openExternal` (http/https/mailto seulement).

Événement (main → renderer) :
- `notes:changed(path)` → émis par **chokidar** quand le fichier ouvert change,
  ou quand l'arbo du vault change (ajout/suppression/rename). Le renderer
  re-`read` le fichier actif et/ou re-`tree`.

Sécurité chemins : toute lecture (`read`, `asset`) est confinée sous `root`
(résolution + vérification de préfixe) pour éviter le path traversal via un lien
relatif malicieux dans un `.md`.

## Renderer — composant `NotesView`

Monté dans le corps du pane quand l'item actif est `kind: 'note'` (à côté de
`Terminal`, `Console`, `SearchPanel`, `AdoBoard`).

- `rootKind: 'vault'` : layout deux colonnes — **arborescence** à gauche
  (repliable, largeur mémorisée), **viewer** à droite avec barre (fil d'Ariane du
  chemin, boutons retour/avant).
- `rootKind: 'file'` : viewer seul (pas d'arbo).

Sous-composant `MarkdownView` : reçoit le markdown brut + dossier de base +
callbacks (`onInternalLink(path)`, `onAsset(path)`). Produit le HTML sanitisé et
le rend. Réutilisable indépendamment (testable).

## Navigation & liens

Délégation d'un seul handler de clic sur le conteneur du viewer :
- élément porteur de `data-href` (lien interne `.md` relatif **ou** wikilink
  résolu via l'index) → charge le fichier ciblé dans le viewer, met à jour
  `activePath`, empile l'historique ; wikilink orphelin (absent de l'index) →
  rendu distinct (classe `wikilink-missing`), clic sans effet ;
- lien `href` http/https/mailto → `notes:openExternal` ;
- ancre `#titre` → scroll interne vers l'ancre (slug des titres).

Historique back/forward local au viewer (pile simple), boutons dans la barre.

Images : pendant le rendu, chaque `src` d'image (relatif au fichier ou embed
`![[...]]`) est résolu en chemin absolu sous le vault, puis remplacé par le data
URI obtenu via `notes:asset`. Chargement à la demande par image.

## Live-reload

chokidar (côté main) surveille :
- le fichier actuellement ouvert → `notes:changed(path)` → re-read + re-render
  (préservation de la position de scroll au mieux) ;
- la racine du vault (profondeur récursive, mêmes exclusions que `tree`) →
  rafraîchissement de l'arborescence sur add/unlink/rename.

Un seul watcher par item `note`, démonté à la fermeture de l'item.

## Sécurité / sanitisation

Nouvelle fonction `sanitizeMarkdownHtml` (ou paramétrage de `sanitize.ts`) avec
allowlist élargie par rapport à la version ADO :
- balises ajoutées : `H5`, `H6`, `INPUT` (checkbox de task-list, `disabled`) ;
- attribut `class` autorisé sur `PRE`/`CODE`/`SPAN`/`DIV` (coloration + callouts) ;
- attribut `data-href` autorisé (navigation interne ; le `href` réel des liens
  internes est retiré) ;
- liens externes : `target="_blank"` `rel="noopener noreferrer"` forcés
  (http/https/mailto uniquement) ;
- images : `src` en `data:` autorisé (les locales sont déjà inlinées) ;
- `id` autorisé sur les titres (ancres) ;
- tout le reste (scripts, styles, handlers `on*`, iframes…) supprimé comme
  aujourd'hui.

La version ADO reste inchangée (allowlist stricte conservée pour ce flux).
Menace globalement faible (fichiers locaux de l'utilisateur) mais HTML inline
possible dans les `.md` → on sanitise.

## Persistance

`note` est sérialisé dans le workspace (`PersistItem`) → réouverture au bon
fichier (`activePath`) au prochain démarrage. Items `note` épinglables comme les
autres. Le `defaultVault` vit dans les réglages.

## Entrées UI

Menu `+` du pane (et menu de débordement), groupe « Markdown / Obsidian » :
- *Vault par défaut* (visible si `defaultVault` défini) → ouvre l'item vault ;
- *Ouvrir un dossier (vault)…* → `notes:pickFolder` ;
- *Ouvrir un fichier `.md`…* → `notes:pickFile`.

Depuis un vault ouvert : action « Définir comme vault par défaut » (écrit le
réglage). Réglage modifiable aussi depuis le panneau de réglages (lot 3).

## Tests

- Parsing/transform Obsidian : wikilinks (`[[a]]`, `[[a|b]]`), embeds image et
  note, callouts → HTML attendu.
- Résolution de chemins : wikilink via index (collision → plus court chemin),
  lien `.md` relatif, image relative ; confinement sous `root` (rejet path
  traversal).
- `sanitizeMarkdownHtml` : conserve tables/code/`data-href`/`class` autorisés,
  supprime scripts/handlers, force `target/rel` sur liens externes.
- Construction de l'arbo : exclusions (`.obsidian`, dotfolders), tri.

Modules purs (parsing, résolution, sanitize, arbo) testés en isolation comme le
reste du projet (vitest).

## Dépendances ajoutées

- `markdown-it`
- `highlight.js`
- plugins markdown-it éventuels (frontmatter, task-lists) — liste exacte figée
  au plan.

## Risques / points d'attention

- Volume d'images dans une note → chargement data URI à la demande, limite de
  taille.
- Transclusion `![[Note]]` : limitée à la profondeur 1 (pas de récursion) pour
  éviter les boucles.
- Coloration syntaxique : `highlight.js` alourdit le bundle (déjà ~1 Mo) ; import
  ciblé des langages courants si besoin (décision au plan).
