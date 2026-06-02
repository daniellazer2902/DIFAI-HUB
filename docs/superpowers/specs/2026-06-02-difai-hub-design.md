# DIFAI-HUB — Design

- **Date** : 2026-06-02
- **Statut** : Design validé — prêt pour plan d'implémentation
- **Auteur** : Daniel GAVRILINE

## 1. Contexte & objectif

Quand Claude Code dispatche des subagents en parallèle, leur déroulé est invisible :
seul le message final remonte. **DIFAI-HUB** est un IDE/cockpit (application de bureau)
qui rend ce travail visible et pilotable, en multi-projets.

Le hub **remplace le terminal de travail Claude** : on y ouvre des sessions Claude
interactives, on y voit les agents qu'elles dispatchent, leur console en lecture seule,
et on est notifié quand une session a fini ou attend une réponse.

À terme (V2+), il devient un cockpit delivery : branchement ADO/Jira, visualisation de
doc, changement de statuts.

## 2. Périmètre

### Étape 0 — POC technique (dé-risquage, avant tout build d'UI)

> **Statut : ✅ RÉALISÉ le 2026-06-02 — GO.** Détails et fixtures : `poc/FINDINGS.md`.
> Corrélation déterministe prouvée, mirror live des agents confirmé, node-pty installé
> sans node-gyp. Points appris reportés dans l'architecture ci-dessous.

But : lever les **2 inconnues** avant d'investir dans l'app.

1. Spawner `claude` dans un `pty` avec `DIFAI_HUB_TAB` + un hook `SessionStart`
   temporaire → confirmer la **corrélation** `tabId ↔ sessionId`.
2. Lancer une tâche qui dispatche des agents → observer **où et comment** s'écrivent les
   `agent-*.jsonl` : fichiers séparés ou lignes `isSidechain` dans le `jsonl` principal ?
   timing du flush sous parallélisme ?

Sortie : GO/NO-GO technique + le format exact à parser + des **fixtures `jsonl` réelles**
réutilisées pour les tests unitaires.

### V1 — le cœur

- Application **Electron**, fenêtre unique.
- **Sidebar projets** avec compteur `sessions/agents` (ex. `Cerba 2/5`).
- **Onglets de sessions** : « nouvel onglet » = `spawn claude` dans un terminal
  **xterm.js** interactif (node-pty), `cwd` = racine du projet.
- **Corrélation** via `tabId` injecté en variable d'environnement + hook `SessionStart`
  → mini-serveur HTTP local.
- **Rail d'agents** à droite de chaque onglet, peuplé en live (mirror-watcher des
  `agent-*.jsonl`).
- **Clic agent → split vertical**, console lecture seule, **remplacement simple**
  (une console à la fois).
- **État des sessions** via hooks `Stop` / `Notification` / `SubagentStop` →
  **clignotement de l'onglet** + **son configurable**. Re-clic sur l'onglet = acquittement.
- **Fermeture propre** : modale de confirmation si agents actifs + clean doux→SIGKILL.
- **Hook de fermeture** prévu pour brancher le daily (voir V1.5).

### V1.5

- **Daily mécanique** : à la fermeture d'une session (si option activée), append d'un bloc
  dans `Vault-Dev\60-Daily\YYYY-MM-DD.md` — fichiers modifiés, commandes, agents
  dispatchés, durée. Extrait du `jsonl`.

### V2+

- **Daily intelligent** : résumé en prose via `claude -p`.
- Intégration **ADO / Jira / Teams** (tickets UX/DevTest) — réutilise utilTeams (Express TS
  + Angular + Playwright) et/ou les MCP/skills DIFAI existants.
- **Visualisation de doc** (Obsidian via `obsidian://open`).
- **Changement de statuts**.
- **Coffre de credentials** par projet (PAT/OAuth).

### Hors scope (YAGNI pour la V1)

- Pas de multi-fenêtres (une seule fenêtre, onglets).
- Pas de supervision des sessions Claude lancées **hors** du hub (sans `tabId`) — ignorées.
- Pas de multi-console simultanée (remplacement simple suffit).
- Pas de thèmes multiples ni de personnalisation poussée (le toggle clair/sombre est inclus), pas d'auth.

## 3. Décisions UI (validées)

