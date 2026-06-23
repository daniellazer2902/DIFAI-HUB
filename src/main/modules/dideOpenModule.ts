// src/main/modules/dideOpenModule.ts
import { existsSync, statSync } from 'node:fs'
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { DideOpenPayload } from '../../shared/ipc'
import { resolveDideTarget } from '../notes/resolveDideTarget'

interface DideEvent { kind?: string; tabId?: string | null; path?: string }

/** Reçoit les commandes /dide-open (POST sur le HookServer) et les route vers le renderer. */
export function createDideOpenModule(): HubModule {
  return {
    name: 'dide-open',
    register(ctx: AppContext): void {
      ctx.hookServer.onEvent((raw: unknown) => {
        const e = raw as DideEvent
        if (e?.kind !== 'dide-open' || typeof e.path !== 'string') return
        const tabId = typeof e.tabId === 'string' ? e.tabId : null
        const cwd = (tabId && ctx.registry.get(tabId)?.cwd) || ctx.defaultCwd
        const target = resolveDideTarget(e.path, cwd, {
          exists: (p) => existsSync(p),
          isDir: (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false
        })
        if (!target) { console.warn(`[dide-open] cible introuvable: ${e.path} (cwd=${cwd})`); return }
        const payload: DideOpenPayload = { tabId, absPath: target.absPath, isDir: target.isDir }
        ctx.sender.send(IPC.DideOpen, payload)
      })
    }
  }
}
