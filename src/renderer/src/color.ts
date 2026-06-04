/** 8 couleurs (tons moyens, lisibles en dark mode). */
export const PALETTE = ['#b5413b', '#c5651f', '#b8902a', '#3a9d5d', '#1f8f86', '#3a7bd0', '#8455c4', '#6b7280']

function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))) }

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => clampByte(n).toString(16).padStart(2, '0')).join('')
}

/** Variante plus foncée (mélange vers le noir). */
export function darken(hex: string, ratio = 0.22): string {
  const [r, g, b] = parseHex(hex)
  const f = 1 - ratio
  return toHex(r * f, g * f, b * f)
}

/** Couleur de texte lisible sur `hex` : sombre si la couleur est claire, blanc sinon. */
export function textOn(hex: string): string {
  const [r, g, b] = parseHex(hex)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.55 ? '#1e1e1e' : '#ffffff'
}
