import React, { useState } from 'react'
import type { AdoBoard as Board, AdoWorkItem } from '../../../shared/ipc'
import { Hl } from './Hl'
import { tasksByState } from '../adoBoard'
import { itemMatches, storyVisible } from '../adoFind'

interface Props { board: Board; q: string; filter: boolean; onOpen: (id: number) => void }

/** Sprint Taskboard façon Azure DevOps : une swimlane par US, colonnes = états des tâches. */
export function TaskBoardView({ board, q, filter, onOpen }: Props): React.JSX.Element {
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  if (board.taskStates.length === 0) return <div className="ado-center">Aucun état de tâche configuré.</div>
  // Colonne US figée (220px) + une colonne par état de tâche.
  const cols = `220px repeat(${board.taskStates.length}, minmax(180px, 1fr))`
  return (
    <div className="ado-taskboard">
      <div className="ado-tb-head" style={{ gridTemplateColumns: cols }}>
        <div className="ado-tb-head-cell swim">User Story</div>
        {board.taskStates.map((st) => <div key={st} className="ado-tb-head-cell">{st}</div>)}
      </div>
      {stories.map((s) => (
        <Swimlane
          key={s.id}
          story={s}
          tasks={board.tasksByParent[s.id] ?? []}
          taskStates={board.taskStates}
          cols={cols}
          q={q}
          filter={filter}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function Swimlane({ story, tasks, taskStates, cols, q, filter, onOpen }: {
  story: AdoWorkItem; tasks: AdoWorkItem[]; taskStates: string[]; cols: string
  q: string; filter: boolean; onOpen: (id: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  // En mode filtre, si l'US ne matche pas, on ne garde que ses tâches qui matchent (comme TreeView).
  const visTasks = filter && q && !itemMatches(story, q) ? tasks.filter((t) => itemMatches(t, q)) : tasks
  const byState = tasksByState(visTasks, taskStates)
  return (
    <div className="ado-swimlane" style={{ gridTemplateColumns: cols }}>
      <div className="ado-swim-head">
        <button className="ado-tb-caret" title={open ? 'Replier' : 'Déplier'} onClick={() => setOpen((o) => !o)}>
          {visTasks.length ? (open ? '▾' : '▸') : '·'}
        </button>
        <button className="ado-card ado-us-card" onClick={() => onOpen(story.id)}>
          <div className="ado-card-title"><Hl text={story.title} q={q} /></div>
          <div className="ado-card-meta">
            <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
            <span className="ado-state"><Hl text={story.state} q={q} /></span>
            <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
          </div>
        </button>
      </div>
      {taskStates.map((st) => (
        <div key={st} className="ado-tb-cell">
          {open && byState[st].map((t) => (
            <button key={t.id} className="ado-card ado-task-card" onClick={() => onOpen(t.id)}>
              <div className="ado-card-title"><Hl text={t.title} q={q} /></div>
              <div className="ado-card-meta">
                <span className="ado-id"><Hl text={`#${t.id}`} q={q} /></span>
                <span className="ado-assignee"><Hl text={t.assignedTo ?? '—'} q={q} /></span>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
