// Mémo = gras, italique, souligné, barré, listes, spoiler. Tout le reste est aplati en texte.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'UL', 'OL', 'LI', 'P', 'DIV', 'BR'])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE', 'IMG', 'VIDEO', 'AUDIO'])
const BLOCKS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TABLE'])

/** Nettoie le HTML d'un mémo : allowlist de balises, aucun attribut conservé sauf le marqueur de spoiler. */
export function sanitizeMemo(html: string): string {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  clean(doc.body)
  return doc.body.innerHTML
}

function clean(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (DROP.has(child.tagName)) { child.remove(); continue }
    clean(child)
    if (BLOCKS.has(child.tagName)) {
      // Garde le retour à la ligne d'un bloc collé (titre, citation…) sans garder sa sémantique.
      const div = child.ownerDocument.createElement('div')
      while (child.firstChild) div.appendChild(child.firstChild)
      child.replaceWith(div)
      continue
    }
    const spoiler = child.tagName === 'SPAN' && child.hasAttribute('data-spoiler')
    if (!spoiler && !ALLOWED.has(child.tagName)) {
      const parent = child.parentNode as Node
      while (child.firstChild) parent.insertBefore(child.firstChild, child)
      parent.removeChild(child)
      continue
    }
    for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name)
    if (spoiler) child.setAttribute('data-spoiler', '')
  }
}
