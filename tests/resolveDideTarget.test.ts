// tests/resolveDideTarget.test.ts
import { describe, it, expect } from 'vitest'
import { isAbsolute, join, resolve } from 'node:path'
import { resolveDideTarget } from '../src/main/notes/resolveDideTarget'

// Sur Windows, join('/', 'home', 'proj') produit un chemin drive-relative (\home\proj).
// resolve() lui attache le drive courant. On construit le Set via resolve() pour que
// les chemins attendus soient identiques à ceux produits par resolveDideTarget.
const CWD = resolve(join('/', 'home', 'proj'))
const files = new Set([resolve(CWD, 'out.md'), resolve('/', 'abs', 'x.html')])
const dirs = new Set([resolve(CWD, 'docs')])
const fs = {
  exists: (p: string) => files.has(p) || dirs.has(p),
  isDir: (p: string) => dirs.has(p)
}

describe('resolveDideTarget', () => {
  it('résout un chemin relatif via le cwd (fichier)', () => {
    expect(resolveDideTarget('out.md', CWD, fs)).toEqual({ absPath: resolve(CWD, 'out.md'), isDir: false })
  })
  it('résout un dossier relatif', () => {
    expect(resolveDideTarget('docs', CWD, fs)).toEqual({ absPath: resolve(CWD, 'docs'), isDir: true })
  })
  it('accepte un chemin absolu', () => {
    const p = resolve('/', 'abs', 'x.html')
    expect(resolveDideTarget(p, CWD, fs)).toEqual({ absPath: p, isDir: false })
    expect(isAbsolute(p)).toBe(true)
  })
  it('renvoie null si le chemin n\'existe pas', () => {
    expect(resolveDideTarget('nope.md', CWD, fs)).toBeNull()
  })
})
