import { useHub, type Item } from './store'
import { memoSync } from './memoSync'
import { confirm } from './confirm'

/** Supprime un mémo après confirmation (le contenu est perdu définitivement). */
export async function deleteMemoItem(item: Item): Promise<boolean> {
  const ok = await confirm({
    title: `Supprimer le mémo « ${item.name} » ?`,
    message: 'Son contenu sera définitivement perdu.',
    confirmLabel: 'Supprimer',
    danger: true
  })
  if (!ok) return false
  memoSync.remove(item.id)
  useHub.getState().removeItem(item.id)
  return true
}
