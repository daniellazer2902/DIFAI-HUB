import { describe, it, expect } from 'vitest'
import { inlineImages } from '../src/main/ado/inlineImages'

describe('inlineImages', () => {
  it('remplace les <img> de pièces jointes ADO par un data URI', async () => {
    const html = '<p>x</p><img src="https://dev.azure.com/o/p/_apis/wit/attachments/guid?fileName=a.png">'
    const out = await inlineImages(html, async () => ({ mime: 'image/png', base64: 'AAAA' }))
    expect(out).toContain('src="data:image/png;base64,AAAA"')
    expect(out).not.toContain('_apis/wit/attachments')
  })
  it('laisse les images externes (hors attachments) intactes', async () => {
    const html = '<img src="https://example.com/x.png">'
    expect(await inlineImages(html, async () => ({ mime: 'image/png', base64: 'Z' }))).toBe(html)
  })
  it('laisse l\'image telle quelle si le fetch renvoie null (échec / trop gros)', async () => {
    const html = '<img src="https://s/_apis/wit/attachments/g?fileName=a.png">'
    expect(await inlineImages(html, async () => null)).toBe(html)
  })
  it('HTML sans image : inchangé', async () => {
    expect(await inlineImages('<p>hi</p>', async () => null)).toBe('<p>hi</p>')
  })
  it('HTML vide : renvoie tel quel', async () => {
    expect(await inlineImages('', async () => null)).toBe('')
  })
})
