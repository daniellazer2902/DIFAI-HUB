// tests/markdownRender.test.ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown, type RenderContext } from '../src/renderer/src/markdown/render'

const ctx: RenderContext = {
  resolveHref(href) {
    if (/^https?:/.test(href)) return { type: 'external', url: href }
    if (href.startsWith('wikilink:')) {
      const t = decodeURI(href.slice('wikilink:'.length))
      return t === 'Connue' ? { type: 'internal', path: '/v/Connue.md' } : { type: 'missing' }
    }
    return { type: 'internal', path: '/v/' + href }
  }
}

describe('renderMarkdown', () => {
  it('rend les tables GFM', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', ctx)
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })
  it('transforme un wikilink connu en data-href', () => {
    const html = renderMarkdown('[x](wikilink:Connue)', ctx)
    expect(html).toContain('data-href="/v/Connue.md"')
    expect(html).not.toContain('href="wikilink:')
  })
  it('marque un wikilink manquant', () => {
    const html = renderMarkdown('[x](wikilink:Absente)', ctx)
    expect(html).toContain('wikilink-missing')
  })
  it('garde un lien externe avec son href', () => {
    const html = renderMarkdown('[g](https://g.com)', ctx)
    expect(html).toContain('href="https://g.com"')
  })
  it('rend une image relative en data-asset (src différé)', () => {
    const html = renderMarkdown('![alt](img/x.png)', ctx)
    expect(html).toContain('data-asset="img/x.png"')
    expect(html).not.toContain('src="img/x.png"')
  })
  it('applique le preprocessing Obsidian (frontmatter retiré)', () => {
    const html = renderMarkdown('---\nt: 1\n---\n# Titre', ctx)
    expect(html).toContain('<h1')
    expect(html).not.toContain('t: 1')
  })
})
