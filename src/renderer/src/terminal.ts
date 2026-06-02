import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function mountTerminal(container: HTMLElement, tabId: string): Terminal {
  const term = new Terminal({ fontFamily: 'Consolas, monospace', fontSize: 13, cursorBlink: true })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(container)

  const doFit = (): void => {
    try {
      fit.fit()
      window.hub.resize(tabId, term.cols, term.rows) // propage la taille réelle au pty
    } catch { /* conteneur pas encore dimensionné */ }
  }
  // Le conteneur n'a pas forcément ses dimensions au moment du open() (fit() calculerait
  // ~1 colonne). On (re)fait le fit dès qu'il obtient/change de taille.
  const ro = new ResizeObserver(() => doFit())
  ro.observe(container)
  requestAnimationFrame(doFit)
  window.addEventListener('resize', doFit)

  // Copier / coller : xterm intercepte les touches, on câble Ctrl/Cmd+V (coller)
  // et Ctrl/Cmd+C (copier UNIQUEMENT s'il y a une sélection — sinon on laisse passer le SIGINT).
  term.attachCustomKeyEventHandler((e): boolean => {
    if (e.type !== 'keydown' || !(e.ctrlKey || e.metaKey)) return true
    const key = e.key.toLowerCase()
    if (key === 'v') {
      navigator.clipboard.readText().then((t) => { if (t) term.paste(t) }).catch(() => {})
      return false
    }
    if (key === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()).catch(() => {})
      return false
    }
    return true
  })

  // pty -> écran
  window.hub.onData((id, data) => { if (id === tabId) term.write(data) })
  // clavier -> pty
  term.onData((data) => window.hub.sendInput(tabId, data))

  return term
}
