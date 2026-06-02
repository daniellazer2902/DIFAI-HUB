import { describe, it, expect } from 'vitest'
import { resolveClaudePath } from '../src/main/claudePath'

describe('resolveClaudePath', () => {
  it('retourne le premier .exe d\'une sortie "where" multi-lignes (Windows)', () => {
    const fakeWhere = () => 'C:\\Users\\x\\.local\\bin\\claude.exe\r\nC:\\autre\\claude.bat\r\n'
    expect(resolveClaudePath('win32', fakeWhere)).toBe('C:\\Users\\x\\.local\\bin\\claude.exe')
  })

  it('retourne "claude" tel quel hors Windows', () => {
    const fakeWhere = () => { throw new Error('which appelé à tort') }
    expect(resolveClaudePath('linux', fakeWhere)).toBe('claude')
  })

  it('lève une erreur claire si aucun .exe trouvé', () => {
    const fakeWhere = () => 'C:\\rien\\claude.bat\r\n'
    expect(() => resolveClaudePath('win32', fakeWhere)).toThrow(/claude\.exe introuvable/)
  })
})
