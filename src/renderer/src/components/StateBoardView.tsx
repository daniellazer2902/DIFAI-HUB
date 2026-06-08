import React from 'react'
import type { AdoBoard as Board } from '../../../shared/ipc'
import { Hl } from './Hl'
import { storyVisible } from '../adoFind'

interface Props { board: Board; q: string; filter: boolean; onOpen: (id: number) => void }

/**
 * Vue cartes : une carte par US, groupées par état d'US.
 * Conservée pour les futurs types validation UX / devtest (lot ultérieur).
 */
export function StateBoardView({ board, q, filter, onOpen }: Props): React.JSX.Element {
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  return (
    <div className="ado-cols">
      {board.states.map((state) => {
        const cards = stories.filter((s) => s.state === state)
        return (
          <div key={state} className="ado-col">
            <div className="ado-col-head">{state} <span className="ado-col-count">{cards.length}</span></div>
            <div className="ado-col-body">
              {cards.map((s) => (
                <button key={s.id} className="ado-card" onClick={() => onOpen(s.id)}>
                  <div className="ado-card-title"><Hl text={s.title} q={q} /></div>
                  <div className="ado-card-meta">
                    <span className="ado-id"><Hl text={`#${s.id}`} q={q} /></span>
                    <span className="ado-card-tasks">{s.childCount} tâche{s.childCount > 1 ? 's' : ''}</span>
                    <span className="ado-assignee"><Hl text={s.assignedTo ?? '—'} q={q} /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
