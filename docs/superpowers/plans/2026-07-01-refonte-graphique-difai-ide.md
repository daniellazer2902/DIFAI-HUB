# Refonte graphique DIFAI-IDE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre visuellement DIFAI-IDE dans le style dark-neutre « Neutral + couleurs de groupe » (école Linear/Cursor), sans perdre aucune fonctionnalité.

**Architecture:** Tout le style vit dans un unique `<style>` global dans `src/renderer/index.html` (classes `.tab`, `.item`, `.ado-*`, `.md-view`, `.modal`…). La refonte = introduire un socle de **tokens CSS** (`:root`) puis réécrire les règles pour les consommer, **en conservant tous les noms de classes** (donc aucune modif de logique React). L'infra couleurs de groupe existe déjà (`--gc/--gcd/--gt/--gtd` posés inline par `Sidebar.tsx` via `color.ts`). Quelques retouches composants marginales (police globale, propagation des vars de groupe aux panes, retrait d'un liseré). Le terminal xterm reste **strictement inchangé**.

**Tech Stack:** Electron + React 19 + Zustand + Vite (electron-vite), CSS global inline dans `index.html`, Vitest, TypeScript.

**Source visuelle de vérité :** le compagnon `scratchpad/design-companion.html` (Artifact v4) et son bloc de tokens. Valeurs de couleur détaillées dans `scratchpad/design-system-analysis.md`.

## Global Constraints

