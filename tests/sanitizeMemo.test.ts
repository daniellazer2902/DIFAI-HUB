// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { sanitizeMemo } from '../src/renderer/src/sanitizeMemo'

describe('sanitizeMemo', () => {
  it('garde les styles du mémo', () => {
    const html = '<b>g</b><i>i</i><u>s</u><strike>b</strike><ul><li>x</li></ul><div>l<br></div>'
    expect(sanitizeMemo(html)).toBe(html)
  })

  it('retire scripts, images, styles et attributs', () => {
    const out = sanitizeMemo('<b onclick="x()" style="color:red">a</b><script>alert(1)</script><img src="x" onerror="y()"><style>*{}</style>')
    expect(out).toBe('<b>a</b>')
  })

  it('aplatit les balises inconnues en gardant le texte', () => {
    expect(sanitizeMemo('<span style="font-size:40px">grand <a href="http://x">lien</a></span>')).toBe('grand lien')
  })

  it('convertit les blocs collés (titres, citations) en lignes', () => {
    expect(sanitizeMemo('<h1>Titre</h1><blockquote>cite</blockquote>')).toBe('<div>Titre</div><div>cite</div>')
  })

  it('tolère une entrée vide', () => {
    expect(sanitizeMemo('')).toBe('')
  })
})
