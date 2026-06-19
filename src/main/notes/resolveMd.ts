import { resolve } from 'node:path'

/** Chemin absolu .md/.markdown si existant (via `exists`), sinon null. */
export function resolveMdPath(cwd: string, token: string, exists: (p: string) => boolean): string | null {
  const abs = resolve(cwd, token)
  if (!/\.(?:md|markdown)$/i.test(abs)) return null
  return exists(abs) ? abs : null
}
