// Chemins .md/.markdown dans du texte de terminal. Permissif : la vérif
// d'existence (côté main) fait le filtre réel. Exclut espaces et wrappers
// (backticks, guillemets, parenthèses, crochets, accolades, virgule, ;).
// `md5` est exclu par la frontière de mot \b après l'extension.
export const MD_PATH_RE = /[^\s"'`<>|*?()[\]{},;]*\.(?:markdown|md)\b/gi

export interface MdLink { start: number; end: number; token: string }

export function findMdLinks(text: string): MdLink[] {
  const re = new RegExp(MD_PATH_RE.source, MD_PATH_RE.flags)
  const out: MdLink[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, token: m[0] })
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
