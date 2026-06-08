# DIFAI-IDE — ADO Taskboard + vue détail riche (lot 4.3-bis / 4.4-read)

Date : 2026-06-08
Statut : design validé, prêt pour plan d'implémentation

## Contexte

Le type d'onglet `ado` (board Azure DevOps, lecture seule) existe déjà :
- `AdoBoard.tsx` propose deux vues commutables : `tree` (arborescence en lignes) et
  `board` (cartes US groupées par **état de l'US**, une carte par US).
- `AdoStoryDetail.tsx` : drawer latéral lecture seule (id, état, titre, type, assigné,
  liste des tâches enfants).
- IPC `AdoWorkItem` : `id, type, title, state, assignedTo, parentId, childCount`.
- `AdoProvider.listBoard` récupère les états du type *User Story* (colonnes), les US du
  sprint et leurs tâches enfants (`tasksByParent`).

L'utilisateur veut :
1. **Conserver** la vue cartes-par-état actuelle pour de futurs types `validation UX` /
   `validation devtest` (non encore existants) — ne pas la détruire, la rendre réutilisable.
2. Pour le type `ado`, la vue **Board** doit devenir le **Sprint Taskboard** d'Azure DevOps :
   une swimlane par US, colonnes = états des **tâches**, carte US épinglée à gauche, cartes-
   tâches placées dans la colonne de leur état.
3. Une **vue détail riche** (titre, description, critères d'acceptation, story points,
   priorité, assigné, commentaires, images) ouverte **en plein onglet** avec une flèche retour.

## Découpage

Deux phases livrables indépendamment, un seul doc de design.

- **Phase A — Taskboard** : rendu seulement, réutilise les données déjà chargées + une
  requête « états du type Task ». Aucune nouvelle écriture.
- **Phase B — Vue détail riche** : nouveau contrat IPC `adoGetDetail`, inline des images
  côté main, sanitisation HTML maison, overlay plein onglet.

---

## Phase A — Taskboard

### Données / IPC

`AdoBoard` (shared/ipc.ts) gagne un champ :

```ts
export interface AdoBoard {
  states: string[]                 // états User Story — conservés pour StateBoardView
  taskStates: string[]             // NOUVEAU — états du type Task, ordre des colonnes du taskboard
  stories: AdoWorkItem[]
  tasksByParent: Record<number, AdoWorkItem[]>
}
```

`AdoProvider.listBoard` ajoute un appel `statesUrl(baseUrl, project, 'Task')` (même endpoint
que pour User Story) et renvoie `taskStates` triés par `order`. Une requête HTTP de plus,
acceptable (board = quelques dizaines d'US).

### Renderer

- **Extraction** : la fonction `BoardView` actuelle d'`AdoBoard.tsx` (cartes US groupées par
  `s.state`) est déplacée **telle quelle** dans un nouveau fichier `StateBoardView.tsx`
  (export `StateBoardView`). Aucune modification de comportement. Elle restera inutilisée
  jusqu'à l'arrivée des types `validation UX` / `validation devtest`, mais préservée.
- **Nouveau** `TaskBoardView.tsx` :
  - Grille : 1ʳᵉ colonne figée « User Story » + une colonne par `taskStates`.
  - Chaque ligne = une swimlane d'US :
    - cellule gauche = carte US (titre, `#id`, état, assigné, nb tâches) + caret
      collapse/expand de la swimlane (replié = on masque les cellules de tâches, comme Azure).
    - pour chaque colonne d'état : les tâches enfants `t.state === colonne`, rendues en cartes.
  - Helper pur **`tasksByState(tasks: AdoWorkItem[], taskStates: string[]): Record<string, AdoWorkItem[]>`**
    (nouveau `src/renderer/src/adoBoard.ts`, à côté de `adoFind.ts`) — testable unitairement. Les tâches dont l'état n'est
    dans aucune colonne sont ignorées du rendu (et comptées/loggées en dev).
  - Recherche : le surlignage `Hl` et le filtre `filter`/`q` existants restent câblés
    (mêmes `splitHighlight` / `itemMatches` / `storyVisible`). En mode filtre, une swimlane
    sans correspondance (ni US ni tâche) est masquée ; sinon seules ses tâches correspondantes
    s'affichent (cohérent avec `TreeView`).
- `AdoBoard.tsx` : `ado.view === 'board'` rend désormais `TaskBoardView` au lieu de l'ancienne
  `BoardView`. Le toggle reste **Arborescence / Board**. `onOpen={setDetailId}` câblé sur les
  cartes US **et** tâches (préparé pour Phase B ; en Phase A le clic ouvre le drawer existant).

### CSS

Nouvelles classes dans `index.html` : `.ado-taskboard` (grille), `.ado-swimlane`,
`.ado-swim-head` (colonne US figée à gauche, `position: sticky; left: 0`), `.ado-tb-col`,
`.ado-tb-cell`, `.ado-task-card`. Scroll horizontal si beaucoup de colonnes. Réutilise les
tokens couleur existants (`.ado-card`, `.ado-id`, `.ado-assignee`…).

### Tests (Phase A)

- `tasksByState` : répartition correcte par état, tâches hors-colonnes exclues, états vides
  → tableau vide.
- Round-trip IPC : `taskStates` présent dans `AdoBoard` (mise à jour de `adoModule.test.ts`
  ou test provider avec `fetch` mocké renvoyant les états Task).

---

## Phase B — Vue détail riche

### Données / IPC

Nouveau type + canal :

```ts
export interface AdoComment { author: string; date: string; html: string }
export interface AdoWorkItemDetail {
  id: number
  type: string
  title: string
  state: string
  assignedTo: string | null
  storyPoints: number | null
  priority: number | null
  descriptionHtml: string          // images déjà inlinées en data: URI, non sanitisé (sanitisation renderer)
  acceptanceCriteriaHtml: string   // idem
  comments: AdoComment[]           // html idem
}
// HubApi
adoGetDetail(connId: string, id: number): Promise<AdoResponse<AdoWorkItemDetail>>
```

Canal `IPC.AdoGetDetail`, handler dans `adoModule` (via `wrap`), méthode
`WorkItemProvider.getDetail(id)` implémentée dans `AdoProvider`.

### Champs ADO lus

- `System.Description` → `descriptionHtml`
- `Microsoft.VSTS.Common.AcceptanceCriteria` → `acceptanceCriteriaHtml`
- `Microsoft.VSTS.Scheduling.StoryPoints` → `storyPoints`
- `Microsoft.VSTS.Common.Priority` → `priority`
- `System.AssignedTo.displayName` → `assignedTo`
- Commentaires : `GET {base}/_apis/wit/workItems/{id}/comments?api-version=7.1-preview.3`
  → `comments[]` (`text` HTML, `createdBy.displayName`, `createdDate`).

### Cycle de vie des images (inline via PAT)

```
1. Clic carte → renderer: adoGetDetail(connId, id)
2. Main provider.getDetail: fetch work item (fields) + comments
3. Main scanne chaque HTML (description, AC, chaque commentaire) pour <img src="…/_apis/wit/attachments/{guid}…">
   en ne retenant que les URLs du host de la connexion (this.conn.baseUrl)
4. Pour chaque image: fetch authentifié (PAT) → binaire + content-type → base64 → data:{mime};base64,…
5. Main réécrit le src par le data URI dans la chaîne HTML
6. Main renvoie le HTML (images embarquées) au renderer
7. Renderer sanitise (allowlist, autorise data:) puis rend en dangerouslySetInnerHTML
8. Images en mémoire uniquement (string data URI dans le state + DOM) ; GC à la fermeture. Rien sur disque.
```

Garde-fous :
- **Le PAT ne quitte jamais le main** : le renderer ne reçoit que des `data:` URIs.
- **Taille** : si une image dépasse un seuil (≈ 3 Mo) ou échoue au téléchargement, on laisse
  l'URL d'origine remplacée par un lien texte « 🖼 pièce jointe » (pas d'inline géant).
- Pas de cache disque ; ré-ouverture = re-fetch (cache mémoire éventuel plus tard).

Helper main pur et testable : **`inlineImages(html, fetchAttachment): Promise<string>`**
où `fetchAttachment(url) => {mime, base64} | null`. Tests avec fetch mocké.

### Sanitisation HTML (renderer, maison, zéro dépendance)

Fonction `sanitizeHtml(html: string): string` (nouveau `src/renderer/src/sanitize.ts`) :
- parse via `DOMParser` natif.
- **Allowlist de balises** : `p, br, b, strong, i, em, u, s, ul, ol, li, a, h1, h2, h3, h4,
  pre, code, blockquote, table, thead, tbody, tr, td, th, img, div, span, hr`.
- Toute autre balise : dépliée (on garde le texte) ou supprimée (`script`, `style`, `iframe`,
  `object`, `embed`, `svg` → supprimées entièrement).
- **Attributs** : supprime tous les `on*` ; `a[href]` autorisé seulement en `http(s):`/`mailto:`
  (sinon retiré) + `target=_blank rel=noopener` ; `img[src]` autorisé seulement en `data:` ou
  `https:` ; tout le reste des attributs retiré (sauf `colspan`/`rowspan` sur cellules).
- Retourne l'`innerHTML` nettoyé.

Note menace : HTML issu de l'instance ADO interne (rédigé par l'équipe) → modèle de menace
faible, allowlist conservatrice suffisante. Bascule possible vers DOMPurify si la source
devient non fiable.

### Renderer — overlay plein onglet

- `AdoStoryDetail.tsx` réécrit en **overlay plein onglet** (remplit `.ado-content`, remplace
  le board derrière) plutôt qu'un drawer latéral :
  - en-tête : bouton `← Retour` (revient au board, `onClose`), `#id`, type, état.
  - titre `h1`.
  - bloc méta façon Azure : pastille initiales + nom de l'assigné, story points, priorité.
  - sections : **Description**, **Critères d'acceptation** (HTML sanitisé via
    `dangerouslySetInnerHTML`), **Commentaires** (liste : auteur + date + HTML sanitisé).
  - état de chargement (spinner) le temps du `adoGetDetail` ; gestion d'erreur (message +
    bouton réessayer).
