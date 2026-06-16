import { IPC } from '../../shared/ipc'
import { TranscriptWatcher } from '../TranscriptWatcher'
import { ShellWatcher } from '../ShellWatcher'
import { applyHookEvent, type HookEvent } from '../hookEvents'
import type { AppContext, HubModule } from '../AppContext'

/** Corrélation session via hooks, démarrage des watchers, et flux agents/shells -> renderer. */
export function createAgentsModule(): HubModule {
  const watchers = new Map<string, TranscriptWatcher>()
  const shellWatchers = new Map<string, ShellWatcher>()
  // sessionId actuellement surveillé par onglet : si la session est reprise (resume /
  // clear / compaction) son sessionId change, et les nouveaux subagents vont dans un autre
  // dossier `<sessionId>/subagents` — il faut alors re-pointer le watcher.
  const watchedSession = new Map<string, string>()

  return {
    name: 'agents',
    register(ctx: AppContext): void {
      ctx.hookServer.onEvent((raw) => {
        const event = raw as HookEvent
        applyHookEvent(ctx.registry, event)
        const tabId = event.tabId
        if (!tabId) return
        const s = ctx.registry.get(tabId)
        if (s) ctx.sender.send(IPC.SessionState, tabId, s.state)

        if (event.hook_event_name === 'SubagentStop' && event.agent_id) {
          ctx.sender.send(IPC.AgentDone, tabId, event.agent_id)
        }

        // (Re)démarre le watcher quand la session est corrélée ET que le sessionId surveillé
        // a changé (1er démarrage ou reprise). Couvre SessionStart mais aussi tout autre
        // event survenant après une reprise.
        if (s?.sessionId && s.transcriptPath && watchedSession.get(tabId) !== s.sessionId) {
          let w = watchers.get(tabId)
          if (!w) {
            w = new TranscriptWatcher({
              onAgentAdded: (agentId, meta) =>
                ctx.sender.send(IPC.AgentAdded, tabId, agentId, meta.agentType, meta.description, 'agent'),
              onAgentLines: (agentId, lines) =>
                ctx.sender.send(IPC.AgentLines, tabId, agentId, lines)
            })
            watchers.set(tabId, w)
          }
          w.watch(s.transcriptPath, s.sessionId)

          let sw = shellWatchers.get(tabId)
          if (!sw) {
            sw = new ShellWatcher({
              onShellAdded: (taskId, title, detail) =>
                ctx.sender.send(IPC.AgentAdded, tabId, taskId, title, detail, 'shell'),
              onShellLines: (taskId, lines) =>
                ctx.sender.send(IPC.AgentLines, tabId, taskId, lines),
              onShellDone: (taskId, failed) =>
                ctx.sender.send(IPC.AgentDone, tabId, taskId, failed)
            })
            shellWatchers.set(tabId, sw)
          }
          sw.watch(s.transcriptPath)
          watchedSession.set(tabId, s.sessionId)
        }
      })

      ctx.pty.onExit((tabId) => {
        watchers.get(tabId)?.stop()
        watchers.delete(tabId)
        shellWatchers.get(tabId)?.stop()
        shellWatchers.delete(tabId)
        watchedSession.delete(tabId)
      })
    }
  }
}
