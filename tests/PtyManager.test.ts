import { describe, it, expect, vi } from 'vitest'
import { PtyManager } from '../src/main/PtyManager'

function fakePty() {
  const handlers: { data: ((d: string) => void)[]; exit: ((e: { exitCode: number }) => void)[] } = { data: [], exit: [] }
  return {
    write: vi.fn(),
    kill: vi.fn(),
    onData: (cb: (d: string) => void) => handlers.data.push(cb),
    onExit: (cb: (e: { exitCode: number }) => void) => handlers.exit.push(cb),
    _emitData: (d: string) => handlers.data.forEach((h) => h(d)),
    _emitExit: (code: number) => handlers.exit.forEach((h) => h({ exitCode: code }))
  }
}

describe('PtyManager', () => {
  it('crée une session avec un tabId unique et lance le spawner avec cwd + DIFAI_HUB_TAB', () => {
    const pty = fakePty()
    const spawn = vi.fn(() => pty)
    const mgr = new PtyManager({ spawn, claudePath: 'C:\\claude.exe' })

    const tabId = mgr.create('C:\\proj')

    expect(tabId).toBeTruthy()
    expect(spawn).toHaveBeenCalledOnce()
    const opts = spawn.mock.calls[0][1]
    expect(opts.cwd).toBe('C:\\proj')
    expect(opts.env.DIFAI_HUB_TAB).toBe(tabId)
  })

  it('route les données du pty vers le callback onData avec le bon tabId', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const received: { tabId: string; data: string }[] = []
    mgr.onData((tabId, data) => received.push({ tabId, data }))

    const tabId = mgr.create('C:\\p')
    pty._emitData('hello')

    expect(received).toEqual([{ tabId, data: 'hello' }])
  })

  it('write transmet l\'entrée au bon pty', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const tabId = mgr.create('C:\\p')
    mgr.write(tabId, 'ls\r')
    expect(pty.write).toHaveBeenCalledWith('ls\r')
  })

  it('kill termine le pty et oublie le tabId', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const tabId = mgr.create('C:\\p')
    mgr.kill(tabId)
    expect(pty.kill).toHaveBeenCalled()
    expect(mgr.has(tabId)).toBe(false)
  })
})
