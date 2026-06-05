import { useEffect } from 'react'
import type { AdoWorkItem } from '../../../shared/ipc'

interface Props { story: AdoWorkItem; tasks: AdoWorkItem[]; onClose: () => void }

/** Drawer de détail d'une User Story (lecture seule, lot 4.3) : champs + tâches enfants. */
export function AdoStoryDetail({ story, tasks, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="ado-drawer-backdrop" onClick={onClose}>
      <div className="ado-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="ado-drawer-head">
          <span className="ado-id">#{story.id}</span>
          <span className="ado-state">{story.state}</span>
          <button className="ado-drawer-x" title="Fermer" onClick={onClose}>✕</button>
        </div>
        <h3 className="ado-drawer-title">{story.title}</h3>
        <div className="ado-drawer-meta">
          <span>{story.type}</span>
          <span>Assigné : {story.assignedTo ?? '—'}</span>
        </div>
        <div className="ado-drawer-section">Tâches ({tasks.length})</div>
        {tasks.length === 0 && <div className="ado-center">Aucune tâche.</div>}
        {tasks.map((t) => (
          <div key={t.id} className="ado-drawer-task">
            <span className="ado-id">#{t.id}</span>
            <span className="ado-title">{t.title}</span>
            <span className="ado-state">{t.state}</span>
            <span className="ado-assignee">{t.assignedTo ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
