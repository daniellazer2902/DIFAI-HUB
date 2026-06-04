# DIFAI-HUB — Lot 2 : Split-screen 2 volets indépendants

**Date :** 2026-06-04
**Branche :** `feat/lot2-sidebar`
**Statut :** Design validé — prêt pour plan d'implémentation

## Contexte

Aujourd'hui, dans `Workspace.tsx`, chaque item (= session Claude Code) affiche une rangée flex
`term-wrap` :

```
[ term-area (terminal + rails-toggle) ][ splitter ][ console-host (Console | SearchPanel) ][ rail (liste agents) ]
```

- `console-host` n'apparaît que si `searchOpen || openAgentId` (Console **ou** recherche, mutuellement exclusifs, par item).
- `rail` est une colonne d'agents toujours présente (sauf `railCollapsed`) → sensation de « 3 écrans ».
- La `TabBar` (onglets du groupe actif) est au-dessus de `#workspace`, pleine largeur.

## Objectif

Passer à un **vrai split-screen à deux volets indépendants**, façon « split editor » de VS Code :
deux bandes d'onglets **au même niveau**, séparées par un `splitter` pleine hauteur. Les sessions du
groupe se répartissent entre volet gauche (split 1) et volet droit (split 2), répartition **persistée
par groupe**. Les outils **Recherche (Ctrl+F)** et **Agents** deviennent des **onglets auxiliaires**
hébergés dans le volet droit. La colonne `rail` toujours-là disparaît (repliée dans l'onglet Agents).

## Décisions de cadrage (validées)

1. **Deux volets indépendants** : chaque volet a sa propre bande d'onglets et son propre onglet actif. Switcher dans un volet ne modifie pas l'autre. *(Remplace la décision antérieure « volet droit contextuel à l'onglet gauche actif ».)*
2. **Les sessions portent `split: 1 | 2`**, persisté **par groupe** (uniquement pour les items épinglés). Exemple : groupe A B C → gauche `A C`, droite `B`. Au reboot, répartition restaurée pour les items épinglés.
3. **Find & Agents = onglets auxiliaires, toujours dans le volet droit (split 2)**, nommés `<item> - Find` / `<item> - Agents`, rattachés à un item, **éphémères** (non persistés), **absents de la sidebar**.
4. **Agents : 1 onglet par item, rail intégré dedans** (l'ancien `rail` toujours-là est supprimé). Le rail reste visible dans l'onglet Agents.
5. **Sidebar** : toutes les sessions (y compris split=2) apparaissent dans la sidebar ; seuls les onglets auxiliaires Find/Agents n'y figurent pas.

## Architecture cible

### Layout

```
#main (colonne)
└─ #panes (rangée flex, pleine hauteur)
   ├─ .pane.left   (flex:1, colonne)        ← rendu si volet gauche non vide
   │   ├─ .pane-tabstrip   ← onglets sessions split=1 (＋ = nouvelle session split=1)
   │   └─ .pane-body       ← terminal de l'onglet gauche actif
   ├─ .splitter (pleine hauteur ; drag = largeur du volet droit, réutilise consoleWidth)
   └─ .pane.right  (largeur = consoleWidth, colonne) ← rendu si volet droit non vide
       ├─ .pane-tabstrip   ← onglets sessions split=2 + auxiliaires Find/Agents (＋ = nouvelle session split=2)
       └─ .pane-body       ← contenu de l'onglet droit actif (terminal | SearchPanel | Console+rail)
```

- Un volet n'est rendu que s'il a ≥1 onglet. Si un seul volet a du contenu → il occupe toute la largeur (plein écran). Le split réapparaît dès que les deux volets ont ≥1 onglet.
- La colonne `rail` (toujours-là) et le bouton `rails-toggle` sont **supprimés**.
- Le `splitter` migre de `term-wrap` vers l'inter-volets (`#panes`), pleine hauteur, traversant la bande d'onglets.

### Types d'onglets

- **Session** : un terminal Claude Code. Présent à gauche si `split===1`, à droite si `split===2`. Apparaît dans la sidebar.
- **Find** (auxiliaire, volet droit) : `<item> - Find`, contenu = `SearchPanel` (indexé par `ownerItemId`). Créé/fermé par Ctrl+F.
- **Agents** (auxiliaire, volet droit) : `<item> - Agents`, contenu = liste d'agents (ancien `rail`, colonne toujours visible) + flux de l'agent sélectionné (`openAgentId`). Ouvert via le badge agents de l'onglet session ; fermé **uniquement** via la ✕.

## Modèle de state

### Par `Item` (session) — `store.ts`

Champs **conservés** : `id`, `name`, `cwd`, `pinned`, `tabId`, `state`, `agents`, `openAgentId` (agent sélectionné dans son onglet Agents), `searchQuery` (dans son onglet Find).

Champs **ajoutés** :
- `split: 1 | 2` — volet d'appartenance (défaut 1 ; persisté pour les items épinglés).
- `findOpen: boolean` — un onglet `<item> - Find` existe (éphémère).
- `agentsOpen: boolean` — un onglet `<item> - Agents` existe (éphémère).

Champs **supprimés** : `railCollapsed`, `searchOpen` (remplacé par `findOpen`).

### Par `Group` (état de disposition)

- `leftActiveTab: TabRef | null` et `rightActiveTab: TabRef | null`.

`TabRef` identifie un onglet : `{ kind:'session'|'find'|'agents', itemId }` (encodage chaîne au choix du plan, ex. `s:<id>` / `f:<id>` / `a:<id>`).

### Global (store)

- `focusedPane: 'left' | 'right'` — dernier volet manipulé ; détermine l'item courant pour Ctrl+F.
- `consoleWidth` (largeur volet droit) + `splitter` : conservés.

### Dérivés (pour le groupe actif)

- `leftTabs` = items du groupe où `split===1`.
- `rightTabs` = items où `split===2` **+** onglets `find` des items où `findOpen` **+** onglets `agents` des items où `agentsOpen`.
- `rightPaneVisible = rightTabs.length > 0` ; `leftPaneVisible = leftTabs.length > 0`.

## Comportements

### Ctrl+F (toggle de l'onglet Find)
- `currentItem` = propriétaire de l'onglet actif du `focusedPane`.
- si `currentItem.findOpen === false` → `findOpen=true`, `focusedPane='right'`, `rightActiveTab=find(currentItem)` (ouvre le split si le volet droit était vide).
- sinon → `findOpen=false` ; si `rightActiveTab` pointait dessus, basculer sur un autre onglet droit existant, sinon `null`. Si le volet droit se vide → retour plein écran.

### Badge « agents » (sur un onglet session)
- `ownerItem.agentsOpen=true`, `focusedPane='right'`, `rightActiveTab=agents(owner)`. **Idempotent** (re-clic = focus, pas de toggle). Fermeture **uniquement** via la ✕ de l'onglet.

### Déplacer une session entre volets
- **Drag** d'un onglet session par-dessus le `splitter` vers l'autre volet → bascule son `split` (1↔2). Persisté si l'item est épinglé.
- **`＋`** dans la bande d'un volet → crée une nouvelle session directement dans ce volet (`split` correspondant), via le menu dossier existant (*Dossier par défaut* / *Choisir un dossier…*). La session apparaît aussi dans la sidebar.

### Fermeture
- **Onglet auxiliaire (✕)** : reset `findOpen`/`agentsOpen` de l'item ; corrige l'onglet actif ; si le volet se vide → plein écran.
- **Onglet session (✕)** : comportement existant (`killSession` du pty ; `removeItem` si non épinglé, sinon `clearSession`). On reset aussi `findOpen`/`agentsOpen` de cette session (ses auxiliaires disparaissent).

### Changement de groupe
- L'affichage reflète la répartition `split` du groupe actif et ses `leftActiveTab`/`rightActiveTab`.

## Persistance

- `toPersistable` : pour chaque groupe, chaque item **épinglé** sauvegarde aussi `split`. Find/Agents jamais persistés (`findOpen`/`agentsOpen` repartent à `false`).
- `loadWorkspace` : restaure `split` par item (défaut 1).
- Boot (`App.tsx`) : relance des items épinglés (logique existante) ; leur `split` restauré détermine le volet. **Un onglet droit non épinglé ne revient pas** → si plus rien à droite, plein écran à gauche.
- `shared/ipc.ts` : le type d'item de `WorkspaceTree` gagne `split?: 1 | 2`. `workspaceStore.ts` (main) persiste l'arbre tel quel.

## Impact composants

- `store.ts` — nouveaux champs + actions : `setSplit`/`moveItemToPane`, `toggleFind` (renommage de `toggleSearch`), `closeFind`, `openAgentsTab`/`closeAgentsTab`, `setActiveTab(pane, ref)`, `setFocusedPane` ; sélecteurs `leftTabs`/`rightTabs`.
- `App.tsx` — `makeItem` ajoute `split`/`findOpen`/`agentsOpen` ; handler Ctrl+F → `toggleFind` sur l'item courant (via `focusedPane`) ; boot inchangé (split restauré).
- `Workspace.tsx` — refonte : `#panes` (gauche/droite), `splitter` inter-volets pleine hauteur ; montage de **tous** les terminaux (gauche + droite) en `display block/none` ; rendu des contenus auxiliaires.
- **`Pane.tsx`** (nouveau) — un volet : sa `pane-tabstrip` (onglets session/find/agents, ✕, drag, `＋`) + son `pane-body`.
- `TabBar.tsx` — devient (ou est remplacé par) la `pane-tabstrip` du volet gauche ; le badge « · N agents » devient **cliquable** → `openAgentsTab`.
- `Console.tsx` — intègre la liste d'agents (ancien `rail`) en colonne toujours visible ; `openAgent` pour sélectionner.
- `Rail.tsx` — **supprimé** (contenu migré dans `Console.tsx`).
- `SearchPanel.tsx` — rendu comme contenu de l'onglet Find (`itemId = ownerItemId`), quasi inchangé.
- `index.html` (CSS inline) — `#panes`, `.pane`, `.pane-tabstrip`, splitter pleine hauteur ; retrait `.rail`/`.rails-toggle` ; layout interne de l'onglet Agents (colonne rail + console).
- `shared/ipc.ts` — `split?: 1 | 2` sur l'item de `WorkspaceTree`.
- Pas de nouveau contrat IPC (réutilise `newSession` / `killSession` / `pickFolder` / `defaultCwd`).

## Hors-périmètre v1 (YAGNI)

- Find/Agents non persistés.
- Pas de split vertical, ni de >2 volets.
- Une session droite reste un terminal ; ses propres Find/Agents s'ouvrent dans le **même** volet droit (auxiliaires toujours à droite).
- Pas d'indicateur sidebar dédié au split (les sessions split=2 apparaissent normalement).

## Tests (`tests/store.test.ts`, étendu)

- `setSplit` / `moveItemToPane` : bascule 1↔2 ; `leftTabs`/`rightTabs` dérivés corrects.
- `toggleFind` : crée puis retire l'onglet Find ; corrige `rightActiveTab` ; collapse du volet droit quand il se vide.
- Find et Agents **coexistent** (plus d'exclusivité) ; `toggleFind` n'affecte pas Agents et vice-versa.
- `openAgentsTab` idempotent ; fermeture via `closeAgentsTab` ; `openAgent` n'affecte pas `findOpen`.
- Fermer une session reset ses `findOpen`/`agentsOpen`.
- Persistance round-trip : `split` conservé pour les items épinglés, ignoré sinon.

Build : `vite build` OK + lint OK.

## Critères d'acceptation

1. Deux bandes d'onglets au même niveau, séparées par un `splitter` pleine hauteur redimensionnable ; chaque volet a son onglet actif indépendant.
2. Les sessions se répartissent gauche/droite via drag ou `＋` ; la répartition des items **épinglés** est restaurée au reboot (par groupe).
3. Ctrl+F bascule l'onglet `<item courant> - Find` à droite (ouvre/ferme le split au besoin) ; le badge « · N agents » ouvre `<item> - Agents` à droite (rail + console), fermable seulement via ✕ ; Find et Agents coexistent.
4. Scénario extrême validé : gauche `A B` → Ctrl+F sur A puis sur B = `A B | A-Find, B-Find` ; Ctrl+F sur B retire `B-Find` (reste splitté) ; clic `A-Find` + Ctrl+F retire `A-Find` → `B` plein écran.
5. Switcher d'onglet (dans un volet ou de groupe) préserve les terminaux montés (pas de respawn).
6. La colonne `rail` toujours-là et `rails-toggle` ont disparu ; le rail vit dans l'onglet Agents.
7. Tests store verts, build + lint OK.
