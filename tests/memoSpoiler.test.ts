// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { selectionInSpoiler, serializeMemo, toggleSpoiler } from '../src/renderer/src/memoSpoiler'
import { sanitizeMemo } from '../src/renderer/src/sanitizeMemo'

function editor(html: string): HTMLDivElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.replaceChildren(el)
  return el
}
function rangeOn(node: Node, start: number, endNode: Node = node, end = start): Range {
  const r = document.createRange()
  r.setStart(node, start)
  r.setEnd(endNode, end)
  return r
}

describe('toggleSpoiler', () => {
  it('masque la partie sélectionnée d\'une ligne', () => {
    const el = editor('<div>mdp : secret123 ok</div>')
    const t = el.querySelector('div')!.firstChild!
    expect(toggleSpoiler(el, rangeOn(t, 6, t, 15))).toBe(true)
    expect(el.innerHTML).toBe('<div>mdp : <span data-spoiler="">secret123</span> ok</div>')
  })

  it('garde la mise en forme à l\'intérieur', () => {
    const el = editor('<div>a <b>gras</b> z</div>')
    const div = el.querySelector('div')!
    toggleSpoiler(el, rangeOn(div, 0, div, 3))
    expect(el.innerHTML).toBe('<div><span data-spoiler="">a </span><b><span data-spoiler="">gras</span></b><span data-spoiler=""> z</span></div>')
  })

  it('crée un spoiler par ligne sur une sélection multi-lignes', () => {
    const el = editor('<div>un</div><div>deux</div>')
    const [a, b] = Array.from(el.querySelectorAll('div')).map((d) => d.firstChild!)
    toggleSpoiler(el, rangeOn(a, 0, b, 4))
    expect(el.querySelectorAll('div > span[data-spoiler]').length).toBe(2)
  })

  it('démasque si la sélection est déjà en spoiler', () => {
    const el = editor('<div>x <span data-spoiler="">secret</span> y</div>')
    const t = el.querySelector('span')!.firstChild!
    const r = rangeOn(t, 0, t, 6)
    expect(selectionInSpoiler(el, r)).toBe(true)
    toggleSpoiler(el, r)
    expect(el.innerHTML).toBe('<div>x secret y</div>')
  })

  it('caret dans un spoiler : le retire ; ailleurs : ne fait rien', () => {
    const el = editor('<div>x <span data-spoiler="">secret</span></div>')
    expect(toggleSpoiler(el, rangeOn(el.querySelector('div')!.firstChild!, 1))).toBe(false)
    expect(toggleSpoiler(el, rangeOn(el.querySelector('span')!.firstChild!, 2))).toBe(true)
    expect(el.querySelector('span')).toBeNull()
  })
})

describe('persistance du spoiler', () => {
  it('ne sauvegarde jamais l\'état révélé', () => {
    const el = editor('<div><span data-spoiler="" data-revealed="">s</span></div>')
    expect(serializeMemo(el)).toBe('<div><span data-spoiler="">s</span></div>')
    expect(el.querySelector('[data-revealed]')).not.toBeNull()
  })

  it('le nettoyage garde le marqueur et rien d\'autre', () => {
    expect(sanitizeMemo('<span data-spoiler="1" data-revealed="" style="color:red" onclick="x()">s</span>'))
      .toBe('<span data-spoiler="">s</span>')
    expect(sanitizeMemo('<span class="spoiler">s</span>')).toBe('s')
  })
})
