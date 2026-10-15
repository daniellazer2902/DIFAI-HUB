import type { AdoWatchScope } from './ipc'

/** Périmètre appliqué à une automation : sa surcharge si elle en a une, sinon celui du groupe. */
export function effectiveScope(groupScope: AdoWatchScope[], override?: AdoWatchScope[]): AdoWatchScope[] {
  return override && override.length > 0 ? override : groupScope
}

/** Vrai si (project, repo) entre dans le périmètre. Une entrée sans repos couvre tout le projet. */
export function matchesScope(scope: AdoWatchScope[], project: string, repo: string): boolean {
  return scope.some((s) => s.project === project && (s.repos.length === 0 || s.repos.includes(repo)))
}
