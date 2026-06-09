// src/main/notes/assets.ts
import { extname } from 'node:path'
import { readFileSync, statSync } from 'node:fs'

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon'
}
const MAX_BYTES = 10 * 1024 * 1024 // 10 Mo

export function mimeForExt(ext: string): string | null {
  return MIME[ext.toLowerCase()] ?? null
}

export function toDataUri(mime: string, buf: Buffer): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Lit une image locale -> data URI, ou null (type non supporté / trop volumineux / illisible). */
export function readAssetDataUri(absPath: string): string | null {
  const mime = mimeForExt(extname(absPath))
  if (!mime) return null
  try {
    if (statSync(absPath).size > MAX_BYTES) return null
    return toDataUri(mime, readFileSync(absPath))
  } catch {
    return null
  }
}
