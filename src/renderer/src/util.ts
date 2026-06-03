/** Dernier segment d'un chemin (Windows ou POSIX), slash final ignoré. */
export function basename(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** Borne une largeur de console (px) entre un min et la largeur fenêtre moins une marge. */
export function clampConsoleWidth(w: number, viewport = window.innerWidth): number {
  const max = Math.max(260, viewport - 360)
  return Math.min(Math.max(w, 260), max)
}

const CONSOLE_WIDTH_KEY = 'difai.consoleWidth'

/** Largeur de console persistée, ou ~1/3 de la fenêtre par défaut. */
export function readConsoleWidth(): number {
  try {
    const raw = localStorage.getItem(CONSOLE_WIDTH_KEY)
    if (raw !== null) return clampConsoleWidth(Number(raw))
  } catch { /* ignore */ }
  return clampConsoleWidth(Math.round(window.innerWidth / 3))
}

/** Persiste la largeur de console. */
export function writeConsoleWidth(w: number): void {
  try { localStorage.setItem(CONSOLE_WIDTH_KEY, String(Math.round(w))) } catch { /* ignore */ }
}
