# DIFAI-HUB — Design Lot 1 : Multi-onglets Claude + état + son

**Date :** 2026-06-03
**Statut :** validé (brainstorming) — prêt pour plan d'implémentation

## Contexte

DIFAI-HUB est un cockpit Electron (electron-vite + React + Zustand + node-pty) de supervision des sessions et agents Claude Code. État actuel (après V1-D.0) : **mono-session** — un terminal Claude interactif, un rail d'agents + console live, sur une architecture modulaire (contrat IPC typé `src/shared/ipc.ts`, modules main `sessionModule`/`agentsModule`, store Zustand, composants React). Le `cwd` est en dur dans `App.tsx` et `SessionState` (starting/active/waiting/done) est déjà poussé jusqu'au store mais non affiché.

## Vision cible (rappel — hors périmètre de ce lot sauf Lot 1)

IDE multi-projets : **sidebar** de groupes (projets/sprint) contenant des **items typés** (claude code, azure, jira, obsidian, validation dev-test/ux-ui) ; chaque item s'ouvre comme **onglet** ; les onglets sont les enfants du groupe sélectionné (clic groupe → ouvre ses items visibles ; clic enfant ↔ active l'onglet) ; le **rail d'agents vit dans chaque fenêtre Claude**.

Découpage validé en lots livrables :
- **Lot 1 (CE DOC)** — multi-onglets Claude + état + son.
- **Lot 2** — sidebar + groupes (items Claude) + persistance + config projet (renomme/masque/supprime, dossier projet).
- **Lot 3** — réglages globaux & fermeture propre.
- **Lot 4+** — types non-Claude (azure, jira, obsidian, validations), un par un.

## Périmètre du Lot 1

**Objectif :** passer de mono-session à **plusieurs sessions Claude en parallèle**, présentées par une barre d'onglets, avec indicateur d'état par onglet, deux notifications sonores, et rail repliable par onglet. **Pas encore de sidebar, de groupes, ni de persistance** (Lots 2+).

### Fonctionnalités

1. **Onglets de sessions** : N sessions Claude vivantes simultanément. L'onglet actif affiche sa fenêtre (terminal + console + rail) ; les onglets inactifs **restent montés et vivants** (buffer terminal conservé, agents continuent d'arriver en arrière-plan).
2. **Navigation** : clic sur un onglet → l'active.
3. **Nouvel onglet (＋)** : ouvre un petit menu à deux entrées :
   - *Dossier par défaut* → nouvelle session dans le dossier par défaut.
   - *Choisir un dossier…* → sélecteur de dossier natif (Windows) ; session dans le dossier choisi.
   Le **titre de l'onglet** = nom (basename) du dossier. Plusieurs onglets peuvent pointer le même dossier.
