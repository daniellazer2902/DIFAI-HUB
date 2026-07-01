import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { resolveMdPath } from '../src/main/notes/resolveMd'

describe('resolveMdPath', () => {
  it('résout un relatif .md existant contre cwd', () => {
    const cwd = resolve('/proj')
    const abs = resolveMdPath(cwd, 'docs/r.md', () => true)
    expect(abs).toBe(resolve(cwd, 'docs/r.md'))
  })
  it('accepte un absolu .md existant', () => {
    const abs = resolve('/proj/x.markdown')
    expect(resolveMdPath('/whatever', abs, () => true)).toBe(abs)
  })
  it('null si non .md même si existant', () => {
    expect(resolveMdPath('/proj', 'script.ts', () => true)).toBeNull()
  })
  it('null si fichier absent', () => {
    expect(resolveMdPath('/proj', 'docs/r.md', () => false)).toBeNull()
  })
})
