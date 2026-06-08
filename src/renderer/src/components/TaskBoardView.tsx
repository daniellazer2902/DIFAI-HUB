import React, { useState } from 'react'
import type { AdoBoard as Board, AdoWorkItem } from '../../../shared/ipc'
import { Hl } from './Hl'
import { tasksByColumn } from '../adoBoard'
import { itemMatches, storyVisible } from '../adoFind'

interface Props { board: Board; q: string; filter: boolean; onOpen: (id: number) => void }

/** Sprint Taskboard façon Azure DevOps : une swimlane par US, colonnes = colonnes du taskboard. */
export function TaskBoardView({ board, q, filter, onOpen }: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  if (board.taskColumns.length === 0) return <div className="ado-center">Aucune colonne de taskboard configurée.</div>

  const cols = `220px repeat(${board.taskColumns.length}, minmax(180px, 1fr))`
  const allCollapsed = stories.every((s) => collapsed.has(s.id))
  const toggleAll = (): void => setCollapsed(allCollapsed ? new Set() : new Set(stories.map((s) => s.id)))
  const toggleOne = (id: number): void => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return (
    <div className="ado-taskboard">
      <div className="ado-tb-head" style={{ gridTemplateColumns: cols }}>
        <div className="ado-tb-head-cell swim">
          <button className="ado-tb-expander" title={allCollapsed ? 'Tout déplier' : 'Tout replier'} onClick={toggleAll}>
            <svg className={`ado-chevron${allCollapsed ? ' down' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 15 12 9 18 15" />
            </svg>
          </button>
        </div>
        {board.taskColumns.map((c) => <div key={c.name} className="ado-tb-head-cell">{c.name}</div>)}
      </div>
      {stories.map((s) => (
        <Swimlane
          key={s.id}
          story={s}
          tasks={board.tasksByParent[s.id] ?? []}
          taskColumns={board.taskColumns}
          cols={cols}
          open={!collapsed.has(s.id)}
          onToggle={() => toggleOne(s.id)}
          q={q}
          filter={filter}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function Swimlane({ story, tasks, taskColumns, cols, open, onToggle, q, filter, onOpen }: {
  story: AdoWorkItem; tasks: AdoWorkItem[]; taskColumns: Board['taskColumns']; cols: string
  open: boolean; onToggle: () => void; q: string; filter: boolean; onOpen: (id: number) => void
}): React.JSX.Element {
  const visTasks = filter && q && !itemMatches(story, q) ? tasks.filter((t) => itemMatches(t, q)) : tasks

  if (!open) {
    return (
      <div className="ado-swimlane collapsed">
        <button className="ado-tb-caret" title="Déplier" onClick={onToggle}>▸</button>
        <button className="ado-swim-line" onClick={() => onOpen(story.id)}>
          <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
          <span className="ado-title"><Hl text={story.title} q={q} /></span>
          <span className="ado-state"><Hl text={story.state} q={q} /></span>
          <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
        </button>
      </div>
    )
  }

  const byColumn = tasksByColumn(visTasks, taskColumns)
  return (
    <div className="ado-swimlane" style={{ gridTemplateColumns: cols }}>
      <div className="ado-swim-head">
        <button className="ado-tb-caret" title="Replier" onClick={onToggle}>{visTasks.length ? '▾' : '·'}</button>
        <button className="ado-card ado-us-card" onClick={() => onOpen(story.id)}>
          <div className="ado-card-title"><Hl text={story.title} q={q} /></div>
          <div className="ado-card-meta">
            <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
            <span className="ado-state"><Hl text={story.state} q={q} /></span>
            <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
          </div>
        </button>
      </div>
      {taskColumns.map((c) => (
        <div key={c.name} className="ado-tb-cell">
          {byColumn[c.name].map((t) => (
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
