import { useEffect, useState, useCallback } from 'react'
import { useHub, type Item, type Group } from '../store'
import type { AdoBoard as Board, AdoIteration, AdoWorkItem } from '../../../shared/ipc'

interface Props { item: Item; group: Group }

export function AdoBoard({ item, group }: Props): React.JSX.Element {
  const ado = item.ado ?? { view: 'tree' as const, iterationPath: null }
  const bind = group.ado
  const [iterations, setIterations] = useState<AdoIteration[]>([])
  const [board, setBoard] = useState<Board | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!bind) return
    setLoading(true); setErr(null)
    const r = await window.hub.adoListBoard({ connId: bind.connId, project: bind.project, team: bind.team ?? undefined, iterationPath: ado.iterationPath ?? undefined })
    setLoading(false)
    if (r.ok) setBoard(r.data); else setErr(r.error ?? 'Erreur de chargement')
  }, [bind, ado.iterationPath])

  useEffect(() => {
    if (!bind) return
    window.hub.adoListIterations(bind.connId, bind.project, bind.team ?? undefined).then((r) => {
      if (r.ok) {
        setIterations(r.data)
        if (!ado.iterationPath) {
          const cur = r.data.find((i) => i.current)
          if (cur) useHub.getState().setAdoIteration(item.id, cur.path)
        }
      }
    })
  }, [bind, item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  if (!bind) return <div className="ado-board empty">Groupe non configuré pour ADO. Menu ··· du groupe › Configurer ADO…</div>

  return (
    <div className="ado-board">
      <div className="ado-board-bar">
        <div className="ado-view-toggle">
          <button className={ado.view === 'tree' ? 'sel' : ''} onClick={() => useHub.getState().setAdoView(item.id, 'tree')}>Arborescence</button>
          <button className={ado.view === 'board' ? 'sel' : ''} onClick={() => useHub.getState().setAdoView(item.id, 'board')}>Board</button>
        </div>
        <select value={ado.iterationPath ?? ''} onChange={(e) => useHub.getState().setAdoIteration(item.id, e.target.value || null)}>
          <option value="">— tout le projet —</option>
          {iterations.map((i) => <option key={i.id} value={i.path}>{i.name}{i.current ? ' (courant)' : ''}</option>)}
        </select>
        <button className="btn" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
      </div>
      {err && <div className="ado-board-err">{err} <button className="btn" onClick={load}>Réessayer</button></div>}
      {ado.view === 'board'
        ? <div className="ado-board empty">Vue board — sous-lot 4.3</div>
        : <TreeView board={board} />}
    </div>
  )
}

function TreeView({ board }: { board: Board | null }): React.JSX.Element {
  if (!board) return <div className="ado-tree-empty">Aucune donnée.</div>
  return (
    <div className="ado-tree">
      {board.stories.map((s) => <StoryRow key={s.id} story={s} tasks={board.tasksByParent[s.id] ?? []} />)}
      {board.stories.length === 0 && <div className="ado-tree-empty">Aucune User Story dans ce sprint.</div>}
    </div>
  )
}

function StoryRow({ story, tasks }: { story: AdoWorkItem; tasks: AdoWorkItem[] }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="ado-story">
      <div className="ado-row story" onClick={() => setOpen((o) => !o)}>
        <span className="ado-caret">{tasks.length ? (open ? '▾' : '▸') : '·'}</span>
        <span className="ado-id">#{story.id}</span>
        <span className="ado-title">{story.title}</span>
        <span className="ado-state">{story.state}</span>
        <span className="ado-assignee">{story.assignedTo ?? '—'}</span>
      </div>
      {open && tasks.map((t) => (
        <div key={t.id} className="ado-row task">
          <span className="ado-caret" />
          <span className="ado-id">#{t.id}</span>
          <span className="ado-title">{t.title}</span>
          <span className="ado-state">{t.state}</span>
          <span className="ado-assignee">{t.assignedTo ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}
