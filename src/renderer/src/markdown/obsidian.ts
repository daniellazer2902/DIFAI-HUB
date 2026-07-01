// src/renderer/src/markdown/obsidian.ts
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i

/** Retire un bloc frontmatter YAML (--- ... ---) en tête de document. */
export function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const m = md.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return m ? md.slice(m[0].length) : md
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Convertit la syntaxe Obsidian en Markdown standard :
 * - embeds `![[fichier.png]]` -> image ; `![[Note]]` -> div data-embed (transclusion gérée par le viewer)
 * - wikilinks `[[cible|alias]]` -> lien markdown avec schéma `wikilink:`
 * L'ordre (embeds avant wikilinks) évite que `![[...]]` soit pris pour un wikilink.
 */
export function preprocessObsidian(md: string): string {
  let out = stripFrontmatter(md)
  out = out.replace(/!\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const [targetRaw, alias] = inner.split('|')
    const target = targetRaw.trim()
    if (IMG_EXT.test(target.split('#')[0])) return `![${alias?.trim() ?? ''}](${target})`
    const note = target.split('#')[0].trim()
    return `\n\n<div class="md-embed" data-embed="${escapeAttr(note)}"></div>\n\n`
  })
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const [targetRaw, alias] = inner.split('|')
    const target = targetRaw.trim()
    const display = (alias ?? target.split('#')[0]).trim()
    return `[${display}](wikilink:${encodeURI(target)})`
  })
  return out
}