| Sujet | Décision |
|-------|----------|
| Rôle du hub | Remplace le terminal de travail Claude (terminal interactif embarqué dès la V1) |
| Layout | Sidebar projets · barre d'onglets · terminal central · **rail d'agents à droite** |
| Déploiement console agent | **Split vertical** redimensionnable (terminal \| console) |
| Multi-agents | **Remplacement simple** — une console visible à la fois |
| Notification | Clignotement de l'onglet + son configurable ; acquittement au re-clic |
| Style visuel | Épuré / minimal, sobre. **Toggle clair/sombre** (dark mode) commutable par l'utilisateur, état persisté |

## 4. Architecture (Electron, 3 couches)

### Main process — 4 modules isolés

1. **`PtyManager`** — spawn/kill des sessions `claude` (node-pty), un `pty` par `tabId`,
   relaie l'I/O ↔ renderer. Injecte `DIFAI_HUB_TAB` + `cwd`. Sous Windows, **résout le
   chemin absolu de `claude.exe`** (`where claude`) car node-pty ne parcourt pas le PATH.
2. **`HookServer`** — mini-serveur HTTP local (port **dynamique**). Reçoit les POST des
   hooks : `SessionStart` (corrélation — fournit `session_id` + `transcript_path` + `cwd`),
   `Stop` / `Notification` (état de la session), `SubagentStop` (fournit `agent_id`,
   `agent_type`, `agent_transcript_path`). Route par `tabId`.
3. **`SessionRegistry`** — table de vérité en mémoire :
   `tabId ↔ sessionId ↔ cwd ↔ jsonlPath ↔ état`. Source des compteurs sidebar.
4. **`TranscriptWatcher`** — chokidar sur **`<session>\subagents\`** (les transcripts
   d'agents y sont directement : `agent-<id>.jsonl` + `agent-<id>.meta.json`). Lit le
   `.jsonl` en incrémental (tail — croissance live confirmée par le POC), parse les lignes
   typées (`isSidechain:true`, `type`, `message.content`, `tool_use`), pousse au renderer.
   Le `.meta.json` (présent dès la création) fournit `agentType` + `description` → le rail
   affiche l'agent immédiatement. Le hook `SubagentStop` fournit la fin + `agent_type` +
   `agent_transcript_path` + `last_assistant_message`.

### Renderer (UI)

Sidebar projets · barre d'onglets · `xterm.js` · rail d'agents · console split.
Reçoit tout par **IPC** ; n'accède jamais au FS directement.

### Preload

Pont IPC sécurisé (`contextBridge`), API étroite (`onPtyData`, `sendInput`,
`onAgentUpdate`, `onSessionState`…). `nodeIntegration` off.

### Côté Claude (hors app)

Hooks **injectés au lancement** via `claude --settings <hub-hooks.json>` (flag natif confirmé) :
les hooks s'**additionnent** à ceux de l'utilisateur, **sans modifier** son `settings.json`
global ni projet → **zéro pollution de la config utilisateur** (mieux que le « diff avant/après »
initialement prévu, désormais inutile). Les 4 hooks sont de type `command` → un script qui
forwarde l'event + le `tabId` (env `DIFAI_HUB_TAB`) au `HookServer` (port via env
`DIFAI_HUB_PORT`).

```
┌─────────────── Electron ───────────────┐
│  RENDERER (UI)                          │
│   sidebar │ onglets │ xterm │ rail/console
│        ▲ IPC (preload)  │               │
│  MAIN  │                ▼               │
│   PtyManager   HookServer   Registry    │
│        │            ▲          ▲        │
│   TranscriptWatcher │          │        │
└────────┼────────────┼──────────┼────────┘
         │            │          │
   agent-*.jsonl   hooks POST   corrélation
   (~/.claude)    (Claude CLI)  + état
```

## 5. Flux de données (cycle de vie d'une session)

```
1. Clic "+" sur projet Cerba
   └─ Renderer → Main : newSession(cwd=…/Cerba)

2. PtyManager génère tabId, spawn:
   claude  (env: DIFAI_HUB_TAB=<tabId>, cwd=…/Cerba)
   └─ xterm affiche le terminal interactif

3. Claude démarre → hook SessionStart POST { tabId, session_id, transcript_path, cwd }
   └─ SessionRegistry corrélé ✅ (jsonlPath connu directement)

4. TranscriptWatcher surveille le répertoire du transcript de cette session

5. Dispatch d'agents → transcripts d'agents apparaissent/grossissent → chokidar détecte
   └─ rail d'agents se peuple en live
   └─ hook SubagentStop POST { tabId, agent_id, agent_type, agent_transcript_path } à la fin
      → métadonnées propres + marque l'agent terminé

6. Clic agent → Main tail son transcript, parse
   └─ split s'ouvre, console lecture seule (remplace la précédente)

