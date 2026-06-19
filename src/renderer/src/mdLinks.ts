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
    if (m[0].length === 0) { re.lastIndex++; continue }
    out.push({ start: m.index, end: m.index + m[0].length, token: m[0] })
  }
  return out
}
