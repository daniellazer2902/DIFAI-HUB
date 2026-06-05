import { execSync } from 'node:child_process'

type WhereFn = (cmd: string) => string
const defaultWhere: WhereFn = (cmd) => execSync(`where ${cmd}`, { encoding: 'utf8' })

/**
 * Résout le chemin absolu de PowerShell pour un item `cmd`.
 * Comme pour claude, node-pty (CreateProcess) ne parcourt pas le PATH sous Windows → chemin absolu du .exe.
 * Hors Windows : on retombe sur le shell de l'environnement.
 */
export function resolvePowerShellPath(
  platform: NodeJS.Platform = process.platform,
  where: WhereFn = defaultWhere,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (platform !== 'win32') return env.SHELL ?? '/bin/bash'
  try {
    const exe = where('powershell')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.toLowerCase().endsWith('.exe'))
    if (exe) return exe
  } catch { /* fallback ci-dessous */ }
  const root = env.SystemRoot ?? 'C:\\Windows'
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}
