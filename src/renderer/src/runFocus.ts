import { useHub } from './store'

/** Terminaux montés, par tabId : seul moyen de poser le focus clavier depuis l'extérieur du composant. */
const focusers = new Map<string, () => void>()

export function registerTerminal(tabId: string, focus: () => void): () => void {
  focusers.set(tabId, focus)
  return () => { if (focusers.get(tabId) === focus) focusers.delete(tabId) }
}

export function focusTerminal(tabId: string): boolean {
  const focus = focusers.get(tabId)
  if (!focus) return false
  focus()
  return true
}

/**
 * Saute dans l'onglet d'une exécution et pose le focus dans son terminal : sans ce focus,
 * l'utilisateur doit encore cliquer dans la console pour répondre.
 */
export function jumpToRun(runId: string): void {
  const s = useHub.getState()
  for (const g of s.groups) {
    const item = g.items.find((i) => i.kind === 'run' && i.runId === runId)
    if (!item) continue
    s.setActiveGroup(g.id)
    s.setActiveItem(item.id)
    const { tabId } = item
    // Le terminal reste masqué jusqu'au rendu suivant : le focus attend que la sélection soit appliquée.
    if (tabId) setTimeout(() => focusTerminal(tabId), 0)
    return
  }
}
