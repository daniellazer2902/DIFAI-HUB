# DIFAI-HUB — Design Lot 2 : Sidebar de groupes + items Claude + persistance

**Date :** 2026-06-03
**Statut :** validé (brainstorming) — prêt pour plan d'implémentation

## Contexte

Après le Lot 1 (multi-onglets Claude + état + son + recherche), DIFAI-HUB pilote plusieurs sessions Claude **dans une barre d'onglets plate**, sans organisation ni persistance. Le `cwd` du premier onglet est en dur dans `App.tsx`. Le store Zustand est `tabs[]` + `activeTabId`. Architecture modulaire (contrat IPC `src/shared/ipc.ts`, modules main, store + composants React).

## Objectif du Lot 2

Ajouter une **sidebar de groupes** (projets/sprint) contenant des **items Claude Code**, avec **persistance** de l'arborescence sur disque et **synchronisation** sidebar ↔ onglets. DIFAI-HUB devient un cockpit organisé : on range ses sessions par projet, on les retrouve au redémarrage. **Seuls les items Claude Code** sont gérés (les types azure/jira/obsidian/validations = Lot 4).

## Vision (rappel — découpage en lots)

Lot 1 (fait) multi-onglets · **Lot 2 (CE DOC)** sidebar+groupes+persistance · Lot 3 réglages & fermeture propre · Lot 4+ types non-Claude.

## Modèle conceptuel

### Item Claude Code
Un **item** représente une session Claude, lié **1:1 à un onglet** quand sa session est vivante. Il porte une **config persistante** (nom, dossier, épinglé) et un **état runtime** (session vivante ou éteinte).

- **Épinglé (📌)** : persiste sur disque. Fermer son onglet ne le supprime pas → il reste dans la sidebar, **éteint** (○). Reclic dessus (ou affichage de son groupe) → **relance une session Claude vierge** dans son dossier. Survit au redémarrage de l'app (relancé dans son dossier, sans message).
- **Non épinglé** : éphémère. Fermer son onglet (✕) le **supprime**. Non conservé au redémarrage.

### Groupe
Conteneur nommé (projet/sprint) : `{ nom, replié, items[] }`. Repliable. Contient des items (ordonnés). Persisté sur disque (toujours, même sans item épinglé).

### États d'un item (pastille dans la sidebar)
- Session vivante : `starting` (bleu pulse) · `active` (orange clignotant) · `waiting` (vert) · `done` (gris) — comme Lot 1.
- **Éteint (○)** : item épinglé sans session vivante (onglet fermé, ou avant relance au boot). Clic → relance.

## Comportements

### Barre d'onglets (filtrée par groupe actif)
- La barre affiche **uniquement les onglets (sessions vivantes) du groupe actif**.
- Les sessions des autres groupes **continuent de tourner** en arrière-plan ; leur état reste visible **dans la sidebar** (pastille par item).
- Drag & drop des onglets pour les réordonner → **met à jour l'ordre des items** du groupe dans la sidebar (ordre synchronisé).

### Création
- **＋ barre d'onglets** : ouvre une nouvelle session (dossier par défaut ou sélecteur natif, comme Lot 1) → crée un item **dans le groupe actif**, non épinglé par défaut, et l'active.
- **＋ sur la ligne d'un groupe** : idem mais l'item est créé **dans ce groupe** (le rend actif).

### Sélection / navigation
- **Clic sur un groupe** (son nom) → il devient le **groupe actif** ; la barre affiche ses onglets. Le chevron ▾/▸ replie/déplie l'arbre (zone de clic distincte du nom).
- **Clic sur un item** → bascule le groupe actif sur son groupe (si différent) et **active son onglet** ; si l'item est éteint (épinglé), **relance** sa session dans son dossier.

