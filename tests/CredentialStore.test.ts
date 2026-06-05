import { describe, it, expect } from 'vitest'
import { CredentialStore } from '../src/main/ado/CredentialStore'

function fakeSafe() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('enc:' + s),
    decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '')
  }
}
function fakeFs() {
  const mem = new Map<string, string>()
  return {
    mem,
    readFileSync: (p: string) => { if (!mem.has(p)) throw new Error('ENOENT'); return mem.get(p)! },
    writeFileSync: (p: string, d: string) => { mem.set(p, d) }
  }
}

describe('CredentialStore', () => {
  it('round-trip set/get d\'un PAT', () => {
    const fs = fakeFs()
    const cs = new CredentialStore('C:/userData', fakeSafe() as never, fs as never)
    cs.set('c1', 'secret-pat')
    expect(new CredentialStore('C:/userData', fakeSafe() as never, fs as never).get('c1')).toBe('secret-pat')
  })
  it('delete retire le PAT', () => {
    const fs = fakeFs()
    const cs = new CredentialStore('C:/userData', fakeSafe() as never, fs as never)
    cs.set('c1', 'p'); cs.delete('c1')
    expect(cs.get('c1')).toBeNull()
  })
  it('get inconnu => null', () => {
    const cs = new CredentialStore('C:/userData', fakeSafe() as never, fakeFs() as never)
    expect(cs.get('nope')).toBeNull()
  })
})
