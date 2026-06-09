// src/renderer/src/components/MarkdownView.tsx
import React, { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown, type RenderContext, type HrefResolution } from '../markdown/render'
import { sanitizeMarkdownHtml } from '../sanitizeMarkdown'
import { transformCallouts, transformTaskLists } from '../markdown/domTransforms'
import { dirOf, joinPath } from '../util'

interface Props {
  root: string
  filePath: string
  markdown: string
  index: Record<string, string>
  onOpenInternal: (path: string) => void
  /** Recherche in-page (Ctrl+F) : terme courant, occurrence active, et remontée du nombre de matches. */
  query?: string
  activeIdx?: number
  onMatchCount?: (n: number) => void
}

export function MarkdownView({ root, filePath, markdown, index, onOpenInternal, query = '', activeIdx = 0, onMatchCount }: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const onMatchCountRef = useRef(onMatchCount)
  onMatchCountRef.current = onMatchCount

  const ctx = useMemo<RenderContext>(() => ({
    resolveHref(href: string): HrefResolution {
      if (/^(https?:|mailto:)/i.test(href)) return { type: 'external', url: href }
      if (href.startsWith('wikilink:')) {
        const target = decodeURI(href.slice('wikilink:'.length))
        const key = (target.split('#')[0].split(/[\\/]/).pop() ?? '').replace(/\.(md|markdown)$/i, '').trim().toLowerCase()
        const p = index[key]
        return p ? { type: 'internal', path: p } : { type: 'missing' }
      }
      // lien relatif vers un .md
      return { type: 'internal', path: joinPath(dirOf(filePath), href.split('#')[0]) }
    }
  }), [index, filePath])

  const html = useMemo(() => sanitizeMarkdownHtml(renderMarkdown(markdown, ctx)), [markdown, ctx])

  // Post-rendu : callouts, task lists, images différées, transclusions.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = 0
    transformCallouts(el)
    transformTaskLists(el)

    let cancelled = false
    // Images relatives -> data URI (essaie dossier du fichier puis racine du vault).
    for (const img of Array.from(el.querySelectorAll('img[data-asset]')) as HTMLImageElement[]) {
      const rel = img.getAttribute('data-asset') ?? ''
      const candidates = [joinPath(dirOf(filePath), rel), joinPath(root, rel)]
      void (async () => {
        for (const c of candidates) {
          const r = await window.hub.notesAsset(root, c)
          if (cancelled) return
          if (r.ok) { img.src = r.data.dataUri; img.removeAttribute('data-asset'); return }
        }
        if (!cancelled) img.alt = (img.alt || '') + ' (image introuvable)'
      })()
    }

    // Transclusions de notes (profondeur 1, sans embeds imbriqués).
    for (const div of Array.from(el.querySelectorAll('div.md-embed[data-embed]')) as HTMLDivElement[]) {
      const name = div.getAttribute('data-embed') ?? ''
      const key = name.replace(/\.(md|markdown)$/i, '').trim().toLowerCase()
      const path = index[key]
      if (!path) { div.textContent = `⧉ ${name} (note introuvable)`; div.classList.add('wikilink-missing'); continue }
      void (async () => {
        const r = await window.hub.notesRead(root, path)
        if (cancelled || !r.ok) return
        // Rendu sans transclusion imbriquée : on retire les div.md-embed du HTML produit.
        const inner = sanitizeMarkdownHtml(renderMarkdown(r.data.markdown, ctx))
        const tmp = document.createElement('div')
        tmp.innerHTML = inner
        tmp.querySelectorAll('div.md-embed').forEach((n) => n.remove())
        transformCallouts(tmp); transformTaskLists(tmp)
        div.innerHTML = `<div class="embed-title">⧉ ${escapeText(name)}</div>` + tmp.innerHTML
      })()
    }

    return () => { cancelled = true }
  }, [html, root, filePath, index, ctx])

  // Recherche in-page (Ctrl+F) : surligne les occurrences, marque l'active et scrolle dessus.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const count = applyHighlights(el, query)
    onMatchCountRef.current?.(count)
    const marks = Array.from(el.querySelectorAll('mark.ado-hl'))
    marks.forEach((m, i) => m.classList.toggle('active', i === activeIdx))
    marks[activeIdx]?.scrollIntoView({ block: 'center' })
    return () => clearHighlights(el)
  }, [html, query, activeIdx])

  // Délégation des clics : liens internes / externes / ancres.
  function onClick(e: React.MouseEvent): void {
    const target = e.target as HTMLElement
    const internal = target.closest('[data-href]') as HTMLElement | null
    if (internal) { e.preventDefault(); onOpenInternal(internal.getAttribute('data-href') as string); return }
    const a = target.closest('a[href]') as HTMLAnchorElement | null
    if (a) {
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('#')) {
        e.preventDefault()
        ref.current?.querySelector(`#${CSS.escape(href.slice(1))}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (/^(https?:|mailto:)/i.test(href)) {
        e.preventDefault(); window.hub.notesOpenExternal(href)
      }
    }
  }

  return <div className="md-view" ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Retire tous les <mark.ado-hl> et refusionne les nœuds texte. */
function clearHighlights(root: HTMLElement): void {
  for (const m of Array.from(root.querySelectorAll('mark.ado-hl'))) {
    const parent = m.parentNode
    if (!parent) continue
    while (m.firstChild) parent.insertBefore(m.firstChild, m)
    parent.removeChild(m)
    parent.normalize()
  }
}

/** Surligne chaque occurrence (insensible à la casse) de `query` dans les nœuds texte ; renvoie le nombre de matches. */
function applyHighlights(root: HTMLElement, query: string): number {
  clearHighlights(root)
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const v = node.nodeValue
      if (!v || !v.toLowerCase().includes(q)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  const targets: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) targets.push(n as Text)
  let count = 0
  for (const textNode of targets) {
    const text = textNode.nodeValue as string
    const lower = text.toLowerCase()
    const frag = document.createDocumentFragment()
    let from = 0
    let idx = lower.indexOf(q, from)
    while (idx >= 0) {
      if (idx > from) frag.appendChild(document.createTextNode(text.slice(from, idx)))
      const mark = document.createElement('mark')
      mark.className = 'ado-hl'
      mark.textContent = text.slice(idx, idx + q.length)
      frag.appendChild(mark)
      count++
      from = idx + q.length
      idx = lower.indexOf(q, from)
    }
    if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)))
    textNode.parentNode?.replaceChild(frag, textNode)
  }
  return count
}