### Fermeture / suppression
- **✕ sur un onglet** : tue la session. Si l'item est **non épinglé** → l'item est supprimé. Si **épinglé** → l'item reste (éteint ○).
- **Menu ··· item** : **Renommer · Épingler/Désépingler · Supprimer**. *Supprimer* retire l'item définitivement (et de la persistance), qu'il soit épinglé ou non.
- **Confirmation** demandée **seulement si la session est active** (au moins un agent en cours / `state` ∈ {starting, active}), avant de tuer/supprimer.
- **Menu ··· groupe** : **Renommer · Supprimer** (supprimer un groupe = supprimer ses items, avec confirmation si une session active s'y trouve).

### Mise en évidence (dégradé sur 3 niveaux dans la sidebar)
1. Items des **autres groupes** : fond de base.
2. Items du **groupe actif** : fond légèrement plus clair.
3. **Item actif** (onglet courant) : fond le plus clair + **bordure gauche** orange.
(Le survol ajoute un cran de clarté.)

### Démarrage de l'app
- Charger l'arborescence depuis le disque. Restaurer groupes + items épinglés (éteints).
- **Relancer une session Claude** dans le dossier de chaque item épinglé (sans message). Restaurer le groupe actif.
- **1er lancement** (aucun fichier) : créer un groupe « Sessions » + 1 item non épinglé dans le dossier par défaut (`process.cwd()`), actif.

## Architecture

### Persistance (process principal)
Module main `workspaceStore` : lit/écrit `workspace.json` dans `app.getPath('userData')`.

```jsonc
{
  "activeGroupId": "g1",
  "groups": [
    {
      "id": "g1",
      "name": "Messika",
      "collapsed": false,
      "items": [
        { "id": "i1", "name": "api", "cwd": "C:\\...\\api" },
        { "id": "i2", "name": "front", "cwd": "C:\\...\\front" }
      ]
    }
  ]
}
```
Seuls les **groupes** et les **items épinglés** sont écrits (un item non épinglé n'apparaît jamais dans le fichier). La logique pure de (dé)sérialisation/normalisation est testée.

Canaux IPC ajoutés (`src/shared/ipc.ts`) :
- `LoadWorkspace` (invoke → `WorkspaceTree`) : lit le fichier (ou renvoie l'arbre par défaut si absent).
- `SaveWorkspace` (send `WorkspaceTree`) : écrit le fichier (débounce côté renderer).

Le renderer (store Zustand) est la **source de vérité runtime** ; il pousse l'arbre persistable au main à chaque modification structurelle (ajout/suppression/renommage/épingle/réordonnancement/groupe), de façon debouncée.

### Store Zustand (refactor `tabs[]` → groupes/items)
```ts
interface Item {
  id: string            // identifiant stable de l'item (uuid renderer)
  name: string
  cwd: string
  pinned: boolean
  tabId: string | null  // id de la session vivante (PtyManager/IPC) ; null si éteint
  // état runtime de la session (présent si tabId != null) :
  state: SessionState
  agents: AgentView[]
  openAgentId: string | null
  railCollapsed: boolean
  searchOpen: boolean
  searchQuery: string
}
interface Group { id: string; name: string; collapsed: boolean; items: Item[] }

interface HubState {
  groups: Group[]
  activeGroupId: string | null
  activeItemId: string | null    // item/onglet actif (dans le groupe actif)
  soundEnabled: boolean
  consoleWidth: number
  // actions : addGroup, renameGroup, removeGroup, toggleGroupCollapsed, setActiveGroup,
  //           addItem(groupId, item), removeItem(itemId), renameItem, togglePin,
  //           setActiveItem, moveItem(itemId, toIndex[, toGroupId]),
  //           bindSession(itemId, tabId), clearSession(itemId),  // vivant <-> éteint
  //           setItemState(itemId,...), addAgent(itemId,...), appendLines, removeAgent,
  //           setAgentDone, openAgent, toggleRail, setSearch/toggleSearch/setSearchQuery,
  //           setSoundEnabled, setConsoleWidth, loadWorkspace(tree), toPersistable(), reset
}
```
Les events IPC arrivent par **tabId** → le store retrouve l'item via `item.tabId` (helper `findByTabId`). Les actions « par onglet » du Lot 1 deviennent « par item ». L'onglet/session est l'item dont `tabId != null`.

### Composants (renderer)
- **`Sidebar.tsx`** (nouveau) : en-tête DIFAI-IDE, liste des groupes (chevron, nom, ＋, ···), items (icône terminal, nom, pastille `StateDot`, 📌, ···), bouton « ＋ Nouveau groupe », menus contextuels, dégradé de surbrillance, drag & drop des onglets répercuté ici.
- **`TabBar.tsx`** (adapté) : n'affiche que les items vivants du **groupe actif** ; drag & drop pour réordonner.
- **`Workspace.tsx`** / `Terminal` / `Console` / `Rail` / `SearchPanel` : adaptés pour fonctionner par **item** (clé = `item.id`, session = `item.tabId`).
- **`App.tsx`** : layout `Sidebar | (Header + TabBar + Workspace)` ; au boot, charge le workspace, relance les sessions ; câblage IPC global routé par `tabId` → item.
- **Icônes** : SVG inline `TerminalIcon` (plein) et `PinIcon` (contour), d'après Font Awesome `terminal` (solid) et `map-pin`.

### Modules main
- Nouveau `workspaceModule` (ou intégré à `sessionModule`) : handlers `LoadWorkspace`/`SaveWorkspace` délégant à `workspaceStore` (fonction pure de lecture/écriture + I/O fichier). `AppContext` gagne l'accès au chemin `userData`.

## Tests
- **`workspaceStore`** (pur) : sérialisation/désérialisation, exclusion des items non épinglés, arbre par défaut si fichier absent, normalisation (ids/ordre).
- **Store Zustand** (étendu) : addGroup/removeGroup/rename/collapse, addItem/removeItem (épinglé vs non à la fermeture), togglePin, setActiveGroup/Item, moveItem (réordonnancement intra/inter-groupe), bindSession/clearSession, `toPersistable()` (ne garde que groupes + items épinglés), routage par tabId.
- **Logique de confirmation** : fonction pure « faut-il confirmer ? » (session active).
- Le wiring (Sidebar drag&drop, relance boot, persistance fichier) validé au **checkpoint humain**.

## Hors scope (lots suivants)
- Types d'items non-Claude (azure/jira/obsidian/validations) + leurs configs — **Lot 4**.
- Reprise des conversations via `claude --resume` (on relance des sessions vierges ; l'utilisateur fait `/resume` manuellement).
- Fermeture propre globale de l'app avec modale récapitulative — **Lot 3** (le Lot 2 confirme seulement à la fermeture/suppression d'un item à session active).
- Réglages globaux (thème, etc.) — **Lot 3**.

## Risques / points d'attention
- **Refactor du store** `tabs[]` → groupes/items : impacte tous les composants Lot 1 (clé `item.id`, session `item.tabId`). À faire proprement, tests d'abord.
- **Relance de N sessions au boot** : N process `claude` lancés simultanément ; acceptable mais à surveiller (l'utilisateur l'a demandé). Pas de message auto-envoyé.
- **Persistance debouncée** : éviter d'écrire le fichier à chaque frappe ; sauver sur changements structurels (debounce ~300 ms).
- **Drag & drop** : garder onglets et sidebar synchronisés (une seule source d'ordre = `group.items`).
- **Item éteint vs supprimé** : bien distinguer `clearSession` (épinglé : tabId→null, état éteint) de `removeItem` (retrait complet).
