# Détection « en attente d'une réponse » — Design

**Date :** 2026-06-17
**Branche cible :** depuis `main`
**Statut :** validé

## Problème

Le hook `Stop` met la pastille en rouge (`attention`) quand Claude **termine son tour**.
Mais quand un skill/agent appelle l'outil interactif `AskUserQuestion` (menu de
propositions, ex. brainstorming) ou `ExitPlanMode` (présentation d'un plan), le tour
**ne se termine pas** : l'agent est en pause sur un `tool_use` qui attend le résultat
de l'utilisateur. Ni `Stop` ni `Notification` ne partent immédiatement (la
`Notification` d'inactivité n'arrive qu'après ~60 s). Résultat : la session est
techniquement à l'arrêt (elle attend l'utilisateur) mais la pastille reste verte/active.

## Objectif

Faire passer la pastille en rouge (`attention`) **dès** que Claude attend une réponse
de l'utilisateur via un outil interactif, et la repasser en `active` dès que
l'utilisateur a répondu.

## Décisions de cadrage

- **État visuel :** réutiliser l'état existant `attention` (rouge). Aucun nouvel état,
  aucun changement dans `StateDot`/sons.
- **Périmètre des outils interactifs :** `AskUserQuestion` **et** `ExitPlanMode`.
- **Approche :** nouveaux hooks `PreToolUse`/`PostToolUse` **scopés par matcher**.
  Pas de parsing de transcript (l'autre option envisagée), trop fragile et redondant
  avec le pipeline HTTP existant.

## Architecture (rappel du pipeline existant)

`hub-hooks.json` (généré par `hubHooks.ts`) → forward script `hook-forward.mjs`
(ajoute `tabId` depuis l'env `DIFAI_HUB_TAB`) → POST sur `HookServer` →
`applyHookEvent` → `SessionRegistry.setState` → `StateDot`.

Les events `PreToolUse`/`PostToolUse` de Claude Code portent le champ `tool_name`,
transmis tel quel par le forward script.

## Changements

### 1. `src/main/hubHooks.ts`

`buildHooksConfig` ajoute deux entrées **avec matcher** pour ne déclencher le forward
que sur les outils interactifs (sinon un process node serait lancé à chaque appel
d'outil) :

```
PreToolUse:  [{ matcher: 'AskUserQuestion|ExitPlanMode', hooks: [cmd] }]
PostToolUse: [{ matcher: 'AskUserQuestion|ExitPlanMode', hooks: [cmd] }]
```

Les entrées existantes (`SessionStart`, `UserPromptSubmit`, `Stop`, `Notification`,
`SubagentStop`) restent inchangées, sans matcher.

### 2. `src/main/hookEvents.ts`

- Ajouter `tool_name?: string` à l'interface `HookEvent`.
- Ajouter un helper `isInteractiveTool(name)` = `name ∈ { AskUserQuestion, ExitPlanMode }`.
- Router les deux nouveaux events (filtre défensif sur `tool_name` en plus du matcher) :

```
case 'PreToolUse':
  if (isInteractiveTool(e.tool_name)) reg.setState(tabId, 'attention')
  break
case 'PostToolUse':
  if (isInteractiveTool(e.tool_name)) reg.setState(tabId, 'active')
  break
```

### 3. Tests

- `tests/hubHooks.test.ts` : la config contient `PreToolUse`/`PostToolUse` avec le
  matcher `AskUserQuestion|ExitPlanMode`.
- `tests/hookEvents.test.ts` :
  - `PreToolUse` + `tool_name: 'AskUserQuestion'` → `attention`.
  - `PreToolUse` + `tool_name: 'ExitPlanMode'` → `attention`.
  - `PreToolUse` + `tool_name` non-interactif (ex. `Read`) → état inchangé.
  - `PostToolUse` + `tool_name: 'AskUserQuestion'` → `active`.

## Flux complet (ex. brainstorming)

`UserPromptSubmit` → active → … → `PreToolUse(AskUserQuestion)` → **attention (rouge)**
→ utilisateur répond → `PostToolUse(AskUserQuestion)` → active → … → `Stop` → attention.

## Cohérence avec l'existant

L'état `attention` conserve sa sémantique : le renderer repasse à `waiting` (vert)
quand l'utilisateur focus la console (accusé « vu »). Donc cliquer sur la console pour
lire/répondre à la question fait passer la pastille au vert — cohérent avec le choix de
réutiliser le rouge.

## Risque à vérifier au runtime

Confirmer que `ExitPlanMode` émet bien un event `PreToolUse` (`AskUserQuestion` : oui,
sans ambiguïté). Si `ExitPlanMode` ne déclenche pas de hook, le retirer du matcher —
`Notification` reste le filet de secours pour ce cas.

## Hors périmètre (YAGNI)

- Pas de nouvel état/couleur dédié.
- Pas de détection des prompts de permission (déjà couverts par `Notification`).
- Pas de détection par tail de transcript.
