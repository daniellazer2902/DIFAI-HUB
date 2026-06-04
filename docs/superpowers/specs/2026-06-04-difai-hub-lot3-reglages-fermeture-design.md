# DIFAI-HUB — Lot 3 : Réglages globaux, fermeture propre & modales maison

**Date :** 2026-06-04
**Statut :** Design validé — prêt pour plan d'implémentation

## Contexte

État actuel :
- Réglages limités au toggle son, dans le `Header` (`Header.tsx`), persisté en `localStorage` (`sound.ts`).
- Thème en dur (sombre) dans `index.html` ; pas de système de réglages.
- Fermeture de l'app immédiate : `app.on('window-all-closed', () => app.quit())` dans `src/main/index.ts`, sans confirmation.
- Confirmations via `window.confirm` (suppression d'item occupé / de groupe dans `Sidebar.tsx`). Renommages déjà en édition inline.

## Objectif

Trois pièces, bâties sur un socle commun :
1. **Modales maison réutilisables** (socle) — remplacent `window.confirm` et servent aux deux autres pièces.
2. **Fermeture propre** — interception de la fermeture de l'app ; si une session est **occupée**, modale récapitulative + confirmation avant de tout tuer.
3. **Panneau de réglages globaux** — Son, Dossier par défaut global, toggle « Confirmer à la fermeture ».

## Décisions de cadrage (validées)

- **Déclencheur fermeture** : uniquement si **≥1 session occupée** (`isBusy` : `tabId` présent ET (`state` ∈ {active, starting} OU au moins un agent non terminé)). Sessions au repos (done/waiting) ne déclenchent rien.
- **Réglages** : Son (rapatrié du Header), Dossier par défaut global, toggle « Confirmer à la fermeture ». **Pas** de mode clair, **pas** de couleur d'accent, **pas** de raccourcis.
- **Icône réglages** : SVG engrenage ajoutée à `icons.tsx` (`SettingsIcon`), **pas d'emoji**. Remplace la cloche du Header (le son est déplacé dans le panneau).
- Persistance des réglages en `localStorage` côté renderer (cohérent avec l'existant) — pas de persistance disque côté main.

## Architecture

### 1. Socle modale

- **`src/renderer/src/components/Modal.tsx`** — shell présentationnel : overlay plein écran + boîte centrée. Props : `title`, `children` (corps), `footer` (actions), `onClose`. Ferme sur `Échap` et clic backdrop. Aucune logique métier.
- **`src/renderer/src/confirm.ts`** — store zustand `useConfirm` : `{ spec: ConfirmSpec | null }` + `confirm(opts): Promise<boolean>` (pousse une spec, résout à la réponse) et `resolveConfirm(result)`.
  `ConfirmSpec = { title: string; message?: string; items?: string[]; confirmLabel?: string; cancelLabel?: string; danger?: boolean; resolve: (v: boolean) => void }`.
- **`src/renderer/src/components/ConfirmHost.tsx`** — monté dans `App` ; rend la spec courante via `<Modal>` (titre, message, liste `items` optionnelle, boutons Confirmer/Annuler). Confirmer → `resolveConfirm(true)` ; Annuler/Échap/backdrop → `resolveConfirm(false)`.

### 2. Réglages globaux

- **`src/renderer/src/settings.ts`** — helpers `localStorage` (comme `sound.ts`) : `readConfirmOnClose()`/`writeConfirmOnClose(v)` (défaut `true`), `readGlobalDefaultCwd()`/`writeGlobalDefaultCwd(v)` (défaut `null`).
- **`store.ts`** — ajoute `confirmOnClose: boolean` et `globalDefaultCwd: string | null` à `HubState` + setters `setConfirmOnClose`, `setGlobalDefaultCwd`. (`soundEnabled` existe déjà.) Initialisés au boot depuis `settings.ts`.
- **`src/renderer/src/components/Settings.tsx`** — modale de réglages via `<Modal>` :
  - Son (notifications) : toggle → `setSoundEnabled` + `writeSoundEnabled`.
  - Confirmer à la fermeture : toggle → `setConfirmOnClose` + `writeConfirmOnClose`.
  - Dossier par défaut global : affichage du chemin courant + bouton *Choisir…* (`window.hub.pickFolder()`) → `setGlobalDefaultCwd` + `writeGlobalDefaultCwd` ; bouton *Réinitialiser* (remet `null`).
- **`Header.tsx`** — remplace `BellIcon`/toggle son par un bouton `SettingsIcon` qui ouvre la modale Réglages (état `settingsOpen` local au Header).
- **`icons.tsx`** — ajoute `SettingsIcon` (engrenage SVG).

### 3. Fermeture propre (IPC)

- **`shared/ipc.ts`** — canaux `CloseRequest` (`'app:close-request'`, main→renderer) et `CloseConfirm` (`'app:close-confirm'`, renderer→main) ; `HubApi` : `onCloseRequest(cb: () => void): Unsub`, `confirmClose(): void`.
- **`preload/index.ts`** — expose `onCloseRequest` (sur `CloseRequest`) et `confirmClose` (envoie `CloseConfirm`).
- **`PtyManager`** — ajoute `killAll(): void` (tue toutes les ptys de la map interne et la vide).
- **`main/index.ts`** — variable `quitting = false`. Sur `win.on('close', e => { if (!quitting) { e.preventDefault(); win.webContents.send(IPC.CloseRequest) } })`. Handler `ipcMain.on(IPC.CloseConfirm, () => { quitting = true; ptyManager.killAll(); win.destroy() })`.
- **`App.tsx`** — `useEffect` branchant `onCloseRequest` :
  - si `!confirmOnClose` **ou** aucune session occupée → `confirmClose()` immédiat ;
  - sinon → `await confirm({ title: 'Quitter DIFAI-HUB ?', message: 'Des sessions sont en cours.', items: <noms des sessions occupées>, confirmLabel: 'Quitter', danger: true })` ; si `true` → `confirmClose()`, sinon ne rien faire.

### 4. Dossier par défaut global

- À la création d'une session sans `defaultCwd` de groupe, utiliser `useHub.getState().globalDefaultCwd ?? (await window.hub.defaultCwd())`.
- Concerne : `Pane.tsx` (`onDefault`), `Sidebar.tsx` (`addItemTo`), `App.tsx` (boot, premier item).

### 5. Remplacement `window.confirm`

- `Sidebar.tsx` : suppression d'item occupé et suppression de groupe → `await confirm({ ..., danger: true })` au lieu de `window.confirm`.

## Impact composants (récapitulatif)

- Nouveaux : `Modal.tsx`, `ConfirmHost.tsx`, `Settings.tsx`, `confirm.ts`, `settings.ts`, util `isBusy`/`hasBusySession`.
- Modifiés : `store.ts` (2 champs + setters), `Header.tsx` (⚙️ + ouverture réglages), `Sidebar.tsx` (confirm async + cwd global), `Pane.tsx` (cwd global), `App.tsx` (boot settings + onCloseRequest + ConfirmHost monté), `icons.tsx` (`SettingsIcon`), `shared/ipc.ts`, `preload/index.ts`, `main/index.ts`, `index.html` (CSS modales/réglages).

## Découpage en unités

- **`isBusy(item)` / `hasBusySession(groups)`** — pures, dans `util.ts` (ou `settings.ts`) ; testables ; réutilisées par Sidebar et la décision de fermeture.
- **`Modal`** — purement présentationnel.
- **`confirm` store** — logique d'attente/résolution isolée, testable sans DOM.
- **`Settings`** — composant feuille, dépend de store + settings.ts.

## Tests

`tests/store.test.ts` : `setConfirmOnClose`, `setGlobalDefaultCwd`.
`tests/confirm.test.ts` (nouveau) : `confirm()` ouvre une spec ; `resolveConfirm(true/false)` résout la promesse ; une seule spec à la fois.
`tests/util.test.ts` (étendu) : `isBusy` (occupé via state vs via agent non terminé vs au repos) ; `hasBusySession`.
`tests/PtyManager.test.ts` (étendu) : `killAll()` tue toutes les ptys créées et vide la map (`has()` faux ensuite).
Build `vite` + `tsc --noEmit` OK.

## Critères d'acceptation

1. Bouton ⚙️ (SVG) dans le Header ouvre une modale Réglages contenant Son, Confirmer-à-la-fermeture, Dossier par défaut global ; les valeurs persistent au reboot.
2. Le son fonctionne toujours (réglage déplacé, plus de cloche dans le Header).
3. Fermer l'app avec une session **occupée** (et confirm activé) affiche une modale listant les sessions concernées ; *Quitter* tue tout et ferme, *Annuler* garde l'app ouverte.
4. Aucune session occupée **ou** réglage désactivé → fermeture immédiate sans modale.
5. Les suppressions de la sidebar passent par la modale maison (plus de `window.confirm`).
6. Une nouvelle session sans dossier de groupe utilise le dossier par défaut global s'il est défini.
7. Tests verts, build + `tsc` OK.