4. **Fermeture (✕)** : termine la session (kill du pty) et retire l'onglet. Si c'était l'onglet actif, un onglet voisin devient actif. (Au Lot 1, sans sidebar, fermer = terminer ; la conservation d'item viendra au Lot 2.)
5. **Indicateur d'état par onglet** (depuis `SessionState`) :
   - `starting` → pastille bleue, animation *pulse*, label « Démarrage… »
   - `active` → pastille verte, label « Active »
   - `waiting` → pastille orange, animation *clignotement*, label « Waiting » (la session attend une saisie)
   - `done` → pastille grise (cercle vide), label « Terminée »
   - Badge `· N agents` (nombre d'agents de la session).
6. **Sons** (deux tonalités synthétiques distinctes, générées via Web Audio, sans fichier d'asset) :
   - au passage en `waiting` (la session attend l'utilisateur),
   - au passage en `done` (session terminée).
   Joués uniquement si le **toggle son** est activé. Toggle dans l'en-tête, **persisté** (localStorage).
7. **En-tête** : titre « DIFAI-IDE » + toggle son (🔔/🔕).
8. **Rail repliable** : bouton « ‹ Rails » dans la fenêtre Claude ; replie/déplie le rail de l'onglet courant (état mémorisé **par onglet**).

### Parcours utilisateur

- *Ouvrir une 2ᵉ session* : clic ＋ → « Choisir un dossier… » → sélection → nouvel onglet actif sur ce dossier.
- *Suivre plusieurs sessions* : pendant qu'une session travaille (active) dans un onglet inactif, son rail se peuple en arrière-plan ; quand elle passe en `waiting`, sa pastille clignote et (si son activé) un bip retentit → l'utilisateur clique l'onglet pour répondre.
- *Fermer* : ✕ sur l'onglet → session terminée, onglet retiré.

## Architecture

### Modèle d'état (store Zustand — `src/renderer/src/store.ts`)

Remplace l'état mono-session par une liste d'onglets :

```ts
interface TabState {
  id: string            // tabId renvoyé par window.hub.newSession
  title: string         // basename(cwd)
  cwd: string
  state: SessionState   // 'starting' | 'active' | 'waiting' | 'done'
  agents: AgentView[]
  openAgentId: string | null
  railCollapsed: boolean
}

interface HubState {
  tabs: TabState[]            // ordre = ordre d'affichage des onglets
  activeTabId: string | null
  soundEnabled: boolean       // init depuis localStorage

  addTab(tab: TabState): void
  removeTab(id: string): void          // retire ; réassigne activeTabId au voisin si besoin
  setActiveTab(id: string): void
  setTabState(id: string, state: SessionState): void
  addAgent(id: string, agent: AgentView): void
  appendLines(id: string, agentId: string, lines: ConsoleLine[]): void
  removeAgent(id: string, agentId: string): void
  openAgent(id: string, agentId: string | null): void
  toggleRail(id: string): void
  setSoundEnabled(v: boolean): void    // écrit aussi localStorage
  reset(): void
}
```

`soundEnabled` : lu de `localStorage` à l'init (`difai.soundEnabled`, défaut `true`), réécrit dans `setSoundEnabled`. Les actions par onglet opèrent sur l'entrée `tabs[]` du `id` donné (mise à jour immuable).

### Logique pure de notification (`src/renderer/src/sound.ts`)

```ts
// Quel son jouer pour une transition d'état (null = aucun).
export function soundForTransition(prev: SessionState, next: SessionState): 'waiting' | 'done' | null

// Joue une tonalité synthétique (Web Audio). 'waiting' et 'done' = timbres distincts.
export function playSound(kind: 'waiting' | 'done'): void
```

`soundForTransition` : `prev !== 'waiting' && next === 'waiting'` → `'waiting'` ; `prev !== 'done' && next === 'done'` → `'done'` ; sinon `null`. Pure, testée. `playSound` : `AudioContext` + oscillateur (waiting = 2 bips ~880 Hz courts ; done = bip descendant ~440→220 Hz) ; non testé unitairement (effet audio), isolé dans son module.

### Composants React (`src/renderer/src/components/`)

- **`Header.tsx`** : « DIFAI-IDE » + bouton son (lit `soundEnabled`, appelle `setSoundEnabled`).
- **`TabBar.tsx`** : `tabs.map` → un onglet { pastille d'état, titre, badge `· N agents`, `✕` }. Clic onglet = `setActiveTab`. `✕` = `window.hub.killSession(id)` puis `removeTab(id)`. Bouton `＋` avec menu (Dossier par défaut / Choisir un dossier…).
- **`StateDot.tsx`** : pastille colorée selon `state` (classes CSS `pulse`/`blink` pour starting/waiting).
- **`Workspace.tsx`** : rend, pour **chaque** onglet, un conteneur `Terminal + Console + Rail` ; seul celui de `activeTabId` est visible (`display:block`), les autres `display:none` (sessions gardées vivantes, buffers conservés). Le bouton « ‹/› Rails » bascule `railCollapsed` de l'onglet ; `Rail`/`Console` masqués si replié.
- **`Terminal.tsx`** (existant) : inchangé sur le principe (filtre `onData` par `tabId`, cleanup via `Unsub`/dispose). Reçoit le `tabId` de son onglet.
- **`Rail.tsx` / `Console.tsx`** (existants) : adaptés pour lire l'onglet par `tabId` au lieu de l'état global unique.
- **`App.tsx`** : structure `Header` + `TabBar` + `Workspace`. Au boot, crée un **premier onglet** dans le dossier par défaut. Câble les events IPC (`onSessionState`, `onAgentAdded`, `onAgentLines`) vers le store **par `tabId`** ; à chaque `onSessionState`, calcule `soundForTransition(ancien, nouveau)` et joue le son si `soundEnabled`.

### Canaux IPC ajoutés (`src/shared/ipc.ts` + `sessionModule`)

- `IPC.PickFolder` (`'dialog:pick-folder'`) — renderer→main **invoke** → `Promise<string | null>`. Côté main : `dialog.showOpenDialog({ properties: ['openDirectory'] })`, renvoie le chemin choisi ou `null`.
- `IPC.DefaultCwd` (`'session:default-cwd'`) — renderer→main **invoke** → `Promise<string>`. Renvoie le dossier par défaut des nouvelles sessions.

Ajouts à `HubApi` : `pickFolder(): Promise<string | null>` ; `defaultCwd(): Promise<string>`. Les handlers sont enregistrés dans **`sessionModule`** (cohérent avec la création de session). `AppContext` gagne `defaultCwd: string`, fourni par `index.ts` au boot (dossier par défaut). `newSession(cwd)` existe déjà ; le renderer l'appelle avec le dossier (défaut ou choisi) puis crée l'onglet avec `title = basename(cwd)`.

### Flux « nouvel onglet »

1. Clic `＋` → menu. 2. Choix : `cwd = await window.hub.defaultCwd()` **ou** `cwd = await window.hub.pickFolder()` (si `null`, annulé). 3. `tabId = await window.hub.newSession(cwd)`. 4. `addTab({ id: tabId, title: basename(cwd), cwd, state: 'starting', agents: [], openAgentId: null, railCollapsed: false })` + `setActiveTab(tabId)`.

## Tests

- **Store multi-onglets** (`tests/store.test.ts`, étendu) : addTab, removeTab (+ réassignation `activeTabId`), setActiveTab, setTabState par onglet, addAgent/appendLines/removeAgent ciblant le bon onglet, toggleRail, setSoundEnabled (+ écriture localStorage mockée), isolation entre onglets.
- **`soundForTransition`** (`tests/sound.test.ts`) : waiting déclenché à l'entrée seulement, done idem, pas de double déclenchement, transitions neutres → `null`.
- **`sessionModule`** (`tests/sessionModule.test.ts`, étendu) : handler `PickFolder` (dialog mocké → renvoie chemin / null), handler `DefaultCwd` (renvoie `ctx.defaultCwd`).
- Le wiring React (TabBar/Workspace/Terminal) est validé au **checkpoint humain** (`npm run dev`), comme les lots précédents.

## Hors scope (Lots suivants)

- Sidebar, groupes, menu « ... » (renommer/masquer/configurer/supprimer), synchro sidebar↔onglets — **Lot 2**.
- Persistance de l'arborescence/onglets, config projet (dossier mémorisé par item) — **Lot 2**.
- Réglages globaux (thème), fermeture propre avec modale si agents actifs — **Lot 3**.
- Types non-Claude (azure/jira/obsidian/validations) — **Lot 4+**.

## Risques / points d'attention

- **Terminaux cachés** : un `xterm` en `display:none` mesure une taille nulle ; au ré-affichage, le `ResizeObserver`/`fit()` doit recalculer (déjà en place). À vérifier au checkpoint (pas de rendu sur 1 colonne au retour sur un onglet).
- **Web Audio** : `AudioContext` peut nécessiter une interaction utilisateur préalable (politique navigateur). Dans Electron c'est généralement permis ; à vérifier au checkpoint, sinon créer l'`AudioContext` au premier geste.
- **Fermeture** : retirer l'onglet du store démonte son `Terminal` (cleanup) ; s'assurer que `killSession` est appelé avant/au retrait pour ne pas laisser de pty orphelin (le `onExit` côté main nettoie déjà le watcher).