7. Claude finit / attend → hook Stop|Notification POST { tabId, event }
   └─ Registry met à jour l'état → onglet clignote + son
   └─ re-clic onglet = acquittement
```

**Compteur sidebar** : dérivé du Registry (nb sessions du projet / nb `agent-*.jsonl`
actifs).

**Robustesse** : tant que le hook `SessionStart` n'a pas répondu (étape 3), l'onglet est en
« démarrage… » ; aucun agent ne peut être mal attribué puisque rien n'est watché avant la
corrélation.

## 6. Cycle de vie, arrêt propre & cas limites

### Fermeture d'un onglet avec agents actifs

- **Agents actifs → modale** : « Cette session a N agents en cours. Les fermer
  interrompra leur travail. » → `Annuler` / `Fermer quand même`.
- **Aucun agent → fermeture directe**.

### Clean propre

Les subagents tournent dans le process `claude` → le tuer suffit, mais proprement :

1. Arrêt doux (SIGTERM / `Ctrl-C`) + **délai de grâce** (~3 s) pour laisser finir une
   écriture de fichier.
2. `SIGKILL` en dernier recours.
3. `TranscriptWatcher` arrête de surveiller · `Registry` purge le `tabId` · rail + console
   se ferment. Les `agent-*.jsonl` restent sur disque (historique).

Même logique à la fermeture de l'application (modale globale si ≥1 session a des agents).

### Daily (option paramétrable)

Hook de fermeture prévu dès la V1. Daily mécanique en V1.5, intelligent en V2.
Append dans `Vault-Dev\60-Daily\YYYY-MM-DD.md`.

### Autres cas limites

- **Hook `SessionStart` jamais reçu** : timeout → onglet « non corrélé », terminal
  fonctionne quand même, bandeau « supervision indisponible ».
- **Crash de `claude`** : `pty` exit → onglet affiche le code de sortie, Registry purge.
- **Port HTTP occupé** : port dynamique, communiqué aux hooks via un fichier de découverte.
- **node-pty** : build natif rebuildé pour la version d'Electron (documenté dans le setup).

## 7. Tests & validation

Approche pragmatique (projet perso) : logique pure testée à fond, le reste en POC +
scénarios manuels.

### Tests unitaires (cœur de l'effort)

- **`SessionRegistry`** : corrélation, transitions d'état, compteurs. Testable sans Electron.
- **Parser `jsonl`** : ligne brute → événement, distinction `isSidechain`, lecture
  incrémentale (offset). Sur fixtures du POC.
- **Routing `HookServer`** : POST → bon `tabId`, bon état.

### Tests d'intégration (ciblés)

- **Corrélation end-to-end** : spawn `claude` réel court → hook arrive → Registry peuplé.
- **Clean à la fermeture** : spawn → kill doux → purge Registry + arrêt watcher.

### Tests manuels (scénarios)

Flux complet, fermeture avec agents (modale), session non corrélée, crash `claude`, deux
sessions même projet, clignotement + acquittement.

### Stack

**Vitest** pour le main process. Pas de tests UI renderer en V1 (YAGNI).

## 8. Stack technique

| Brique | Choix | Raison |
|--------|-------|--------|
| Shell applicatif | **Electron** | node-pty / xterm natifs et mûrs (vs sidecar pénible sous Tauri) |
| Terminal | **xterm.js + node-pty** | Terminal interactif embarqué, standard de l'industrie |
| Surveillance FS | **chokidar** | Watch des transcripts `~/.claude/projects/<slug>/` |
| Transport événements | **mini-serveur HTTP local** | Temps réel ; pattern hook→HTTP déjà utilisé par Daniel |
| Tests | **Vitest** | Logique main process |

## 9. Risques connus

- **node-pty** = module natif → rebuild par version d'Electron (node-gyp, piège classique
  build Windows). Premier point à valider au build.
- **Format/timing des `agent-*.jsonl`** sous parallélisme — levé par le POC (étape 0).
- **Corrélation** — dé-risquée par l'approche `tabId` env var + hook (déterministe).

## 10. Références

- `utilTeams` (`Desktop\Travail\Claude apps\utilTeams`) — base réutilisable pour
  l'intégration V2 (Express TS + Angular + Playwright).
- Skill `wt-dashboard` — mécanisme de communication par fichier, inspiration du
  mirror-watcher.
- Faits vérifiés : les `.jsonl` de session sont append-only écrits au fil de l'eau ; chaque
  ligne porte un champ `isSidechain` marquant les subagents.
