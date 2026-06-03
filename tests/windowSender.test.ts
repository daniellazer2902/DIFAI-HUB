import { describe, it, expect, vi } from 'vitest'
import { WindowSender } from '../src/main/WindowSender'

function fakeWin(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: vi.fn() }
  }
}

describe('WindowSender', () => {
  it('envoie au webContents de la fenêtre courante', () => {
    const win = fakeWin()
    const s = new WindowSender()
    s.setWindow(win as never)
    s.send('chan', 'a', 1)
    expect(win.webContents.send).toHaveBeenCalledWith('chan', 'a', 1)
  })

  it('ne fait rien si aucune fenêtre', () => {
    const s = new WindowSender()
    expect(() => s.send('chan', 'x')).not.toThrow()
  })

  it('ne fait rien si la fenêtre est détruite', () => {
    const win = fakeWin(true)
    const s = new WindowSender()
    s.setWindow(win as never)
    s.send('chan', 'x')
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
