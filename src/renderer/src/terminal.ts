import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function mountTerminal(container: HTMLElement, tabId: string): Terminal {
  const term = new Terminal({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(container)
  fit.fit()
  window.addEventListener('resize', () => fit.fit())

  // pty -> écran
  window.hub.onData((id, data) => { if (id === tabId) term.write(data) })
  // clavier -> pty
  term.onData((data) => window.hub.sendInput(tabId, data))

  return term
}
