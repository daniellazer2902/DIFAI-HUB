import { describe, it, expect } from 'vitest'
import { resolvePowerShellPath } from '../src/main/shellPath'

describe('resolvePowerShellPath', () => {
  it('win32 : renvoie le .exe trouvé par where', () => {
    const where = (): string => 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\r\n'
    expect(resolvePowerShellPath('win32', where, {} as never)).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  })
  it('win32 : fallback System32 si where échoue', () => {
    const where = (): string => { throw new Error('not found') }
    expect(resolvePowerShellPath('win32', where, { SystemRoot: 'C:\\Windows' } as never))
      .toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  })
  it('hors win32 : utilise $SHELL', () => {
    expect(resolvePowerShellPath('linux', (() => '') as never, { SHELL: '/bin/zsh' } as never)).toBe('/bin/zsh')
  })
})
