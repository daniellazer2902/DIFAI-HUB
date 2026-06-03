import { describe, it, expect, afterEach, vi } from 'vitest'
import { HookServer } from '../src/main/HookServer'

let server: HookServer | null = null
afterEach(() => { server?.stop(); server = null })

describe('HookServer', () => {
  it('démarre sur un port éphémère et transmet le JSON POST à onEvent', async () => {
    const received: unknown[] = []
    server = new HookServer()
    server.onEvent((e) => received.push(e))
    const port = await server.start()
    expect(port).toBeGreaterThan(0)

    const res = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      body: JSON.stringify({ hook_event_name: 'Stop', tabId: 'tab1' })
    })
    expect(res.status).toBe(200)
    expect(received).toEqual([{ hook_event_name: 'Stop', tabId: 'tab1' }])
  })

  it('ignore un body non-JSON sans planter (toujours 200)', async () => {
    const received: unknown[] = []
    server = new HookServer()
    server.onEvent((e) => received.push(e))
    const port = await server.start()
    const res = await fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: 'pas du json' })
    expect(res.status).toBe(200)
    expect(received).toEqual([])
  })
})

describe('HookServer.onEvent', () => {
  it('s\'abonne après construction et reçoit les events dispatchés', () => {
    const srv = new HookServer()
    const seen: unknown[] = []
    srv.onEvent((e) => seen.push(e))
    srv.dispatch({ hook_event_name: 'SessionStart', tabId: 't1' })
    expect(seen).toEqual([{ hook_event_name: 'SessionStart', tabId: 't1' }])
  })

  it('Unsub retire le listener', () => {
    const srv = new HookServer()
    const cb = vi.fn()
    const unsub = srv.onEvent(cb)
    unsub()
    srv.dispatch({ any: 1 })
    expect(cb).not.toHaveBeenCalled()
  })
})