- `AdoBoard.tsx` : quand `detailId !== null`, on rend l'overlay détail **à la place** du
  contenu board (pas en plus). `Échap` et `←` ferment.
- Le détail s'ouvre pour une US **comme** pour une tâche (l'API `getDetail` est générique sur
  l'id) ; les cartes tâches du taskboard deviennent cliquables.

### CSS (Phase B)

`.ado-detail` (overlay), `.ado-detail-head`, `.ado-back` (flèche), `.ado-detail-title`,
`.ado-detail-meta`, `.ado-assignee-chip` (initiales colorées + nom), `.ado-detail-section`,
`.ado-html` (rendu HTML : styles tableaux/images responsives `max-width:100%`),
`.ado-comment` (`.ado-comment-head` auteur+date, `.ado-comment-body`).

### Tests (Phase B)

- `inlineImages` : remplace les `<img>` du host ADO par data URI ; ignore les URLs externes ;
  garde un lien si > seuil / échec ; HTML sans image inchangé.
- `sanitizeHtml` : `<script>` supprimé, `onclick` retiré, `javascript:` neutralisé, `data:`
  conservé sur `img`, balises hors allowlist nettoyées, texte préservé.
- `AdoProvider.getDetail` (fetch mocké) : mapping des champs + commentaires.
- Round-trip IPC `AdoWorkItemDetail`.

---

## Non-objectifs

- Pas d'écriture ADO (édition d'US/tâches, drag de cartes entre colonnes, ajout de
  commentaires) — reste pour le lot 4.4-write.
- Pas d'avatars images des assignés (pastille initiales seulement ; avatar = amélioration future).
- Pas de cache disque des détails/images.
- Les types `validation UX` / `validation devtest` ne sont pas créés ici : on se contente de
  **préserver** `StateBoardView` pour eux.

## Risques / points d'attention

- Les colonnes du taskboard dépendent des états du type *Task* configurés dans le process Cerba
  (custom : IN PR, IN TEST…). Si l'API renvoie un ordre inattendu, on s'appuie sur `order`.
- HTML ADO parfois lourd / imbriqué : le sanitizer doit être robuste au DOM mal formé
  (`DOMParser` tolère). Tests sur cas tordus.
- Payload IPC potentiellement gros si beaucoup d'images → garde-fou taille en place.
