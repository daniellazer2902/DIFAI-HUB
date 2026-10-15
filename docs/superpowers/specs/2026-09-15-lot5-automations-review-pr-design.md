# Lot 5 — Automations de review de PR (Azure DevOps) — Design

Date : 2026-09-15
Branche : `feat/lot5-automations-pr` (depuis `main`)

## Objectif

Supprimer le geste répétitif « on m'affecte une PR → j'ouvre une session → je colle un prompt de
review → j'attends → je relis ». Sur un projet comme Banque Alimentaire, ce geste revient 5 à 6
fois par jour.

Une **automation** est un item configuré dans un groupe de la sidebar. Elle surveille les pull
requests Azure DevOps où l'utilisateur figure comme reviewer, et lance pour chaque nouvelle PR une
session Claude dans un onglet d'arrière-plan, amorcée avec un prompt paramétrable (par défaut la
skill `/difai-tech-devops-ado-code-review`). Un toast en haut à droite signale la fin du run, ou le
moment où la session attend une réponse.

Contrainte structurante : le cas Cerba, où un même périmètre de travail couvre plusieurs projets
Azure DevOps (catalogues, prescription, socle, transverse). Le modèle doit les regrouper.

## Contexte existant (réutilisé)

- **Modules main** : `HubModule` + `AppContext` (`src/main/AppContext.ts`) — un sous-système = un
  module qui câble ses services et ses canaux IPC, enregistré dans `src/main/index.ts`.
- **ADO** : `AdoProvider` (`src/main/ado/AdoProvider.ts`) en lecture seule sur les work items,
  URLs centralisées dans `src/main/ado/adoUrls.ts`, connexions persistées par `adoStore.ts`
  (`ado.json`), PAT chiffrés par `CredentialStore` (safeStorage) et lus via `ctx.credentials.get(connId)`.
  Aucune API pull request aujourd'hui.
- **Bind ADO au groupe** : `PersistGroup.ado = { connId, project, team }` (`src/shared/ipc.ts`) —
  un seul projet par groupe, c'est précisément la limite à lever.
- **Sessions** : `PtyManager.create(cwd, { file, args, env })` (`src/main/PtyManager.ts:45`) lance
  Claude avec `--settings <hooks>` et `DIFAI_HUB_PORT` / `DIFAI_HUB_TAB` (`sessionModule.ts`).
- **États de session** : `HookServer` (`src/main/HookServer.ts`) reçoit les hooks, `applyHookEvent`
  (`src/main/hookEvents.ts`) les traduit en `active` / `attention` / `waiting` / `done`.
  `AskUserQuestion` et `ExitPlanMode` en `PreToolUse` produisent déjà `attention` : c'est le signal
  dont les notifications ont besoin, sans une ligne de code neuf.
- **Montage des terminaux** : `Pane.tsx:302` monte tous les terminaux du groupe en `display:none`
  pour les inactifs, `Workspace.tsx:49` fait de même pour tous les groupes. Un onglet de run créé
  en arrière-plan a donc son `Terminal` monté immédiatement — **aucun buffer de sortie à prévoir**.
- **Modales maison** : `ConfirmHost` + `confirm.ts` (hôte monté une fois, appelé impérativement) —
  modèle repris pour l'hôte de toasts. `AdoBindModal` sert de gabarit à la modale de configuration.
- **Bridge inverse main → renderer** : `dideOpenModule` + `IPC.DideOpen` montre déjà comment le
  main demande au renderer d'ouvrir un onglet. Même mécanique ici.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Exécution d'un run | Session pty réelle dans un onglet d'arrière-plan (pas de headless) |
| Périmètre surveillé | Porté par le groupe de la sidebar, hérité par ses automations |
| Déclencheurs V1 | Affectation comme reviewer (polling) + lancement manuel |
| Permissions | Liste blanche d'outils déclarée par automation |
| Disposition UI | Item dans le groupe + ligne d'état globale au-dessus de Paramètres |
| Source du diff | API REST Azure DevOps uniquement, pas de git local |
| Authentification | PAT de la connexion du groupe, injecté dans l'environnement du run |

### Pourquoi pas de git local

La skill `difai-tech-devops-ado-code-review` l'interdit explicitement en mode revue de PR
(`code-review-protocol.md`, section « PR review mode ») : *« NEVER fetch branches locally »*,
*« Do NOT run git fetch, git checkout, or git diff for PR reviews »*. Elle lit le diff par
`pullRequests/{id}/iterations` → `iterations/{iterId}/changes` → `items?path=…&version={branche source}`.

Conséquences : pas de table repo → dossier local, pas de clone à tenir à jour, pas de worktree, et
aucun risque pour le dossier de travail de l'utilisateur. Le `cwd` du run ne sert qu'à donner à la
session le contexte de conventions du projet (la skill demande de lire le `CLAUDE.md` du projet).

