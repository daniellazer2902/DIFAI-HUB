import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'memos'
// L'id vient du renderer : on refuse tout ce qui pourrait sortir du dossier memos/.
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/

export function memoPath(userDataDir: string, id: string): string | null {
  return SAFE_ID.test(id) ? join(userDataDir, DIR, `${id}.html`) : null
}

export function loadMemo(userDataDir: string, id: string): string {
  const p = memoPath(userDataDir, id)
  if (!p) return ''
  try { return readFileSync(p, 'utf8') } catch { return '' }
}

/** Écriture atomique (tmp + rename) : une coupure en pleine écriture ne laisse pas un fichier tronqué. */
export function saveMemo(userDataDir: string, id: string, html: string): boolean {
  const p = memoPath(userDataDir, id)
  if (!p || typeof html !== 'string') return false
  try {
    mkdirSync(join(userDataDir, DIR), { recursive: true })
    const tmp = `${p}.tmp`
    writeFileSync(tmp, html, 'utf8')
    renameSync(tmp, p)
    return true
  } catch {
    return false
  }
}

export function deleteMemo(userDataDir: string, id: string): void {
  const p = memoPath(userDataDir, id)
  if (!p) return
  try { rmSync(p, { force: true }) } catch { /* ignore */ }
}
