import { describe, it, expect, vi } from 'vitest'
import { PtyManager, type PtyProcess, type SpawnOptions } from '../src/main/PtyManager'

function fakePty() {
  const handlers: { data: ((d: string) => void)[]; exit: ((e: { exitCode: number }) => void)[] } = { data: [], exit: [] }
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: (cb: (d: string) => void) => handlers.data.push(cb),
    onExit: (cb: (e: { exitCode: number }) => void) => handlers.exit.push(cb),
    _emitData: (d: string) => handlers.data.forEach((h) => h(d)),
    _emitExit: (code: number) => handlers.exit.forEach((h) => h({ exitCode: code }))
  }
}

function fakeSpawn() {
  const handlers: { data?: (d: string) => void; exit?: (e: { exitCode: number }) => void } = {}
  const proc: PtyProcess = {
    write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    onData: (cb) => { handlers.data = cb },
    onExit: (cb) => { handlers.exit = cb }
  }
  const spawn = (_f: string, _a: string[], _o: SpawnOptions): PtyProcess => proc
  return { spawn, handlers }
}

describe('PtyManager multi-listeners', () => {
  it('diffuse onExit à TOUS les abonnés', () => {
    const { spawn, handlers } = fakeSpawn()
    const m = new PtyManager({ spawn, claudePath: 'claude' })
    const a = vi.fn(); const b = vi.fn()
    m.onExit(a); m.onExit(b)
    m.create('C:/x')
    handlers.exit?.({ exitCode: 0 })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('onData renvoie un Unsub qui retire le listener', () => {
    const { spawn, handlers } = fakeSpawn()
    const m = new PtyManager({ spawn, claudePath: 'claude' })
    const a = vi.fn()
    const unsub = m.onData(a)
    m.create('C:/x')
    handlers.data?.('hello')
    unsub()
    handlers.data?.('world')
    expect(a).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(expect.any(String), 'hello')
  })
})

describe('PtyManager', () => {
  it('crée une session : spawner reçoit claudePath, args et cwd + DIFAI_HUB_TAB', () => {
    const pty = fakePty()
    const spawn = vi.fn(() => pty)
    const mgr = new PtyManager({ spawn, claudePath: 'C:\\claude.exe' })

    const tabId = mgr.create('C:\\proj', { args: ['--settings', 'C:\\h.json'], env: { DIFAI_HUB_PORT: '7711' } })

    expect(tabId).toBeTruthy()
    const [file, args, opts] = spawn.mock.calls[0]
    expect(file).toBe('C:\\claude.exe')
    expect(args).toEqual(['--settings', 'C:\\h.json'])
    expect(opts.cwd).toBe('C:\\proj')
    expect(opts.env.DIFAI_HUB_TAB).toBe(tabId)
    expect(opts.env.DIFAI_HUB_PORT).toBe('7711')
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

  it('resize transmet les dimensions au bon pty', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const tabId = mgr.create('C:\\p')
    mgr.resize(tabId, 120, 40)
    expect(pty.resize).toHaveBeenCalledWith(120, 40)
  })

  it('kill termine le pty et oublie le tabId', () => {
    const pty = fakePty()
    const mgr = new PtyManager({ spawn: () => pty, claudePath: 'c' })
    const tabId = mgr.create('C:\\p')
    mgr.kill(tabId)
    expect(pty.kill).toHaveBeenCalled()
    expect(mgr.has(tabId)).toBe(false)
  })

  it('killAll tue toutes les ptys et vide la map', () => {
    const ptys = [fakePty(), fakePty()]
    let i = 0
    const mgr = new PtyManager({ spawn: () => ptys[i++], claudePath: 'c' })
    const t1 = mgr.create('C:\\a')
    const t2 = mgr.create('C:\\b')
    mgr.killAll()
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(ptys[1].kill).toHaveBeenCalled()
    expect(mgr.has(t1)).toBe(false)
    expect(mgr.has(t2)).toBe(false)
  })
})
