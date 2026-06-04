# DIFAI-HUB — Lot 2 : Split-screen 2 volets & volet droit à onglets

**Date :** 2026-06-04
**Branche :** `feat/lot2-sidebar`
**Statut :** Design validé — prêt pour plan d'implémentation

## Contexte

Aujourd'hui, dans `Workspace.tsx`, chaque item (= onglet = session Claude Code) affiche une
rangée flex `term-wrap` :

```
[ term-area (terminal + rails-toggle) ][ splitter ][ console-host (Console | SearchPanel) ][ rail (liste agents) ]
```

- `console-host` n'apparaît que si `searchOpen || openAgentId` (Console **ou** recherche, mutuellement exclusifs).
- `rail` est une colonne d'agents toujours présente (sauf `railCollapsed`) : c'est ce 3ᵉ bloc qui crée la sensation de « 3 écrans ».
- La `TabBar` (onglets du groupe actif) est au-dessus de `#workspace`, pleine largeur.

## Objectif

Transformer le panneau de droite en un **vrai second volet de split**, façon « split editor » de VS Code :
deux bandes d'onglets **au même niveau**, séparées par le `splitter` pleine hauteur. Le volet droit
héberge plusieurs **types d'onglets** : Console (agents), Ctrl+F (recherche) et 0..N sessions Claude Code
côte à côte. Plus de 3ᵉ écran : la colonne `rail` toujours-là est supprimée et repliée dans l'onglet Console.

Généralisable plus tard à d'autres types de fenêtres (la notion d'« onglet droit » est typée).

## Décisions de cadrage (validées)

1. **Mini tab-strip** dans le volet droit, **au même niveau** que les onglets de gauche (pas un bandeau interne plus bas).
2. **Contextuel à l'onglet gauche actif** : le volet droit appartient à l'item gauche actif et change quand on switche d'onglet gauche. On réutilise le state par-item existant.
3. **Agents → 1 onglet Console** : la liste d'agents (l'actuel `rail`) passe DANS l'onglet Console ; clic sur un agent → son flux s'affiche. La colonne `rail` toujours-là est supprimée.
4. **Console fermée jusqu'au clic** : un agent qui spawne n'ouvre aucun volet. Point d'entrée : le badge « · N agents » de l'onglet gauche devient cliquable et ouvre/active l'onglet Console.

## Architecture cible

### Layout

```
#main (colonne)
└─ #panes (rangée flex, pleine hauteur)
   ├─ .pane-left  (flex:1, colonne)
   │   ├─ TabBar           ← onglets du groupe (sessions) — quasi inchangé
   │   └─ #workspace-left  ← terminal de l'item actif (tous les items live montés, display block/none)
   ├─ .splitter (pleine hauteur ; drag = largeur du volet droit, réutilise consoleWidth)
   └─ .pane-right (largeur = consoleWidth ; rendu SEULEMENT si l'item actif a ≥1 onglet droit)
       ├─ .right-tabstrip  ← [Console][Ctrl+F][CC#2]… au même niveau que la TabBar
       └─ #workspace-right ← contenu de l'onglet droit actif
```

- La colonne `rail` (toujours-là) et le bouton `rails-toggle` sont **supprimés**.
- Le `splitter` migre de `term-wrap` vers l'inter-volets (`#panes`), pleine hauteur, traversant la bande d'onglets.

### Types d'onglets du volet droit (contextuels à l'item gauche actif)

- **Console** : présent ssi `consoleTabOpen`. Contenu = liste d'agents (ancien `rail`, petite colonne) + flux de l'agent sélectionné (`openAgentId`). Ouvert via clic sur le badge « · N agents » de l'onglet gauche ; fermable.
- **Ctrl+F (Recherche)** : présent ssi `searchOpen`. Contenu = `SearchPanel` actuel (indexé par `itemId`).
- **Session CC** (0..N) : un terminal Claude Code. Bouton `＋` dans la bande droite → même menu que la TabBar (*Dossier par défaut* / *Choisir un dossier…*). C'est le split « 2 onglets CC côte à côte ».

