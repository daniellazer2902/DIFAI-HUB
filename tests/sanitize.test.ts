// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../src/renderer/src/sanitize'

describe('sanitizeHtml', () => {
  it('supprime script/style/iframe', () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
    expect(sanitizeHtml('<div>a</div><style>x{}</style>')).toBe('<div>a</div>')
  })
  it('retire les handlers on* et neutralise javascript:', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)" onclick="x()">l</a>')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('javascript:')
  })
  it('img : autorise data: et https:, retire le reste', () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png')
    expect(sanitizeHtml('<img src="https://x/y.png">')).toContain('https://x/y.png')
    expect(sanitizeHtml('<img src="http://x/y.png">')).not.toContain('http://x')
  })
  it('déplie les balises hors allowlist en gardant le texte', () => {
    expect(sanitizeHtml('<font color="red">hi</font>')).toBe('hi')
  })
  it('liens http(s) : conserve href + ajoute rel/target', () => {
    const out = sanitizeHtml('<a href="https://x.com">x</a>')
    expect(out).toContain('href="https://x.com"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  it('conserve la structure de tableau et le texte', () => {
    const out = sanitizeHtml('<table><tr><td>1</td></tr></table>')
    expect(out).toContain('<td>1</td>')
  })
})
