export const SPOILER_ATTR = 'data-spoiler'
export const REVEALED_ATTR = 'data-revealed'
export const SPOILER_SEL = `span[${SPOILER_ATTR}]`

function spoilerOf(node: Node | null, root: Node): HTMLElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n.nodeType === 1 && (n as Element).matches(SPOILER_SEL)) return n as HTMLElement
  }
  return null
}

/** Nœuds texte réellement couverts par la plage (bornes exclues quand elles tombent au bord). */
function textNodesInRange(root: Node, range: Range): Text[] {
  const doc = root.ownerDocument ?? document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.data.length || !range.intersectsNode(n)) continue
    if (n === range.endContainer && range.endOffset === 0) continue
    if (n === range.startContainer && range.startOffset >= n.data.length) continue
    hits.push(n)
  }
  return hits
}

/** Idem, en découpant les nœuds aux bornes de la plage. */
function splitTextNodes(root: Node, range: Range): Text[] {
  const { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range
  return textNodesInRange(root, range).map((t) => {
    let node = t
    if (node === ec && eo < node.data.length) node.splitText(eo)
    if (node === sc && so > 0) node = node.splitText(so)
    return node
  })
}

function unwrap(el: HTMLElement): void {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

/** La sélection courante est-elle (entièrement) dans un spoiler ? */
export function selectionInSpoiler(root: HTMLElement, range: Range): boolean {
  if (range.collapsed) return !!spoilerOf(range.startContainer, root)
  const nodes = textNodesInRange(root, range)
  return nodes.length > 0 && nodes.every((t) => !!spoilerOf(t, root))
}

/**
 * Masque la sélection en spoiler, ou la démasque si elle l'est déjà.
 * Un texte sur plusieurs lignes donne un spoiler par morceau : un <span> ne peut pas contenir de bloc.
 * Retourne true si le DOM a changé.
 */
export function toggleSpoiler(root: HTMLElement, range: Range): boolean {
  const doc = root.ownerDocument
  if (range.collapsed) {
    const sp = spoilerOf(range.startContainer, root)
    if (!sp) return false
    unwrap(sp)
    return true
  }
  if (selectionInSpoiler(root, range)) {
    const spoilers = new Set(textNodesInRange(root, range).map((t) => spoilerOf(t, root)!))
    spoilers.forEach(unwrap)
    root.normalize()
    return spoilers.size > 0
  }
  const nodes = splitTextNodes(root, range).filter((t) => !spoilerOf(t, root))
  if (!nodes.length) return false
  const created: HTMLElement[] = []
  for (const t of nodes) {
    const span = doc.createElement('span')
    span.setAttribute(SPOILER_ATTR, '')
    t.parentNode!.insertBefore(span, t)
    span.appendChild(t)
    created.push(span)
  }
  const sel = doc.getSelection()
  if (sel && created.length) {
    const r = doc.createRange()
    r.setStartBefore(created[0])
    r.setEndAfter(created[created.length - 1])
    sel.removeAllRanges()
    sel.addRange(r)
  }
  return true
}

/** HTML à sauvegarder : l'état « révélé » n'est jamais persisté. */
export function serializeMemo(root: HTMLElement): string {
  if (!root.querySelector(`[${REVEALED_ATTR}]`)) return root.innerHTML
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll(`[${REVEALED_ATTR}]`).forEach((n) => n.removeAttribute(REVEALED_ATTR))
  return clone.innerHTML
}

/**
 * Re-masque un spoiler révélé dès qu'il sort entièrement de la zone visible
 * (défilement, onglet masqué…). Retourne la fonction d'arrêt.
 */
export function watchSpoilers(root: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (!e.isIntersecting) e.target.removeAttribute(REVEALED_ATTR)
  }, { root })
  const seen = new WeakSet<Element>()
  const scan = (): void => {
    root.querySelectorAll(SPOILER_SEL).forEach((s) => { if (!seen.has(s)) { seen.add(s); io.observe(s) } })
  }
  scan()
  const mo = new MutationObserver(scan)
  mo.observe(root, { childList: true, subtree: true })
  return () => { mo.disconnect(); io.disconnect() }
}

/** Caret posé au bord (début ou fin) d'un spoiler ? */
export function spoilerEdge(root: HTMLElement, range: Range): { span: HTMLElement; edge: 'start' | 'end' } | null {
  if (!range.collapsed) return null
  const span = spoilerOf(range.startContainer, root)
  if (!span) return null
  const before = root.ownerDocument.createRange()
  before.selectNodeContents(span)
  before.setEnd(range.startContainer, range.startOffset)
  if (before.toString().length === 0) return { span, edge: 'start' }
  if (before.toString().length === (span.textContent ?? '').length) return { span, edge: 'end' }
  return null
}

/**
 * Frappe au bord d'un spoiler masqué : le texte va à côté, pas dedans (sinon la suite serait masquée).
 * Entrée au bord : la nouvelle ligne ne doit pas hériter du spoiler.
 * Retourne true si l'événement a été pris en charge.
 */
export function redirectEdgeInput(root: HTMLElement, e: InputEvent): boolean {
  const sel = root.ownerDocument.getSelection()
  if (!sel || !sel.rangeCount) return false
  const hit = spoilerEdge(root, sel.getRangeAt(0))
  if (!hit) return false
  const r = root.ownerDocument.createRange()
  if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
    if (hit.edge === 'end') r.setStartAfter(hit.span); else r.setStartBefore(hit.span)
    sel.removeAllRanges()
    sel.addRange(r)
    return false
  }
  if (e.inputType !== 'insertText' || !e.data || hit.span.hasAttribute(REVEALED_ATTR)) return false
  e.preventDefault()
  const sib = hit.edge === 'end' ? hit.span.nextSibling : hit.span.previousSibling
  let text: Text
  if (sib && sib.nodeType === 3) {
    text = sib as Text
    if (hit.edge === 'end') text.insertData(0, e.data); else text.appendData(e.data)
  } else {
    text = root.ownerDocument.createTextNode(e.data)
    hit.span.parentNode!.insertBefore(text, hit.edge === 'end' ? hit.span.nextSibling : hit.span)
  }
  const pos = hit.edge === 'end' ? e.data.length : text.data.length
  r.setStart(text, pos)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
  return true
}
