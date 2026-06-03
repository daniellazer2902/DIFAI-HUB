import { IPC } from '../../shared/ipc'
import { TranscriptWatcher } from '../TranscriptWatcher'
import { applyHookEvent, type HookEvent } from '../hookEvents'
import type { AppContext, HubModule } from '../AppContext'

/** Corrélation session via hooks, démarrage des watchers, et flux agents -> renderer. */
export function createAgentsModule(): HubModule {
  const watchers = new Map<string, TranscriptWatcher>()

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

        if (event.hook_event_name === 'SessionStart' && s?.sessionId && s.transcriptPath && !watchers.has(tabId)) {
          const w = new TranscriptWatcher({
            onAgentAdded: (agentId, meta) =>
              ctx.sender.send(IPC.AgentAdded, tabId, agentId, meta.agentType, meta.description),
            onAgentLines: (agentId, lines) =>
              ctx.sender.send(IPC.AgentLines, tabId, agentId, lines)
          })
          w.watch(s.transcriptPath, s.sessionId)
          watchers.set(tabId, w)
        }
      })

      ctx.pty.onExit((tabId) => {
        watchers.get(tabId)?.stop()
        watchers.delete(tabId)
      })
    }
  }
}
