# POC DIFAI-HUB — Findings

**Date :** 2026-06-02 · **Plateforme :** Windows 11, Node v22.14.0 · **Verdict global : ✅ GO**

Les deux inconnues bloquantes sont levées. Le POC valide l'architecture cœur de la spec.

---

## Q1 — Corrélation (tabId ↔ session) : ✅ GO

`DIFAI_HUB_TAB` injecté en variable d'env au `pty.spawn` **traverse** node-pty → `claude.exe` → hook, et le hook `SessionStart` le renvoie avec les infos de session.

Payload réel capturé (`SessionStart`) :
```json
{
  "tabId": "poc-tab-1",
  "session_id": "1da77f3c-05d1-455d-a5ee-5ab6ae126911",
  "transcript_path": "C:\\...\\projects\\<slug-poc>\\1da77f3c-...jsonl",
  "cwd": "C:\\...\\DIFAI-HUB\\poc",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-opus-4-8[1m]"
}
```

**Conséquence design :** la corrélation est déterministe et immédiate. `SessionStart` fournit directement `transcript_path` → pas d'heuristique. Le `SessionRegistry` se peuple dès le démarrage de la session.

---

## Q2 — Transcripts d'agents : ✅ GO

### Emplacement
Chaque subagent a son transcript dans un **sous-dossier dédié** :
```
<projet>\<session_id>\subagents\agent-<agent_id>.jsonl
<projet>\<session_id>\subagents\agent-<agent_id>.meta.json
```

### Timing — écriture LIVE confirmée
Observé sur un agent réel : le `.jsonl` apparaît puis grossit en **~21 écritures successives** (19 Ko → 92 Ko) **pendant** l'exécution de l'agent.
→ **Le mirror live est faisable** : un `tail` (lecture incrémentale par offset) du fichier suffit.

### `.meta.json` (disponible dès la création)
```json
{ "agentType": "general-purpose", "description": "Implémenter le harnais POC", "toolUseId": "toolu_..." }
```
→ Le rail d'agents peut afficher **type + description dès le démarrage** de l'agent, sans attendre la fin.

### Format des lignes du `.jsonl` d'agent
JSON par ligne, toutes avec `"isSidechain": true`. Champs clés : `type`, `agentId`, `message.{role,content}`, `uuid`, `timestamp`. Séquence type observée :
```
1: type=user        (prompt de l'agent)
2: type=attachment
3: type=assistant    content=text
4: type=assistant    content=tool_use:Glob   ← outil utilisé (parsable)
5: type=user         content=tool_result
6: type=assistant    content=text            (réponse finale)
```

### Hook `SubagentStop` (à la fin de l'agent)
Fournit les métadonnées propres + le résultat :
```json
{
  "hook_event_name": "SubagentStop",
  "agent_id": "a6be086119b375005",
  "agent_type": "Explore",
  "agent_transcript_path": "C:\\...\\subagents\\agent-a6be086119b375005.jsonl",
  "last_assistant_message": "Voici la liste des fichiers *.mjs ...",
  "stop_hook_active": false,
  "tabId": "poc-tab-1"
}
```
→ `last_assistant_message` = résumé direct exploitable. Marque l'agent comme terminé.

---

## Findings techniques additionnels

1. **node-pty s'installe via prebuild `win32-x64`** — aucune compilation node-gyp requise. **Le risque n°1 du projet est levé.**
2. **`claude` est un `claude.exe`** (`C:\Users\<user>\.local\bin\claude.exe`), pas un `.cmd`. node-pty (CreateProcess) **ne parcourt pas le PATH** → il faut le **chemin absolu** de l'exe. Résolution retenue : `where claude` au runtime. À implémenter dans le futur `PtyManager`.
3. **Le `TranscriptWatcher` doit surveiller `<session_id>\subagents\`** (les fichiers agents y sont directement). Un watch à `depth: 1` depuis le répertoire projet ne suffit PAS (les agents sont à profondeur 2).
4. **Les hooks héritent de l'environnement** du process Claude (confirmé empiriquement par le tabId).
5. **`.claude\settings.json` projet** est chargé automatiquement et fusionné avec le global — le POC a posé ses hooks sans toucher le settings global de l'utilisateur.

---

## Décision

**GO.** L'architecture de la spec est validée sur tous ses points critiques. Les plans V1-A→F peuvent être détaillés en intégrant :
- résolution du chemin absolu de `claude.exe` (V1-A / PtyManager) ;
- watch de `<session>\subagents\` + parsing `.jsonl` (lignes typées) + lecture du `.meta.json` (V1-C / TranscriptWatcher) ;
- exploitation de `SubagentStop.last_assistant_message` et de `.meta.json` pour le rail (V1-C).

Fixtures réelles disponibles : `poc/fixtures/agent-sample.jsonl`, `poc/fixtures/session-sample.jsonl`.
