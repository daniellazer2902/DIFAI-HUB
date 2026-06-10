// src/renderer/src/sanitizeMarkdown.ts
const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'UL', 'OL', 'LI', 'A',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'CODE', 'BLOCKQUOTE',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'IMG', 'DIV', 'SPAN', 'HR', 'INPUT'
])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'NOSCRIPT'])
const KEEP_DATA = new Set(['data-href', 'data-asset', 'data-embed'])

/** Sanitise le HTML issu de notre rendu Markdown (allowlist élargie vs ADO : classes, data-*, H5/H6, checkboxes). */
export function sanitizeMarkdownHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html ?? '', 'text/html')
  cleanChildren(doc.body)
  return doc.body.innerHTML
}

function cleanChildren(node: Element): void {
  for (const child of Array.from(node.children)) {
    if (DROP.has(child.tagName)) { child.remove(); continue }
    cleanChildren(child)
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
    if (name === 'class' || KEEP_DATA.has(name)) continue
    if (el.tagName === 'A' && name === 'href') {
      if (/^(https?:|mailto:)/i.test(val)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer') }
      else el.removeAttribute(attr.name)
      continue
    }
    if (el.tagName === 'IMG' && (name === 'src' || name === 'alt')) {
      if (name === 'src' && !/^data:/i.test(val)) el.removeAttribute(attr.name)
      continue
    }
    if (el.tagName === 'INPUT') {
      if (name === 'type' && val.toLowerCase() === 'checkbox') continue
      if (name === 'checked' || name === 'disabled') continue
      el.removeAttribute(attr.name); continue
    }
    if (/^H[1-6]$/.test(el.tagName) && name === 'id') continue
    if (name === 'colspan' || name === 'rowspan') continue
    el.removeAttribute(attr.name)
  }
  // Toute checkbox rendue est en lecture seule.
  if (el.tagName === 'INPUT') el.setAttribute('disabled', '')
}
