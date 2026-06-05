# Lot 4 — Intégration ADO (board + CRUD), provider-neutre

> Spec — 2026-06-05. Branche `feat/lot4-ado` (empilée sur `feat/group-colors`).
> Vision : [DIFAI-IDE / DIFAI-HUB](2026-06-02-difai-hub-design.md). Convention modulaire V1-D.0.

## 1. Objectif & valeur

Transformer l'IDE de superviseur de sessions Claude en **cockpit delivery** : visualiser le
backlog/sprint Azure DevOps d'un projet directement dans l'IDE, puis agir dessus (créer des
tâches, déplacer, changer les statuts, s'assigner) — **sans quitter l'outil**, à côté des
sessions Claude.

**Cœur de valeur (ordre) :**
1. **Lecture** : board d'un sprint/projet (US + tâches, avec détail).
2. **Écriture** : créer des tâches sous une US, changer le statut, s'assigner, déplacer.

**Contraintes fortes :**
- **Multi-compte** : plusieurs organisations ADO, y compris des **Azure auto-hébergés côté
  client** (Azure DevOps Server / collection on-prem).
- **Garder la notion d'onglet** et le **découpage modulaire** existant.

## 2. Décisions d'architecture (actées en brainstorming)

| Sujet | Décision |
|-------|----------|
| Tuyauterie | **API REST Azure DevOps en direct** depuis le process **main** Electron (action déterministe → API directe). Les MCP (`difai`/`azure-devops`) restent réservés aux actions « intelligentes » d'un lot ultérieur. |
| Auth | **PAT par connexion**, chiffré via **`safeStorage` Electron** (jamais dans `workspace.json`). |
| Multi-compte | Registre de **connexions globales** (Réglages) ; chaque **groupe** se lie à `{connexion, projet, équipe}`. |
| Provider | Interface neutre **`WorkItemProvider`** → `AdoProvider` aujourd'hui, `JiraProvider` plus tard. |
| Scope | **ADO d'abord** ; Jira = futur adaptateur (hors lot 4). |
| Placement UI | Le board est un **type d'item** (`kind: 'ado'`) qui **ouvre un onglet** dans un volet du split. |
| Board | **Colonnes = statuts**, **cards = User Stories** ; le détail d'une US montre ses tâches ; drag d'une US → changement d'état. |

## 3. Modèle de données

### 3.1 Connexions (global, Réglages)

```ts
interface AdoConnection {
  id: string
  label: string            // ex. "Cerba (cloud)", "Client X (on-prem)"
  baseUrl: string          // cloud: https://dev.azure.com/{org}
                           // on-prem: https://serveur/tfs/{collection}
  // PAT NON stocké ici — voir CredentialStore
}
```

- Persistées (sans PAT) dans le store persistant (`ado.json` en userData, géré par un module
  main dédié — même pattern que `workspaceStore`).
- Le **PAT** est chiffré séparément via `CredentialStore` (safeStorage), clé = `connectionId`.

### 3.2 Binding au groupe

```ts
// Group gagne :
ado?: { connectionId: string; project: string; team?: string } | null
```

- Le **sprint/itération** n'est PAS figé dans le binding : récupéré dynamiquement, défaut =
  itération courante de l'équipe.

### 3.3 Type d'item

```ts
// store.ts — Item gagne :
kind: 'claude' | 'ado'           // défaut 'claude' (migration douce)
ado?: { view: 'tree' | 'board' } // état de vue, uniquement si kind==='ado'
```

- Un item `ado` **n'est pas un pty** : pas de `tabId`/`state`/`agents`/`findOpen`/`agentsOpen`.
  Les actions session-spécifiques du store (`bindSession`, `addAgent`, `toggleFind`…) ne
  s'appliquent jamais à un item `ado`.

### 3.4 Persistance & migration

- `PersistItem` gagne `kind?: 'claude'|'ado'` et `ado?: { view }`.
- `PersistGroup` gagne `ado?: { connectionId, project, team? }`.
- `loadWorkspace` / `normalizeGroup` : item sans `kind` → `'claude'` (zéro régression sur
  l'existant). Item `ado` épinglé restauré au boot (vierge, sans appel réseau tant que l'onglet
  n'est pas affiché).

## 4. Intégration onglets

- Nouveau `TabKind = 'session' | 'find' | 'agents' | 'ado'` ; préfixe `KIND_PREFIX.ado = 'd'`
  (`s`/`f`/`a` pris). `tabRef`/`parseRef` étendus.
- `paneRefs` : pousse `tabRef('ado', i.id)` pour les items `kind==='ado'` **sans** condition
  `i.tabId` (pas de pty). Les items `claude` gardent leur condition `if (i.tabId)`.
- `addItem` : si `item.kind==='ado'`, l'onglet actif du volet pointe `tabRef('ado', item.id)`
  (sinon `tabRef('session', …)` comme aujourd'hui).
- `Workspace.tsx` / `Pane.tsx` : si l'onglet rendu est de kind `ado`, monter `<AdoBoard item />`
  au lieu du terminal/find/agents. Comme les terminaux, le board reste monté
  (`display:none/block`) au changement d'onglet pour préserver son état.

## 5. Création d'un item (UI)

- Menu `+` des onglets **et** menu `···` du groupe : sous-menu **« Session Claude » / « ADO – Azure »**.
- **« ADO – Azure »** :
  - Si le groupe n'a **pas** de binding ADO → ouvrir d'abord la modale « Configurer ADO ».
  - Sinon → créer un item `kind:'ado'`, ouvrir l'onglet board (vue par défaut = `tree`).

## 6. Cœur main — `AdoModule` + provider

### 6.1 Interface neutre

```ts
interface WorkItemProvider {
  testConnection(): Promise<{ ok: boolean; error?: string }>
  listProjects(): Promise<AdoProject[]>
  listTeams(project: string): Promise<AdoTeam[]>
  listIterations(project: string, team?: string): Promise<AdoIteration[]>
  listBoard(p: { project: string; team?: string; iterationPath?: string }): Promise<AdoBoard>
  getWorkItem(id: number): Promise<AdoWorkItem>
  getChildren(id: number): Promise<AdoWorkItem[]>
  createChild(parentId: number, p: { type: string; title: string }): Promise<AdoWorkItem>
  updateState(id: number, state: string): Promise<AdoWorkItem>
  assign(id: number, userUniqueName: string | null): Promise<AdoWorkItem>
  move(id: number, p: { iterationPath?: string; parentId?: number }): Promise<AdoWorkItem>
}
```

### 6.2 `AdoProvider`

- Implémente `WorkItemProvider` via l'**API REST Azure DevOps** (`fetch` côté main).
- Auth : header `Authorization: Basic base64(":" + PAT)`.
- Lecture board : **WIQL** (`/_apis/wit/wiql`) filtré par `IterationPath` + `WorkItemType`,
  puis batch `/_apis/wit/workitemsbatch` pour les champs.
- Écriture : `PATCH /_apis/wit/workitems/{id}` (JSON Patch) pour state/assign ; `POST
  /_apis/wit/workitems/${type}` pour create + lien parent.
- **États dynamiques** : récupérés via `/_apis/wit/workitemtypes/{type}/states` (gère
  Agile/Scrum/CMMI/Basic) → pas de statuts en dur.

### 6.3 `AdoModule` (convention modulaire)

- `createAdoModule(): HubModule` enregistré dans `src/main/index.ts`.
- Résout `connectionId → baseUrl + PAT` (via `CredentialStore`), instancie `AdoProvider`,
  branche les handlers IPC `ado:*` (invoke/handle).

### 6.4 `CredentialStore`

- `set(connectionId, pat)` / `get(connectionId)` / `delete(connectionId)`.
- Chiffrement `safeStorage.encryptString`/`decryptString`, persistance d'un blob base64 dans
  un fichier userData (`credentials.bin`). Si `safeStorage.isEncryptionAvailable()` est faux
  (rare sous Windows), bannière d'avertissement.

## 7. Contrat IPC (`shared/ipc.ts`)

Canaux **request/response** (invoke/handle) :

```
AdoConnList / AdoConnUpsert / AdoConnDelete / AdoConnTest
AdoListProjects / AdoListTeams / AdoListIterations
AdoListBoard / AdoGetWorkItem / AdoGetChildren
AdoCreateChild / AdoUpdateState / AdoAssign / AdoMove
```

Types partagés ajoutés : `AdoConnection`, `AdoProject`, `AdoTeam`, `AdoIteration`,
`AdoWorkItem`, `AdoBoard`. Méthodes correspondantes ajoutées à `HubApi` (Promise), exposées
dans le preload (les `on*` éventuels renvoient un `Unsub`).

## 8. UI Board (`AdoBoard.tsx`)

- **Header** : toggle **Tree / Board** + sélecteur de **sprint** + bouton refresh + indicateur
  de connexion.
- **Vue Tree/arborescence** : US → tâches (table hiérarchique repliable ; colonnes : id, titre,
  statut, assigné).
- **Vue Board** : colonnes par **statut** (états dynamiques du process), **une card par US** ;
  card = id, titre, assigné, badge nb de tâches enfants. **Drag d'une US entre colonnes → `updateState`**
  (optimiste + rollback si l'API échoue).
- **Détail US** : clic sur une card → panneau détail (drawer) : champs principaux + **tâches
  enfants** + actions (**créer tâche**, **assigner**, **changer statut**, **déplacer**).

> Mapping colonne↔statut (lot 4) : **une colonne par état** renvoyé par l'API, dans l'ordre
> du process. Pas de regroupement ni d'override en lot 4 (YAGNI — déplaçable plus tard).

## 9. Sous-lots (livrables testables)

| Sous-lot | Contenu | Livrable |
|----------|---------|----------|
| **4.1** | Connexions (modèle + Réglages UI) + `CredentialStore` + « Tester la connexion » + squelette `WorkItemProvider`/`AdoProvider` + 1ère requête WIQL validée. | Configurer une connexion ADO et tester l'accès. Risque auth/REST levé en premier. |
| **4.2** | `Item.kind='ado'` + intégration onglets (`TabKind 'ado'`, `paneRefs`, `Workspace`) + binding groupe + création d'item + **vue Tree lecture seule**. | Ouvrir un onglet ADO et lire l'arbo US→tâches d'un sprint. |
| **4.3** | **Vue Board lecture seule** + panneau détail US/tâches + sélecteur de sprint. | Board visuel par statut, détail au clic. |
| **4.4** | **Écriture** : créer tâche, changer statut (drag), s'assigner, déplacer. | CRUD complet. |

## 10. Gestion d'erreurs

- 401/403 → bannière « accès refusé / PAT invalide » + lien re-saisie PAT.
- Réseau/timeout → bannière + bouton retry, board en dernier état connu.
- TLS auto-hébergé (certificat interne) : géré, avec message clair si échec handshake.
- Écriture optimiste : rollback visuel si l'API renvoie une erreur.

## 11. Tests

- **Logique pure (Vitest)** : construction WIQL, mapping statut→colonne, reducers store
  (`kind`/binding, création item `ado`, encodage onglet `ado` dans `paneRefs`/`tabRef`),
  round-trip `CredentialStore` (mock `safeStorage`).
- **Provider** : REST mocké derrière `WorkItemProvider` (pas d'appel réseau réel en CI).
- **Wiring React/board (drag, drawer)** : validé au checkpoint humain (comme xterm).

## 12. Hors scope lot 4 (YAGNI)

- Jira (futur adaptateur via `WorkItemProvider`).
- Actions « intelligentes » via session Claude + skills DIFAI (start-us/finalize-us) → lot 5,
  crochet prévu mais non implémenté.
- Pipelines/CI, PR, requêtes/queries custom, édition de champs avancés, commentaires.
- Visualisation de doc / Obsidian.
