/** Dernier segment d'un chemin (Windows ou POSIX), slash final ignoré. */
export function basename(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[\\/]/)
  return parts[parts.length - 1] || p
}
