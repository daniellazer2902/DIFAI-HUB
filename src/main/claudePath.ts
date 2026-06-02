import { execSync } from 'node:child_process'

type WhereFn = (cmd: string) => string

const defaultWhere: WhereFn = (cmd) => execSync(`where ${cmd}`, { encoding: 'utf8' })

/**
 * Résout le chemin de l'exécutable claude.
 * Sous Windows, node-pty (CreateProcess) ne parcourt pas le PATH et ne sait pas
 * lancer un shim .cmd/.bat → il faut le chemin absolu du .exe.
 */
export function resolveClaudePath(platform: NodeJS.Platform = process.platform, where: WhereFn = defaultWhere): string {
  if (platform !== 'win32') return 'claude'
  const out = where('claude')
  const exe = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.toLowerCase().endsWith('.exe'))
  if (!exe) throw new Error('claude.exe introuvable via "where claude"')
  return exe
}
