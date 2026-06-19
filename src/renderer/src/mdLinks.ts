// Chemins .md/.markdown dans du texte de terminal. Permissif : la vérif
// d'existence (côté main) fait le filtre réel. Trois formes, dans l'ordre :
//   1. délimité par backtick/guillemet : espaces autorisés à l'intérieur (groupe 1).
//   2. ancré (lecteur Windows `C:\`, `/`, `./`, `../`) : espaces autorisés,
//      capture non gourmande jusqu'au premier `.md` (groupe 2) — gère `av vente\x.md`.
//   3. nom simple sans espace (groupe 3).
// `md5` est exclu par la frontière de mot \b après l'extension.
export const MD_PATH_RE =
  /[`'"]([^`'"\r\n]*?\.(?:markdown|md))[`'"]|((?:[A-Za-z]:[\\/]|\.\.?[\\/]|[\\/])[^"'`<>|*?\r\n,;]*?\.(?:markdown|md))\b|([^\s"'`<>|*?()[\]{},;]+\.(?:markdown|md))\b/gi

export interface MdLink { start: number; end: number; token: string }

export function findMdLinks(text: string): MdLink[] {
  const re = new RegExp(MD_PATH_RE.source, MD_PATH_RE.flags)
  const out: MdLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const token = m[1] ?? m[2] ?? m[3]
    // Forme délimitée (groupe 1) : le délimiteur ouvrant occupe 1 caractère avant le contenu.
    const start = m[1] !== undefined ? m.index + 1 : m.index
    out.push({ start, end: start + token.length, token })
  }
  return out
}

/** Liens .md d'une ligne de terminal, en coordonnées xterm (1-based, end.x inclusif). */
export interface MdLinkRange { text: string; range: { start: { x: number; y: number }; end: { x: number; y: number } } }
export function mdLinkRanges(lineText: string, y: number): MdLinkRange[] {
  return findMdLinks(lineText).map((l) => ({
    text: l.token,
    range: { start: { x: l.start + 1, y }, end: { x: l.end, y } }
  }))
}
