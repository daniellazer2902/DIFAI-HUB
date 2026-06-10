// src/renderer/src/markdown/render.ts
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import { preprocessObsidian } from './obsidian'

export type HrefResolution =
  | { type: 'external'; url: string }
  | { type: 'internal'; path: string }
  | { type: 'missing' }

export interface RenderContext {
  resolveHref(href: string): HrefResolution
}

const md: MarkdownIt = new MarkdownIt({
  html: false,          // pas de HTML brut sauf nos div d'embed (réintroduites ci-dessous via html:true ? non)
  linkify: true,
  breaks: false,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try { return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang }).value}</code></pre>` } catch { /* ignore */ }
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`
  }
})

// On autorise UNIQUEMENT nos blocs d'embed (div data-embed) injectés par le preprocessing.
md.set({ html: true })

// Lien : résolution interne/externe/manquant via le contexte (passé dans env).
const defaultRender = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') ?? ''
  const ctx = (env as { ctx?: RenderContext }).ctx
  const r = ctx ? ctx.resolveHref(href) : { type: 'external' as const, url: href }
  const hrefIdx = token.attrIndex('href')
  if (r.type === 'external') {
    token.attrSet('href', r.url)
  } else if (r.type === 'internal') {
    if (hrefIdx >= 0) token.attrs!.splice(hrefIdx, 1)
    token.attrSet('data-href', r.path)
    token.attrJoin('class', 'md-link')
  } else {
    if (hrefIdx >= 0) token.attrs!.splice(hrefIdx, 1)
    token.attrJoin('class', 'md-link wikilink-missing')
  }
  return defaultRender(tokens, idx, options, env, self)
}

// Image : externe/data conservée ; sinon src différé via data-asset (chargé par le composant).
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]
  const src = token.attrGet('src') ?? ''
  const alt = md.utils.escapeHtml(token.content ?? '')
  if (/^(https?:|data:)/i.test(src)) return `<img src="${md.utils.escapeHtml(src)}" alt="${alt}">`
  return `<img data-asset="${md.utils.escapeHtml(src)}" alt="${alt}">`
}

/** Markdown (avec syntaxe Obsidian) -> HTML non sanitisé (le composant sanitise avant injection). */
export function renderMarkdown(markdown: string, ctx: RenderContext): string {
  return md.render(preprocessObsidian(markdown), { ctx })
}
