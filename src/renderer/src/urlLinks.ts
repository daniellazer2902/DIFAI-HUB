// URLs http/https/www dans du texte de terminal. Permissif sur le corps,
// puis on rogne la ponctuation finale (souvent issue de la phrase, pas de l'URL)
// et les fermetures non appariées : « (https://x) » ou « voir https://x. ».
// `www.x` (sans schéma) est normalisé en `https://www.x` pour l'ouverture.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi

/** Rogne la ponctuation/fermetures finales qui n'appartiennent pas à l'URL. */
function trimTrailing(url: string): string {
  let end = url.length
  while (end > 0) {
    const c = url[end - 1]
    if ('.,;:!?'.includes(c) || c === '"' || c === "'" || c === '`') { end--; continue }
    if (c === ')' && !url.slice(0, end).includes('(')) { end--; continue }
    if (c === ']' && !url.slice(0, end).includes('[')) { end--; continue }
    if (c === '}' && !url.slice(0, end).includes('{')) { end--; continue }
    break
  }
  return url.slice(0, end)
}

export interface UrlLink { start: number; end: number; token: string; href: string }

export function findUrlLinks(text: string): UrlLink[] {
  const re = new RegExp(URL_RE.source, URL_RE.flags)
  const out: UrlLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const token = trimTrailing(m[0])
    if (token.length < 5) continue // « www. » seul, etc.
    const href = /^https?:\/\//i.test(token) ? token : `https://${token}`
    out.push({ start: m.index, end: m.index + token.length, token, href })
  }
  return out
}

/** URLs d'une ligne de terminal, en coordonnées xterm (1-based, end.x inclusif). */
export interface UrlLinkRange { text: string; href: string; range: { start: { x: number; y: number }; end: { x: number; y: number } } }
export function urlLinkRanges(lineText: string, y: number): UrlLinkRange[] {
  return findUrlLinks(lineText).map((l) => ({
    text: l.token,
    href: l.href,
    range: { start: { x: l.start + 1, y }, end: { x: l.end, y } }
  }))
}