### Pourquoi la session reste interactive

La skill s'interrompt volontairement à plusieurs reprises :

1. **Step 0** pose quatre questions (mode, org/projet, repo, id de PR) — évitées par le
   pré-remplissage du prompt (voir « Prompt d'amorçage »).
2. **Traçabilité (règle 🔒 #14)** : si la PR n'est liée à aucun work item, elle demande s'il faut
   poursuivre.
3. **Vote (Step C)** : jamais automatique. Elle vérifie d'abord si l'auto-complétion est armée sur
   la PR — voter déclenche la réévaluation des politiques de branche et peut merger la PR
   immédiatement, y compris sur un vote négatif — puis attend un arbitrage humain.
4. **Récap Teams** : soumis à validation humaine.

Un run ne « se termine » donc pas silencieusement : il aboutit le plus souvent à *commentaires
postés, décision de vote en attente*. C'est ce qui rend la session pty indispensable — l'utilisateur
clique sur le toast, le focus se pose dans le terminal, il répond au clavier, la session repart.

## Modèle de données

### Périmètre du groupe

Extension de `PersistGroup.ado` dans `src/shared/ipc.ts` :

```ts
export interface AdoWatchScope { project: string; repos: string[] }   // repos vide = tous

ado: {
  connId: string
  project: string          // inchangé : projet du board de sprint
  team: string | null
  watch?: AdoWatchScope[]  // nouveau : projets surveillés pour les automations
} | null
```

Cerba déclare quatre entrées dans `watch`. Le board de sprint existant continue d'utiliser
`project` / `team` et n'est pas modifié. `watch` absent = repli sur `[{ project, repos: [] }]`,
ce qui préserve le comportement des groupes déjà configurés (pas de migration de `workspace.json`).

### L'automation

Nouveau `kind: 'automation'` dans `PersistItem.kind`, à côté de `'claude' | 'ado' | 'cmd' | 'note'` :

```ts
export interface PersistAutomation {
  trigger: 'reviewer-assigned'
  pollSeconds: number          // défaut 300
  prompt: string               // template à variables
  allowedTools: string[]
  watch?: AdoWatchScope[]      // override du périmètre du groupe ; absent = hérite
  enabled: boolean
}
```

Persistée dans `workspace.json` comme les autres items, via `workspaceStore.ts`.

### L'onglet de run

Second `kind`, distinct et **non persisté** : `kind: 'run'`. C'est l'onglet d'une exécution en
cours, éphémère par nature — au redémarrage de l'IDE, la session pty n'existe plus, l'onglet ne
doit pas revenir. `workspaceStore.ts` filtre donc ce kind à l'écriture, comme il le fait déjà de
l'état runtime des sessions.

L'item de configuration (`'automation'`) et l'onglet d'exécution (`'run'`) sont deux objets
différents : le premier vit dans la sidebar et survit aux redémarrages, le second apparaît le temps
d'un run.

### Le journal des runs

Fichier dédié `automations.json` dans `userData` — **pas** dans `workspace.json`, qui décrit une
configuration et non un historique. Même forme que `adoStore.ts` (parse tolérant, écriture best-effort).

```ts
export type RunStatus =
  | 'pending'    // PR détectée mais volontairement pas lancée (garde-fou de démarrage) — attend un feu vert
  | 'queued'     // acceptée, attend un créneau d'exécution
  | 'running'
  | 'attention'
  | 'done'
  | 'failed'

export interface RunRecord {
  id: string
  automationId: string
  key: string                  // `${project}/${repo}#${prId}@${iterationId}` — clé de déduplication
  project: string
  repo: string
  prId: number
  title: string
  url: string
  startedAt: number
  endedAt: number | null
  status: RunStatus
  error: string | null
  tabId: string | null
}
```

L'`iterationId` dans la clé ne sert à rien en V1 (une PR déclenche un seul run). Il rend le
déclencheur « nouveau push sur une PR déjà reviewée » possible plus tard sans toucher au modèle.

Le journal est borné : on conserve les 200 derniers enregistrements, les plus anciens sont tronqués
à l'écriture.

## Moteur — `src/main/modules/automationModule.ts`

### Découverte des PR

Nouvelles URLs dans `adoUrls.ts` :

```
connectionDataUrl(baseUrl)                  → /_apis/connectionData?api-version=7.1
assignedPullRequestsUrl(baseUrl, project, reviewerId)
    → /{project}/_apis/git/pullrequests?searchCriteria.reviewerId={id}
      &searchCriteria.status=active&api-version=7.1
```

L'identité vient de `connectionData.authenticatedUser.id`, résolue une fois par connexion et mise
en cache pour la durée du processus.

L'API liste les PR **au niveau projet**, tous repos confondus : pour Cerba, quatre requêtes par
tick. Le filtrage par repo se fait côté client à partir de `watch[].repos`. À un tick toutes les
cinq minutes, la charge est négligeable au regard des quotas Azure DevOps.

Le provider est isolé dans `src/main/ado/PullRequestProvider.ts`, avec la même injection de
`FetchLike` que `AdoProvider` — c'est ce qui rend les tests possibles sans réseau.

### Ordonnanceur

`src/main/automations/AutomationScheduler.ts` — un timer par automation activée, période
`pollSeconds`. À chaque tick :

1. Lister les PR assignées sur chaque projet du périmètre effectif (override de l'automation, sinon
   celui du groupe).
2. Filtrer par `repos` si la liste n'est pas vide.
3. Construire la clé de chaque PR et écarter celles déjà présentes dans le journal.
4. Pour les restantes, demander un run.

Deux garde-fous :

- **Pas de rafale au démarrage.** Au premier tick suivant l'ouverture de l'IDE, les PR déjà
  assignées ne lancent pas de run rétroactif : elles sont enregistrées dans le journal au statut
  `pending` et signalées par un toast unique « N PR en attente de review — lancer ? ». Elles ne
  passent en `queued` que sur acceptation, et sont écartées définitivement sur refus. Les PR
  détectées aux ticks suivants partent seules. Sans cela, ouvrir l'IDE le matin lancerait six
  sessions simultanées.
- **Deux runs simultanés au maximum** (`MAX_CONCURRENT = 2`), les suivants restent `queued` et
  démarrent à la libération d'un créneau. Un run en `attention` compte comme actif : il occupe un
  créneau tant que l'utilisateur n'a pas répondu, ce qui est voulu — la file ne doit pas s'emballer
  pendant qu'il est parti en réunion.

### Lancement d'un run

`src/main/automations/AutomationRunner.ts` :

```ts
const prompt = renderPrompt(automation.prompt, vars)   // src/main/automations/renderPrompt.ts
const tabId = ctx.pty.create(cwd, {
  args: ['--settings', ctx.hooksSettingsPath(),
         '--allowedTools', automation.allowedTools.join(','),
         prompt],                                       // prompt positionnel : la session démarre amorcée
  env: { DIFAI_HUB_PORT: String(ctx.hookServer.port), ADO_PAT: pat }
})
ctx.registry.register(tabId, cwd)
ctx.sender.send(IPC.AutomationRunStarted, { runId, groupId, automationId, tabId, title })
```

- `cwd` = `defaultCwd` du groupe.
- `pat` = `ctx.credentials.get(connId)`, déchiffré au lancement.
- Le renderer reçoit `AutomationRunStarted` et crée un item `kind: 'run'` dans le groupe, avec son
  `tabId`. L'onglet est créé **sans être activé** ; son terminal est monté aussitôt par `Pane`
  (cf. contexte existant), donc rien n'est perdu.

Variables disponibles dans le template : `{{org}}`, `{{project}}`, `{{repo}}`, `{{prId}}`,
`{{title}}`, `{{sourceBranch}}`, `{{targetBranch}}`, `{{url}}`, `{{author}}`. `renderPrompt` est une
substitution littérale, sans évaluation ; une variable inconnue est laissée telle quelle plutôt que
remplacée par du vide, pour que l'erreur soit visible dans le terminal.

### Suivi des états

Le module s'abonne à `ctx.hookServer.onEvent` et à `ctx.pty.onExit`, et projette l'état de la
session sur le run correspondant (via `tabId`) :

| Événement | Statut du run |
|---|---|
| `active` | `running` |
| `attention` (dont `AskUserQuestion`, `ExitPlanMode`, `Stop`) | `attention` |
| sortie du pty, code 0 | `done` |
| sortie du pty, code ≠ 0 | `failed` |

Nuance : `Stop` signale la fin d'un tour, pas la fin du run — la session reste ouverte. Le statut
`done` n'est posé qu'à la sortie effective du processus. Un `Stop` sans sortie donne donc
`attention`, ce qui est le comportement voulu : la session a fini de parler et attend.

## Notifications

Canal `IPC.AutomationNotify` (main → renderer) portant `{ runId, level, title, body, action }` avec
`level ∈ { 'done', 'attention', 'failed' }`.

`src/renderer/src/components/ToastHost.tsx`, monté une fois dans `App.tsx` sur le modèle de
`ConfirmHost`. Pile en haut à droite, sous la barre de titre (la fenêtre utilise
`titleBarStyle: 'hidden'` avec un overlay de 36 px — les toasts se placent en dessous).

- `done` : disparaît seul au bout de 6 s.
- `attention` et `failed` : persistants jusqu'au clic.
- Clic : active le groupe, active l'onglet du run, pose le focus dans le terminal.

Un toast d'échec indique toujours **ce qui a été posté ou non** : une review à moitié postée est
plus gênante qu'une review absente.

Le retour sonore existant (`src/renderer/src/sound.ts`) est réutilisé pour `attention`, conditionné
au réglage `soundEnabled` déjà présent dans le store.

## Interface

- **Sidebar, dans le groupe** : item `kind: 'automation'`, icône dédiée, badge indiquant le nombre
  de runs actifs. Menu contextuel : configurer, activer/désactiver, lancer sur une PR (saisie d'une
  URL ou d'un identifiant).
- **Ligne d'état** (`AutomationStatusBar.tsx`), juste au-dessus de Paramètres : `3 runs · 1 attention`,
  dérivée du store par sélecteur — pas un second modèle de données. Repliée par défaut ; dépliée,
  elle liste les runs actifs préfixés de leur groupe, et un clic saute dans l'onglet.
- **Modale de configuration** (`AutomationModal.tsx`), gabarit `AdoBindModal` : périmètre (cases à
  cocher des projets/repos du groupe, ou héritage), prompt (zone de texte pré-remplie), outils
  autorisés, intervalle de polling, interrupteur d'activation.
- **Onglet de run** : le composant `Terminal` existant, sans modification.

### Préréglage d'outils « review »

```
Read, Grep, Glob, WebFetch, Bash(curl:*), Bash(git log:*), Bash(git show:*), Skill
```

Pas d'`Edit` ni de `Write` : une review lit et commente, elle ne modifie pas le code. La session ne
bloque donc jamais sur une demande de permission pour ce qu'elle doit faire, et ne peut pas écrire
dans un repo par accident. Si elle a besoin d'autre chose, elle demande — état `attention`, toast,
l'utilisateur tranche.

## Prompt d'amorçage par défaut

```
/difai-tech-devops-ado-code-review

Revue de PR (mode 2 — commentaires postés sur la PR).
Organisation : {{org}} | Projet : {{project}} | Repository : {{repo}} | PR : {{prId}}
Titre : {{title}}
Authentification : utilise le PAT présent dans $ADO_PAT (en-tête Basic). N'utilise pas az CLI.
Ne vote pas et ne poste rien sur Teams sans me demander.
```

Les quatre réponses du Step 0 sont fournies d'emblée, sinon le run se fige dix secondes après son
lancement. Les instructions propres à un projet se rajoutent dans le même champ, qui reste
entièrement éditable : c'est aussi la porte de sortie si la skill fait évoluer son Step 0.

## Sécurité

- Le PAT est déchiffré au lancement du run et passé par l'environnement du processus enfant. Il
  n'est jamais journalisé, jamais écrit dans `automations.json`, jamais renvoyé au renderer.
- La substitution du template est littérale : aucun contenu venant d'Azure DevOps (titre de PR, nom
  de branche) n'est interprété comme commande. Ces valeurs arrivent dans un argument unique passé à
  `node-pty` sans passer par un shell.
- Les identifiants restent dans `CredentialStore` (safeStorage), inchangé.

## Tests (vitest)

- `PullRequestProvider` : découpage de la réponse, filtrage par repo, résolution de l'identité — via
  `FetchLike` simulé, comme les tests `AdoProvider` existants.
- Journal : déduplication par clé, troncature à 200, tolérance à un fichier corrompu.
- `renderPrompt` : substitution, variable inconnue laissée intacte, absence d'évaluation.
- `AutomationScheduler` : timers simulés — pas de rafale au premier tick, plafond de concurrence,
  reprise de la file à la libération d'un créneau.
- Projection des états : table événement → statut, dont le cas `Stop` sans sortie de processus.
- Réducteurs du store : création d'un item de run, sélecteur de la ligne d'état.

`PtyManager` est déjà injectable (`PtySpawner`), le runner se teste sans lancer de processus.

## Hors périmètre V1

Re-review au push d'une nouvelle itération, déclencheur planifié récurrent, récapitulatif Teams
automatique, vote automatique, automation couvrant plusieurs clients. Le modèle les accueille sans
refonte : le déclencheur est un champ, la clé de journal porte déjà l'itération, le périmètre est
une liste.

## Risques assumés

- **L'IDE fermé, rien ne tourne.** Les automations vivent dans le processus main. Accepté : l'outil
  est un cockpit de travail, pas un service.
- **Le PAT transite dans l'environnement du processus enfant.** Acceptable en local, sur un poste
  déjà porteur des identifiants.
- **Le Step 0 de la skill peut évoluer** et rendre le pré-remplissage faux. Atténué par le fait que
  le prompt est éditable et visible dans la configuration.
- **Une PR peut être fermée pendant un run.** La session le découvre en postant ; le toast d'échec
  rapporte ce qui a été posté avant l'interruption.
