// tests/noteAssets.test.ts
import { describe, it, expect } from 'vitest'
import { mimeForExt, toDataUri } from '../src/main/notes/assets'

describe('mimeForExt', () => {
  it('mappe les extensions image courantes', () => {
    expect(mimeForExt('.png')).toBe('image/png')
    expect(mimeForExt('.JPG')).toBe('image/jpeg')
    expect(mimeForExt('.svg')).toBe('image/svg+xml')
    expect(mimeForExt('.webp')).toBe('image/webp')
  })
  it('renvoie null pour une extension non supportée', () => {
    expect(mimeForExt('.exe')).toBeNull()
  })
})

describe('toDataUri', () => {
  it('encode mime + base64', () => {
    expect(toDataUri('image/png', Buffer.from('AB'))).toBe('data:image/png;base64,QUI=')
  })
})
