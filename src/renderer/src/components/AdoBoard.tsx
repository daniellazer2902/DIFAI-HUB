import { useEffect, useState, useCallback } from 'react'
import { useHub, adoCacheKey, type Item, type Group } from '../store'
import type { AdoBoard as Board, AdoIteration, AdoWorkItem } from '../../../shared/ipc'

interface Props { item: Item; group: Group }

export function AdoBoard({ item, group }: Props): React.JSX.Element {
  const ado = item.ado ?? { view: 'tree' as const, iterationPath: null }
  const bind = group.ado
  const cacheKey = adoCacheKey(item.id, ado.iterationPath)
  const cached = useHub((s) => s.adoCache[cacheKey])
  const board = cached?.board ?? null

  const [iterations, setIterations] = useState<AdoIteration[]>([])
  const [iterReady, setIterReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Stale-while-revalidate : on affiche le cache (s'il existe) et on rafraîchit en arrière-plan.
  const load = useCallback(async () => {
    if (!bind) return
    setRefreshing(true); setErr(null)
    const r = await window.hub.adoListBoard({ connId: bind.connId, project: bind.project, team: bind.team ?? undefined, iterationPath: ado.iterationPath ?? undefined })
    setRefreshing(false)
    if (r.ok) useHub.getState().setAdoCache(cacheKey, r.data)
    else setErr(r.error ?? 'Erreur de chargement')
  }, [bind, ado.iterationPath, cacheKey])

  // Liste des sprints + auto-sélection du sprint courant si aucun n'est choisi.
  useEffect(() => {
    if (!bind) { setIterReady(true); return }
    let cancelled = false
    window.hub.adoListIterations(bind.connId, bind.project, bind.team ?? undefined).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setIterations(r.data)
        if (!ado.iterationPath) {
          const cur = r.data.find((i) => i.current)
          if (cur) useHub.getState().setAdoIteration(item.id, cur.path)
        }
      }
      setIterReady(true)
    })
    return () => { cancelled = true }
  }, [bind, item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // On ne lance l'appel qu'une fois le sprint par défaut résolu (évite un fetch "tout le projet" inutile au 1er rendu).
  const canLoad = iterReady || ado.iterationPath !== null
  useEffect(() => { if (canLoad) load() }, [load, canLoad])

  if (!bind) return <div className="ado-board"><div className="ado-center">Groupe non configuré pour ADO. Menu ··· du groupe › Configurer ADO…</div></div>

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
        <button className="btn ado-refresh" onClick={load} disabled={refreshing} title="Rafraîchir">
          <span className={refreshing ? 'ado-spin-ico' : ''}>↻</span>
        </button>
        {/* Mise à jour en arrière-plan alors qu'on affiche déjà le cache. */}
        {refreshing && board && <span className="ado-refresh-dot" title="Mise à jour en cours…" />}
      </div>
      {err && <div className="ado-board-err">{err} <button className="btn" onClick={load}>Réessayer</button></div>}
      <div className="ado-content">
        {ado.view === 'board'
          ? <div className="ado-center">Vue board — sous-lot 4.3</div>
          : board
            ? <TreeView board={board} />
            : refreshing
              ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
              : !err && <div className="ado-center">Aucune donnée.</div>}
      </div>
    </div>
  )
}

function TreeView({ board }: { board: Board }): React.JSX.Element {
  return (
    <div className="ado-tree">
      {board.stories.map((s) => <StoryRow key={s.id} story={s} tasks={board.tasksByParent[s.id] ?? []} />)}
      {board.stories.length === 0 && <div className="ado-center">Aucune User Story dans ce sprint.</div>}
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
