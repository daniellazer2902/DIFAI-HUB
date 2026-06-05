import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import chokidar from 'chokidar'
import type { AppContext, HubModule } from '../AppContext'
import { claudeConfigPath, decideGuardAction } from '../claudeConfigGuard'

const SNAP = 'claude-config.last-good.json'

/**
 * Garde-fou de ~/.claude.json : Claude Code écrit ce fichier de façon non atomique,
 * donc plusieurs sessions lancées en parallèle par l'IDE peuvent le corrompre (queue de
 * bytes parasites). Ce module garde un snapshot de la dernière version VALIDE et restaure
 * automatiquement dès qu'une écriture la rend invalide. Il n'écrase jamais un contenu valide.
 */
export function createClaudeGuardModule(): HubModule {
  return {
    name: 'claudeGuard',
    register(ctx: AppContext): void {
      const target = claudeConfigPath()
      const snapPath = join(ctx.userDataDir, SNAP)
      let lastGood: string | null = null
      try { if (existsSync(snapPath)) lastGood = readFileSync(snapPath, 'utf8') } catch { /* ignore */ }

      const read = (): string | null => { try { return readFileSync(target, 'utf8') } catch { return null } }
      const persistSnap = (c: string): void => { try { writeFileSync(snapPath, c, 'utf8') } catch { /* ignore */ } }

      const check = (): void => {
        const a = decideGuardAction(read(), lastGood)
        if (a.action === 'snapshot') {
          lastGood = a.content
          persistSnap(a.content)
        } else if (a.action === 'restore') {
          try {
            writeFileSync(target, a.content, 'utf8')
            console.log('[guard] ~/.claude.json corrompu → restauré depuis le dernier snapshot valide')
          } catch (e) {
            console.error('[guard] échec restauration .claude.json', e)
          }
        }
      }

      check() // au démarrage : snapshot si valide, restauration si déjà cassé

      // awaitWriteFinish : on n'évalue qu'une fois l'écriture stabilisée (évite de lire un fichier à moitié écrit).
      const watcher = chokidar.watch(target, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 }
      })
      watcher.on('add', check).on('change', check)
    }
  }
}
