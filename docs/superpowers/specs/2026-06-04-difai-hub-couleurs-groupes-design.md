# DIFAI-IDE — Couleurs de groupe

**Date :** 2026-06-04
**Statut :** Design validé — prêt pour plan d'implémentation

## Contexte

Les groupes de la sidebar (`Sidebar.tsx`) n'ont pas de couleur. États actuels via classes :
`.group.active-group > .group-head` (fond `#202020`), `.item.active-group-item` (fond `#202020`),
`.item.active-item` (fond `#2a2a2a` + liseré `inset 3px #c80`), `.item:hover` (fond `#202020`).
Modèle `Group` (`store.ts`) : `{ id, name, collapsed, defaultCwd, items, leftActiveTab, rightActiveTab }`.
Persistance : `store.toPersistable`/`loadWorkspace` ↔ `ipc.ts` `PersistGroup` ↔ `workspaceStore.normGroup`
(ce dernier **reconstruit** l'objet et supprime les champs inconnus).

## Objectif

Permettre d'attribuer une couleur à un groupe, via une entrée **« Attribuer une couleur »** dans le menu
`···` du groupe, ouvrant une modale (8 couleurs prédéfinies + roue des couleurs native). Une **variante
plus foncée** est calculée automatiquement pour le survol/sélection.

## Décisions de cadrage (validées)

- **Mapping des variantes** (groupe ACTIF) : head = couleur principale ; items au repos = principale ;
  item survolé OU sélectionné = variante foncée.
- **Groupes inactifs** : seul le `group-head` est coloré (principale) ; les items restent neutres (défaut).
- **Contraste** : couleur du texte calculée automatiquement (`textOn`) → texte blanc ou sombre selon la
  luminance, pour rester lisible en dark mode quelle que soit la couleur (presets ou roue).
- Couleur **optionnelle** : `null` = rendu neutre actuel (fallback).
- Palette choisie (ton moyen, dark-mode friendly) : `#b5413b` rouge, `#c5651f` orange, `#b8902a` or,
  `#3a9d5d` vert, `#1f8f86` teal, `#3a7bd0` bleu, `#8455c4` violet, `#6b7280` gris.

## Architecture

### Modèle & persistance
- `store.ts` : `Group` gagne `color: string | null`. Action `setGroupColor(groupId: string, color: string | null)`.
- `store.toPersistable` : inclut `color` par groupe. `loadWorkspace` : restaure `color` (défaut `null`).
- `ipc.ts` : `PersistGroup` gagne `color?: string | null`.
- `workspaceStore.ts` : `normGroup` **doit recopier** `color` (valider : string ou null/undefined) — sinon
  perdu au reboot.

### Helpers — nouveau `src/renderer/src/color.ts` (purs, testables)
- `darken(hex: string, ratio = 0.22): string` — mélange vers le noir ; renvoie un hex `#rrggbb`.
- `textOn(hex: string): string` — `'#1e1e1e'` si la couleur est claire (luminance relative > ~0.55),
  sinon `'#ffffff'`.
- `PALETTE: string[]` — les 8 couleurs ci-dessus.

### Modale — nouveau `src/renderer/src/components/GroupColorModal.tsx`
- Utilise le `Modal` du lot 3. Props : `{ current: string | null; onPick: (color: string | null) => void; onClose: () => void }`.
- Contenu : grille des **8 pastilles** (clic = sélection), un **`<input type="color">`** (roue native),
  un **aperçu** live (mini head + 2 lignes item montrant principale / foncée avec `textOn`), et un
  bouton **« Retirer la couleur »** (`onPick(null)`).
- Footer : *Annuler* (`onClose`) / *Appliquer* (`onPick(pendingColor)` puis `onClose`). État `pending`
  initialisé à `current`.

### Rendu sidebar — `Sidebar.tsx` + CSS (variables CSS)
- Entrée de menu groupe : `<div onClick={() => openColor(g)}>… Attribuer une couleur</div>` (après *Dossier par défaut…*). État local `colorFor: groupId | null` pour monter `GroupColorModal`.
- Sur le `.group` : quand `g.color`, poser les variables CSS inline :
  `--gc` = `g.color`, `--gcd` = `darken(g.color)`, `--gt` = `textOn(g.color)`, `--gtd` = `textOn(darken(g.color))`
  (objet `style` casté `as React.CSSProperties`).
- CSS (`index.html`) utilisant les variables avec fallback aux valeurs actuelles :
  - `.group-head { background: var(--gc, transparent); color: var(--gt, #9aa); }` → tous les heads colorés.
  - `.group.active-group > .group-head { background: var(--gc, #202020); color: var(--gt, #cfe); }`
  - `.group.active-group .item.active-group-item { background: var(--gc, #202020); color: var(--gt, inherit); }`
  - `.group.active-group .item:hover, .group.active-group .item.active-item { background: var(--gcd, #2a2a2a); color: var(--gtd, inherit); }`
  - Liseré `.active-item` conservé en fallback ; quand une couleur est posée, la variante foncée suffit
    à distinguer la sélection.
  - Groupes inactifs : aucune règle item ne référence `--gc` hors `.active-group` → items neutres.

## Tests

- `tests/color.test.ts` (nouveau) : `darken` assombrit et reste un hex valide `#rrggbb` ; `textOn` renvoie
  texte sombre sur couleur claire (ex. `#b8902a` ou `#ffffff`) et blanc sur couleur foncée (ex. `#3a7bd0`, `#000000`).
- `tests/store.test.ts` : `setGroupColor` (set + remise à `null`) ; round-trip `toPersistable` conserve `color`.
- `tests/workspaceStore.test.ts` : `parseWorkspace(serializeWorkspace(tree))` conserve `color` d'un groupe.
- Build `vite` + `tsc --noEmit` OK.

## Critères d'acceptation

1. Le menu `···` d'un groupe propose « Attribuer une couleur » → modale avec 8 pastilles + roue + aperçu + « Retirer la couleur ».
2. Choisir une couleur colore le `group-head` ; au reboot la couleur est restaurée.
3. Groupe actif coloré : items au repos en couleur principale ; survol/sélection en variante foncée.
4. Groupes inactifs colorés : seul le head est coloré, items neutres.
5. Texte lisible quelle que soit la couleur (blanc/sombre auto).
6. « Retirer la couleur » remet le rendu neutre.
7. Tests verts, build + tsc OK.
