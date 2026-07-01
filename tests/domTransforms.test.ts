// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { transformCallouts, transformTaskLists } from '../src/renderer/src/markdown/domTransforms'

function el(html: string): HTMLElement {
  const d = new DOMParser().parseFromString(html, 'text/html')
  return d.body
}

describe('transformCallouts', () => {
  it('convertit un blockquote [!note] en div.callout', () => {
    const root = el('<blockquote><p>[!note] Titre\ncorps</p></blockquote>')
    transformCallouts(root)
    const c = root.querySelector('.callout')
    expect(c).not.toBeNull()
    expect(c!.classList.contains('callout-note')).toBe(true)
    expect(root.querySelector('.callout-title')!.textContent).toBe('Titre')
  })
  it('laisse un blockquote normal intact', () => {
    const root = el('<blockquote><p>citation</p></blockquote>')
    transformCallouts(root)
    expect(root.querySelector('.callout')).toBeNull()
    expect(root.querySelector('blockquote')).not.toBeNull()
  })
})

describe('transformTaskLists', () => {
  it('convertit [ ] et [x] en checkboxes désactivées', () => {
    const root = el('<ul><li>[ ] à faire</li><li>[x] fait</li></ul>')
    transformTaskLists(root)
    const boxes = root.querySelectorAll('input[type="checkbox"]')
    expect(boxes.length).toBe(2)
    expect((boxes[1] as HTMLInputElement).hasAttribute('checked')).toBe(true)
  })
})