Console et Recherche **coexistent** désormais (plus d'exclusivité mutuelle).

## Modèle de state (`Item`, dans `store.ts`)

On réutilise au maximum l'existant et on remplace le couple mutuellement exclusif par un jeu d'onglets.

Champs **conservés** : `agents`, `openAgentId` (= agent sélectionné *dans* l'onglet Console), `searchQuery`, `searchOpen`.

Champs **ajoutés** :
- `consoleTabOpen: boolean` — visibilité de l'onglet Console (false par défaut ; passé à true par le clic sur le badge agents).
- `sessionTabs: SessionTab[]` — sessions CC du volet droit, où `SessionTab = { id: string; tabId: string | null; name: string; cwd: string; state: SessionState }`.
- `activeRightTabId: string | null` — `'console' | 'search' | <sessionTab.id> | null`.

Champs **supprimés** : `railCollapsed`.

Le volet droit est **visible** ssi `consoleTabOpen || searchOpen || sessionTabs.length > 0`.

### Actions du store (ajouts / modifs)

- `openConsole(itemId)` / `closeConsole(itemId)` — set `consoleTabOpen`, ajuste `activeRightTabId`.
- `toggleSearch(itemId)` — inchangé dans l'esprit (toggle `searchOpen`) mais **ne ferme plus** la console ; met `activeRightTabId='search'` à l'ouverture.
- `openAgent(itemId, agentId)` — sélectionne l'agent dans l'onglet Console (n'affecte plus `searchOpen`).
- `addSessionTab(itemId, sessionTab)` / `removeSessionTab(itemId, sessionTabId)` — gestion des sessions CC droites (+ `killSession` du pty associé à la fermeture).
- `setActiveRightTab(itemId, rightTabId)` — bascule l'onglet droit actif.
- Helper de visibilité (dérivé) : `rightPaneVisible(item)`.

La fermeture du dernier onglet droit visible remet `activeRightTabId=null` et masque le volet.

## Comportements

- **Ctrl+F** : toggle l'onglet *Recherche* et le rend actif ; re-Ctrl+F le ferme (si actif, bascule sur un autre onglet droit existant, sinon `null`).
- **Clic « · N agents »** (onglet gauche) : `openConsole(item)` + `activeRightTabId='console'`.
- **Agent spawné** : ajouté à `item.agents` en silence (aucun volet ne s'ouvre — comportement actuel conservé).
- **Changer d'item gauche** : le volet droit reflète le nouvel item actif. Les terminaux des sessions CC droites restent **montés** en arrière-plan (display block/none) pour préserver pty + état xterm.
- **Fermer un onglet droit** : ✕ par onglet. Fermer une session CC → `killSession(tabId)`.
- **Resize** : `consoleWidth` + `splitter` existants, `clampConsoleWidth` / `writeConsoleWidth` réutilisés.

## Impact composants

- `store.ts` — modèle de state ci-dessus + actions.
- `App.tsx` — `makeItem` met à jour les nouveaux champs ; le câblage IPC route les états des sessions CC droites (via `tabId`) ; `Ctrl+F` inchangé d'appel.
- `Workspace.tsx` — refonte : split `#panes` (gauche/droite), `splitter` inter-volets, montage de tous les terminaux (gauche + sessions CC droites).
- **`RightPane.tsx`** (nouveau) — la bande d'onglets droite + le corps (Console | SearchPanel | Terminal de session CC) + bouton `＋`.
- `Console.tsx` — intègre la liste d'agents (ancien `rail`) en colonne interne ; `openAgent` pour sélectionner.
- `Rail.tsx` — supprimé (son contenu migre dans `Console.tsx`) ou vidé.
- `TabBar.tsx` — le badge « · N agents » devient cliquable (`openConsole`).
- `index.html` (CSS inline) — styles `#panes`, `.pane-left`, `.pane-right`, `.right-tabstrip`, splitter pleine hauteur ; retrait `.rail` / `.rails-toggle` ; la Console interne récupère une mini-colonne liste d'agents.
- `shared/ipc.ts` — aucun nouveau contrat IPC (réutilise `newSession` / `killSession` / `pickFolder` / `defaultCwd`).

## Hors-périmètre v1 (YAGNI)

- Sessions CC du volet droit **non persistées** (éphémères, comme agents/recherche). Au reboot, seuls les items épinglés de la sidebar reviennent. `toPersistable` inchangé.
- Pas de split vertical, ni de >2 volets, ni de drag d'un onglet gauche ↔ droite.
- Une session CC droite est un **terminal simple** : pas de console/recherche imbriquées à l'intérieur (pour ça → en faire un onglet gauche).

## Tests

`tests/store.test.ts` (étendu) :
- ouverture / fermeture de l'onglet Console (`consoleTabOpen`) ;
- Console et Recherche **coexistent** (exclusivité supprimée) ;
- `toggleSearch` n'affecte plus la console ;
- `addSessionTab` / `removeSessionTab` ; `activeRightTabId` après fermetures ;
- `rightPaneVisible` selon les combinaisons ;
- `openAgent` n'affecte plus `searchOpen`.

Build : `vite build` OK + lint OK.

## Critères d'acceptation

1. Deux bandes d'onglets côte à côte au même niveau, séparées par un `splitter` pleine hauteur redimensionnable.
2. Le volet droit n'apparaît que si l'item actif a ≥1 onglet droit ; il suit l'onglet gauche actif.
3. Console + Ctrl+F peuvent être ouverts simultanément (onglets distincts) ; clic sur « · N agents » ouvre la Console ; un agent qui spawne n'ouvre rien.
4. On peut ajouter 0..N sessions Claude Code dans le volet droit via `＋`, redimensionner, fermer (tue le pty).
5. Switcher d'onglet gauche préserve les terminaux montés (pas de respawn).
6. La colonne `rail` toujours-là et `rails-toggle` ont disparu.
7. Tests store verts, build + lint OK.
