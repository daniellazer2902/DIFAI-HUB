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

/** Ligne du buffer xterm : texte non rogné (translateToString(false)) et indicateur de retour à la ligne souple. */
export interface TermRow { text: string; isWrapped: boolean }

const URL_CHAR = /[^\s<>"'`]/

/**
 * La ligne `b` prolonge-t-elle la ligne `a` ?
 * Retour souple xterm (isWrapped), ou retour dur émis par la TUI (qui coupe
 * lui-même les longues lignes) : `a` remplit la largeur et les deux bords sont des caractères d'URL.
 */
function continues(a: TermRow, b: TermRow, cols: number): boolean {
  if (b.isWrapped) return true
  const t = a.text.trimEnd()
  return t.length >= cols - 1 && URL_CHAR.test(t[t.length - 1] ?? ' ') && URL_CHAR.test(b.text[0] ?? ' ')
}

/**
 * URLs touchant la ligne `y` (1-based), y compris celles coupées sur plusieurs lignes.
 * Les ranges renvoyés peuvent s'étendre sur plusieurs lignes (start.y < end.y).
 */
export function urlLinkRangesAcrossRows(getRow: (y: number) => TermRow | undefined, y: number, cols: number): UrlLinkRange[] {
  const row = getRow(y)
  if (!row) return []
  const linked = (a: number): boolean => {
    const ra = getRow(a)
    const rb = getRow(a + 1)
    return !!ra && !!rb && continues(ra, rb, cols)
  }
  let first = y
  while (linked(first - 1)) first--
  let last = y
  while (linked(last)) last++

  // Concaténation des lignes : rowStarts[i] = offset de la ligne first+i dans `joined`.
  const rowStarts: number[] = []
  let joined = ''
  for (let r = first; r <= last; r++) {
    const t = (getRow(r) as TermRow).text
    const next = r < last ? getRow(r + 1) : undefined
    rowStarts.push(joined.length)
    // Retour souple : la ligne garde sa largeur pleine ; sinon on rogne les espaces de fin.
    joined += next?.isWrapped ? t : t.trimEnd()
  }
  const toPos = (offset: number): { x: number; y: number } => {
    let i = rowStarts.length - 1
    while (i > 0 && rowStarts[i] > offset) i--
    return { x: offset - rowStarts[i] + 1, y: first + i }
  }

  return findUrlLinks(joined)
    .map((l) => ({ text: l.token, href: l.href, range: { start: toPos(l.start), end: toPos(l.end - 1) } }))
    .filter((l) => l.range.start.y <= y && y <= l.range.end.y)
}
