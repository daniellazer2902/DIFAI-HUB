const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4',
  'PRE', 'CODE', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'DIV', 'SPAN', 'HR'
])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'NOSCRIPT'])

/** Nettoie un fragment HTML (allowlist de balises/attributs). Source = ADO interne → menace faible. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  cleanChildren(doc.body)
  return doc.body.innerHTML
}

function cleanChildren(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (DROP.has(child.tagName)) { child.remove(); continue }
    cleanChildren(child) // nettoie les descendants d'abord
    if (!ALLOWED.has(child.tagName)) {
      const parent = child.parentNode as Node
      while (child.firstChild) parent.insertBefore(child.firstChild, child)
      parent.removeChild(child)
      continue
    }
    cleanAttributes(child)
  }
}

function cleanAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    const val = attr.value.trim()
    if (name.startsWith('on')) { el.removeAttribute(attr.name); continue }
    if (el.tagName === 'A' && name === 'href') {
      if (/^(https?:|mailto:)/i.test(val)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
      else el.removeAttribute(attr.name)
      continue
    }
    if (el.tagName === 'IMG' && name === 'src') {
      if (!/^(data:|https:)/i.test(val)) el.removeAttribute(attr.name)
      continue
    }
    if (name === 'colspan' || name === 'rowspan') continue
    el.removeAttribute(attr.name)
  }
}
