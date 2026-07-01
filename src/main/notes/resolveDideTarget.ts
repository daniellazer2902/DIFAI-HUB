// src/main/notes/resolveDideTarget.ts
import { isAbsolute, resolve } from 'node:path'

export interface TargetFs {
  exists: (path: string) => boolean
  isDir: (path: string) => boolean
}

/** Résout un chemin (absolu ou relatif au cwd) et indique fichier/dossier. null si absent. */
export function resolveDideTarget(rawPath: string, cwd: string, fs: TargetFs): { absPath: string; isDir: boolean } | null {
  const absPath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(cwd, rawPath)
  if (!fs.exists(absPath)) return null
  return { absPath, isDir: fs.isDir(absPath) }
}
