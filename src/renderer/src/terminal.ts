import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function mountTerminal(container: HTMLElement, tabId: string): Terminal {
  const term = new Terminal({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(container)

  const doFit = (): void => {
    try { fit.fit() } catch { /* conteneur pas encore dimensionné */ }
  }
  // Le conteneur n'a pas forcément ses dimensions au moment du open() (fit() calculerait
  // ~1 colonne). On (re)fait le fit dès qu'il obtient/change de taille.
  const ro = new ResizeObserver(() => doFit())
  ro.observe(container)
  requestAnimationFrame(doFit)
  window.addEventListener('resize', doFit)

  // pty -> écran
  window.hub.onData((id, data) => { if (id === tabId) term.write(data) })
  // clavier -> pty
  term.onData((data) => window.hub.sendInput(tabId, data))

  return term
}