- **Zéro perte de fonctionnalité** : aucun composant/handler React modifié dans sa logique ; on ne change que le CSS et, à la marge, des attributs de style/props. Tous les noms de classes existants sont conservés.
- **Terminal xterm INCHANGÉ** : ne pas thémer le terminal (aucune modif de `Terminal.tsx`, `.term-screen` reste neutre). Décision utilisateur.
- **Tests toujours verts** : `npx vitest run` (301 tests) passe après chaque phase. `npx tsc --noEmit` clean. `npm run build` OK.
- **Vérification visuelle** : `npm run dev` et parcours de la zone retouchée à chaque phase (le CSS n'est pas testable unitairement).
- **Police** : UI en `system-ui` sans (var `--sans`), code/terminal/identifiants en mono (var `--mono`). Bundling de Geist = hors-scope v1 (option ultérieure). CSP `default-src 'self'` interdit les fonts CDN.
- **Couleurs** : Neutral (fonds `#0a0a0a`/`#171717`/`#262626`, contraste par alphas de blanc). Accent global neutre (`--accent` proche-blanc). Éléments liés à un groupe (item actif, onglets du groupe) = **couleur du groupe** via `--gc/--gcd`. Pastilles d'état = sémantique conservée.
- **Bans design** : pas de liseré latéral coloré > 1px (retirer `box-shadow: inset 3px 0 0 #c80` de `.item.active-item`), pas de gradient text, overlays discrets.
- **Copie FR** inchangée. **Accessibilité** : focus-visible visible, contraste texte ≥ 4.5:1, `prefers-reduced-motion` respecté (blink/pulse déjà présents).
- **Commits** : un commit par phase, sans mention d'auteur IA (règle projet), messages UTF-8.

---

## File Structure

- `src/renderer/index.html` — **cœur de la refonte** : bloc `:root` de tokens + réécriture de toutes les règles CSS. Modifié dans presque toutes les phases.
- `src/renderer/src/components/Workspace.tsx` (ou `Pane.tsx`) — retouche mineure : propager les vars `--gc/--gcd/--gt/--gtd` du groupe actif sur le conteneur de panes pour que les onglets/accents héritent la couleur du groupe (Phase 3). À lire avant édition.
- `src/renderer/src/components/StateDot.tsx` — vérifier/aligner les couleurs de pastilles avec les tokens sémantiques (Phase 4, optionnel : les valeurs actuelles conviennent).
- `src/renderer/index.html` (font-family global) — Phase 1.
- **Non touchés** : `Terminal.tsx`, toute la logique store/main, les tests.

---

## Task 1 — Socle de tokens & coquille de base

**Files:**
- Modify: `src/renderer/index.html` (bloc `<style>`, en-tête : `:root`, `html/body/#app`, `#app-root`, `#body`, `#main`, `#header`, scrollbars, police globale)

**Interfaces (produit pour les phases suivantes) :** le bloc `:root` de variables ci-dessous, consommé par toutes les règles des phases 2→8.

- [ ] **Step 1** — Insérer en tête du `<style>` le bloc de tokens :

```css
:root{
  /* Fonds */
  --bg:#0a0a0a; --surface:#171717; --surface-2:#262626; --elevated:#1c1c1c;
  /* Texte (alphas de blanc) */
  --text:#ffffff; --text-2:rgba(255,255,255,.74); --text-3:rgba(255,255,255,.56); --text-muted:rgba(255,255,255,.42);
  /* Bordures / surfaces translucides */
  --border:rgba(255,255,255,.08); --border-2:rgba(255,255,255,.12); --border-hover:rgba(255,255,255,.18);
  --card:rgba(255,255,255,.02); --card-hover:rgba(255,255,255,.045); --ghost-hover:rgba(255,255,255,.06); --fill-active:rgba(255,255,255,.07);
  /* Accent neutre global (éléments NON liés à un groupe) */
  --accent:#f3f3f3; --accent-ink:#0a0a0a; --accent-soft:rgba(255,255,255,.08); --ring:rgba(255,255,255,.34);
  /* Sémantique (états, badges, callouts) */
  --ok:#5fe0a8; --info:#4f93ff; --warn:#ffb43b; --err:#ff5c5c; --purple:#b47bff;
  /* Pastilles d'état (vocabulaire app, conservé) */
  --st-starting:#9ccfff; --st-active:#ffb43b; --st-waiting:#5fe0a8; --st-attention:#ff5c5c; --st-done:#7a7a7a;
  /* Rayons */
  --r-sm:6px; --r:8px; --r-btn:10px; --r-card:12px;
  /* Polices */
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI Variable Text","Segoe UI",Roboto,sans-serif;
  --mono:ui-monospace,"Cascadia Code","JetBrains Mono",Consolas,"SF Mono",monospace;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

- [ ] **Step 2** — Réécrire la coquille de base pour consommer les tokens :
  - `html, body, #app` → `background:var(--bg); color:var(--text-2); font-family:var(--sans);` (retirer `Consolas, monospace` global).
  - `#body` → `border-top:1px solid var(--border);`
  - `#header` → `background:var(--surface); ` marque en `--text` (retirer `#7fd`), hauteur inchangée ; `.sound-toggle` (bouton réglages) → style ghost tokenisé (`color:var(--text-3); border:1px solid var(--border); border-radius:var(--r);` hover `background:var(--ghost-hover); color:var(--text)`).
  - Scrollbars → `--border`/`--border-hover` au lieu de `#3a3a3a`/`#555`.

- [ ] **Step 3** — Vérifier : `npx tsc --noEmit` (clean) ; `npx vitest run` (301 passent) ; `npm run dev` → l'app boote, coquille + header au nouveau fond, terminal inchangé.

- [ ] **Step 4** — Commit : `refonte(ui): socle de tokens CSS + coquille de base`

---

## Task 2 — Sidebar (groupes, items, actions, menu contextuel)

**Files:**
- Modify: `src/renderer/index.html` (`#sidebar`, `.sidebar-scroll`, `.group*`, `.item*`, `.ic-btn`, `.ctx-menu`, `.new-group`, `.inline-edit`)

**Interfaces (consommé) :** tokens de Task 1 ; vars de groupe `--gc/--gcd/--gt/--gtd` (posées par `Sidebar.tsx`, inchangées).

- [ ] **Step 1** — `#sidebar` → `background:var(--surface); border-right:1px solid var(--border); width:250px;`.
- [ ] **Step 2** — `.group-head` → couleur `--text-3`, fond `var(--gc, transparent)` (tint groupe conservé) ; `.group.active-group > .group-head` fond `var(--gc, var(--ghost-hover))`. Nom de groupe en 12px uppercase `--text-2`.
- [ ] **Step 3** — `.item` → `color:var(--text-3); border-radius:var(--r); margin:1px 6px 1px 12px; padding:0 8px; height:31px;` ; `.item:hover` → `background:var(--ghost-hover); color:var(--text-2);`.
- [ ] **Step 4** — **Item actif = couleur de groupe, sans liseré** :
  - `.item.active-group-item` → `background:var(--gc, var(--fill-active)); color:var(--gt, var(--text));`
  - `.item.active-item` → `background:var(--gcd, var(--fill-active)); color:var(--gtd, var(--text));` **retirer** `box-shadow: inset 3px 0 0 #c80;`
  - Fallback neutre (groupe sans couleur) via `--fill-active`.
  - Vérifier que le surlignage démarre à droite du `padding-left:22px`/connecteur (ajuster `margin-left` de `.item` comme dans le compagnon pour ne pas mordre l'indentation).
- [ ] **Step 5** — `.ic-btn` (actions ＋/···/pin) → `color:var(--text-muted);` hover `color:var(--text);` ; conserver `.group-actions`/`.item-menu` `opacity:0` → `1` au hover (déjà en place). Uniformiser tailles (icônes groupe ~16px, item ~15px).
- [ ] **Step 6** — `.ctx-menu` → `background:var(--surface); border:1px solid var(--border-2); border-radius:var(--r);` items `color:var(--text-2)` hover `background:var(--ghost-hover)`, `.danger` en `--err` ; `.new-group` en `--text-3` hover `--text` ; `.inline-edit` bordure `--ring`, fond `var(--surface-2)`.
- [ ] **Step 7** — Vérifier : `npx vitest run` ; `npm run dev` → cliquer des items de groupes différents : l'item actif prend **la couleur de son groupe** (Messika bleu, etc.), hover ＋/··· visibles, aucun liseré orange.
- [ ] **Step 8** — Commit : `refonte(ui): sidebar groupes/items + item actif à la couleur du groupe`

---

## Task 3 — Panes, onglets, splitter (+ propagation couleur de groupe)

**Files:**
- Modify: `src/renderer/index.html` (`#panes`, `.group-panes`, `.pane*`, `.tab*`, `.tab-new*`, `.tab-overflow*`, `.splitter`, `.drop-zone`, `.body-slot`)
- Modify: `src/renderer/src/components/Workspace.tsx` — poser `style={{ '--gc':…, '--gcd':…, '--gt':…, '--gtd':… }}` (mêmes valeurs que `Sidebar.tsx`, via `darken/textOn` de `color.ts`) sur le conteneur `.group-panes` du groupe, pour que les onglets héritent la couleur du groupe actif. **Lire `Workspace.tsx` avant d'éditer.**

**Interfaces (consommé) :** tokens Task 1 ; `color.ts` → `darken(hex)`, `textOn(hex)`.

- [ ] **Step 1** — `.pane-tabstrip` → `background:var(--bg); border-bottom:1px solid var(--border);` ; `.tab` → fond `var(--bg)`, bordure `var(--border)`, `color:var(--text-3)`, radius haut `var(--r) var(--r) 0 0`.
- [ ] **Step 2** — `.tab.act` → `background:var(--card); color:var(--text); border-color:var(--border-2); border-bottom-color:var(--gc, var(--accent));` (accent d'onglet actif = couleur du groupe, fallback neutre). `.tab.aux` / `.tab.aux.act` idem tokenisés (retirer les `#c80`/`#2f3a44`).
- [ ] **Step 3** — `.tab-new button`, `.tab-overflow button`, menus `.tab-new-menu`/`.tab-overflow-menu` → surfaces `--surface`, bordures `--border(-2)`, items hover `--ghost-hover`, sélection `.sel` en `--gc, var(--accent)`.
- [ ] **Step 4** — `.splitter` → `background:var(--border);` hover `background:var(--gc, var(--border-hover));` ; `.drop-zone` → bordure pointillée `var(--gc, var(--accent))`, fond `--card`.
- [ ] **Step 5** — Workspace.tsx : appliquer les vars de groupe sur `.group-panes` (miroir de Sidebar). Vérifier `tsc` clean.
- [ ] **Step 6** — Vérifier : `npm run dev` → onglet actif souligné de la couleur du groupe, split visible, drag&drop d'onglets OK, menu overflow OK.
- [ ] **Step 7** — Commit : `refonte(ui): panes/onglets + accent d'onglet à la couleur du groupe`

---

## Task 4 — Exécutions (agents/shells), Console, Find

**Files:**
- Modify: `src/renderer/index.html` (`.rail`, `.agents-tab`, `.agent*`, `.abadge*`, `.console*`, `.cline*`, `.search-*`)

**Interfaces (consommé) :** tokens Task 1.

- [ ] **Step 1** — `.rail`/`.agents-tab` → `background:var(--surface); border-color:var(--border);` ; `.agent` → `border-bottom:1px solid var(--border);` hover `--ghost-hover` ; `.agent.sel` → `background:var(--accent-soft); outline:1px solid color-mix(in srgb,var(--gc,var(--accent)) 40%,transparent);` ; `.abadge.agent` → teinte `--purple` soft, `.abadge.shell` → teinte `--ok`/`--warn` soft ; états done/failed en `--text-muted`/`--err`.
- [ ] **Step 2** — `.console*`/`.cline*` → texte `--text-2`, `.cline.tool` `--warn`, `.cline.result`/`.prompt` `--text-muted`/`--text-3` ; `.console-header` fond `--surface` texte `--text-3`.
- [ ] **Step 3** — **Find en cartes de messages** : `.search-header input` tokenisé (bordure `--border-2`, focus `--ring`) ; `.search-msg` → carte `border:1px solid var(--border); border-radius:var(--r-card); background:var(--card); margin:8px;` ; `.search-role.user` → carte teintée `--accent-soft` + label `--info/--purple` ; `.search-role.assistant` neutre `--text-muted` ; `.search-text mark` → `background:color-mix(in srgb,var(--warn) 40%,transparent); color:#fff;`.
- [ ] **Step 4** — Vérifier : `npm run dev` → onglet Exécutions (agents/shells), Console d'un agent, Ctrl+F (Find) : cartes user vs Claude distinctes, surlignage lisible.
- [ ] **Step 5** — Commit : `refonte(ui): exécutions, console et find (cartes de messages)`

---

## Task 5 — Board ADO (barre, arbre, board colonnes, taskboard, détail, drawer)

**Files:**
- Modify: `src/renderer/index.html` (toutes les règles `.ado-*`)

**Interfaces (consommé) :** tokens Task 1.

- [ ] **Step 1** — Barre & contrôles : `.ado-board-bar`, `.ado-view-toggle`, `.ado-find-*`, `select` → surfaces `--surface`/`--bg`, bordures `--border(-2)`, sélection `.sel` en `--gc, var(--accent)` ; spinner/dot en `--warn`.
- [ ] **Step 2** — Arbre (`.ado-tree`, `.ado-row*`, `.ado-id`, `.ado-state`, `.ado-assignee`) → lignes hover `--ghost-hover`, `.ado-state` pill tokenisée (bordure `--border`, texte `--text-3`), id en `--mono`/`--text-muted`.
- [ ] **Step 3** — Board colonnes (`.ado-cols`, `.ado-col`, `.ado-col-head`, `.ado-card*`) → colonnes `background:rgba(255,255,255,.015); border:1px solid var(--border); border-radius:var(--r-card);` ; cartes `--card` hover `--card-hover`, bordure hover `--border-hover`.
- [ ] **Step 4** — Taskboard (`.ado-taskboard`, `.ado-tb-*`, `.ado-swimlane*`, `.ado-us-card`, `.ado-task-card`) → têtes sticky `--bg`, séparateurs `--border`. **Retirer** `border-left:3px solid #c80` de `.ado-us-card` → remplacer par bordure complète `--border` + fond `--card` (ban side-stripe).
- [ ] **Step 5** — Détail (`.ado-detail*`, `.ado-html`, `.ado-comment*`) + drawer (`.ado-drawer*`) → surfaces/bordures tokenisées, `.ado-meta-pill` en `--info` soft, liens `--info`.
- [ ] **Step 6** — Vérifier : `npm run dev` → ouvrir un board (tree + board + taskboard), le détail d'un WI, le drawer. Filtres/recherche in-board OK.
- [ ] **Step 7** — Commit : `refonte(ui): board ADO (arbre, colonnes, taskboard, détail)`

---

## Task 6 — Lecteur Notes / Markdown

**Files:**
- Modify: `src/renderer/index.html` (`.notes-*`, `.nt-*`, `.md-view*`, `.callout*`, `.hljs-*`, `.img-view`, `.html-view`)

**Interfaces (consommé) :** tokens Task 1.

- [ ] **Step 1** — `.notes-view`/`.notes-bar`/`.notes-tree`/`.notes-crumb` → `background:var(--surface)` pour l'arbre, `--bg` pour le contenu, bordures `--border` ; `.nt-row` hover `--ghost-hover`, `.nt-row.file.active` → `background:var(--fill-active); color:var(--text);`.
- [ ] **Step 2** — `.md-view` → conserver la police sans, `max-width` lisible ; titres `--text`, texte `--text-2`, liens `--info` ; `code` fond `--surface-2`, `pre` fond `--surface` bordure `--border` ; `blockquote` → fond léger + bordure complète (éviter side-stripe épais : garder ≤ un traitement discret) ; `table` bordures `--border`, `th` `--text-muted`.
- [ ] **Step 3** — `.callout*` → fond teinté de la sémantique (`--info/--warn/--err` soft) + bordure `--border` (retirer les `border-left: 4px` épais → tint + icône) ; conserver le mapping warning/danger/tip.
- [ ] **Step 4** — hljs : garder un thème sombre cohérent (les couleurs actuelles conviennent, ajuster si contraste faible).
- [ ] **Step 5** — Vérifier : `npm run dev` → ouvrir une note .md (titres, code, table, callout, liens), un `.img-view`, un `.html-view`.
- [ ] **Step 6** — Commit : `refonte(ui): lecteur notes / markdown`

---

## Task 7 — Overlays & contrôles partagés (modales, boutons, champs, badges, réglages, palette de couleurs)

**Files:**
- Modify: `src/renderer/index.html` (`.modal*`, `.btn*`, `.toggle*`, inputs `.ado-input`/`.search-header input`/`select`, `.setting-*`, `.swatch*`, `.color-*`, `.ado-conn-*`, `.muted`)

**Interfaces (consommé) :** tokens Task 1.

- [ ] **Step 1** — `.modal-overlay` → `background:rgba(0,0,0,.55);` ; `.modal` → `background:var(--surface); border:1px solid var(--border-2); border-radius:var(--r-card); box-shadow:0 24px 60px -20px rgba(0,0,0,.8);` ; `.modal-title`/`-body`/`-footer` tokenisés (séparateurs `--border`).
- [ ] **Step 2** — `.btn` → `background:var(--card); border:1px solid var(--border-2); border-radius:var(--r-btn); color:var(--text);` hover `--ghost-hover` ; `.btn.primary` → `background:var(--accent); color:var(--accent-ink); border:0; font-weight:600;` ; `.btn.danger` → `background:var(--err); color:#fff;`.
- [ ] **Step 3** — Champs (`.ado-input`, `.search-header input`, `.setting-row select`, `.inline-edit`) → `background:rgba(255,255,255,.03); border:1px solid var(--border-2); border-radius:var(--r);` focus `border-color:var(--ring); box-shadow:0 0 0 3px color-mix(in srgb,var(--ring) 22%,transparent);` (retirer les `border-color:#c80`).
- [ ] **Step 4** — `.toggle`/`.toggle.on` → off neutre, on `background:var(--accent-soft); border-color:color-mix(in srgb,var(--accent) 45%,transparent); color:var(--text);`.
- [ ] **Step 5** — `.swatches/.swatch` (GroupColorModal) → `.swatch.sel` bordure `--text` ; `.color-preview` tokenisé ; `.setting*`/`.ado-conn-*`/`.muted` → labels `--text-3`, chemins `--info`.
- [ ] **Step 6** — Vérifier : `npm run dev` → ouvrir Réglages, GroupColorModal (palette), AdoBindModal, ClaudeAdvancedModal, un ConfirmHost (fermeture). Boutons/champs/toggles cohérents.
- [ ] **Step 7** — Commit : `refonte(ui): overlays, boutons, champs, réglages, palette de couleurs`

---

## Task 8 — Polish & vérification globale

**Files:**
- Modify: `src/renderer/index.html` (ajustements de contraste/focus/motion résiduels)

- [ ] **Step 1** — Passe contraste : vérifier texte body ≥ 4.5:1 (les alphas `--text-2/-3` OK sur `--bg`) ; remonter `--text-muted` si un libellé important est trop pâle.
- [ ] **Step 2** — `:focus-visible` cohérent (outline `--ring`) sur boutons/onglets/champs interactifs ; conserver `@media (prefers-reduced-motion)` pour blink/pulse/spin.
- [ ] **Step 3** — Parcours complet dans `npm run dev` : session terminal (inchangé), split 2 volets, Exécutions, Find, board ADO (tree/board/taskboard/détail), lecteur notes, toutes les modales, changement de couleur de groupe, item actif par groupe.
- [ ] **Step 4** — `npx tsc --noEmit` clean ; `npx vitest run` (301 passent) ; `npm run build` OK.
- [ ] **Step 5** — Commit : `refonte(ui): polish contraste/focus/motion + vérification globale`

---

## Self-Review

- **Couverture spec** : coquille (T1), sidebar+item actif groupe (T2), panes/onglets+propagation groupe (T3), exécutions/console/find cartes (T4), board ADO complet (T5), notes/markdown (T6), overlays/contrôles/palette (T7), polish/a11y (T8). Toutes les régions CSS de `index.html` sont couvertes.
- **Bans** : liserés latéraux retirés en T2 (`.item.active-item`), T5 (`.ado-us-card`), T6 (`.callout`). Pas de gradient text introduit.
- **Cohérence tokens** : toutes les phases consomment le bloc `:root` de T1 ; noms de vars stables (`--gc/--gcd/--gt/--gtd` réutilisés tels quels).
- **Risque identifié** : propagation des vars de groupe aux panes (T3) nécessite de lire `Workspace.tsx` ; si la structure ne s'y prête pas, repli = onglet actif en accent neutre `--accent` (dégradation gracieuse, pas de blocage).
- **Note base git** : voir décision de branche au handoff (main est en retard sur HEAD).
