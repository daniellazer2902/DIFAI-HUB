// @vitest-environment jsdom
// tests/sanitizeMarkdown.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeMarkdownHtml } from '../src/renderer/src/sanitizeMarkdown'

describe('sanitizeMarkdownHtml', () => {
  it('supprime script et handlers', () => {
    expect(sanitizeMarkdownHtml('<p onclick="x()">a</p><script>b</script>')).toBe('<p>a</p>')
  })
  it('conserve les tables et le code avec classes', () => {
    const out = sanitizeMarkdownHtml('<pre><code class="hljs language-ts">x</code></pre>')
    expect(out).toContain('class="hljs language-ts"')
    expect(sanitizeMarkdownHtml('<table><tr><td>1</td></tr></table>')).toContain('<td>1</td>')
  })
  it('conserve data-href et retire un href interne', () => {
    const out = sanitizeMarkdownHtml('<a data-href="/v/a.md" class="md-link">a</a>')
    expect(out).toContain('data-href="/v/a.md"')
  })
  it('force target/rel sur les liens externes', () => {
    const out = sanitizeMarkdownHtml('<a href="https://x.com">x</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('conserve les en-têtes H5/H6 et data-embed/data-asset', () => {
    expect(sanitizeMarkdownHtml('<h5>x</h5>')).toBe('<h5>x</h5>')
    expect(sanitizeMarkdownHtml('<img data-asset="a.png" alt="">')).toContain('data-asset="a.png"')
    expect(sanitizeMarkdownHtml('<div data-embed="N"></div>')).toContain('data-embed="N"')
  })
  it('garde les images data: et supprime les images http', () => {
    expect(sanitizeMarkdownHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png')
    expect(sanitizeMarkdownHtml('<img src="http://x/y.png">')).not.toContain('http://x')
  })
})
