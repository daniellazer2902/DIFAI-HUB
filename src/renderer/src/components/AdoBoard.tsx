import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useHub, adoCacheKey, type Item, type Group } from '../store'
import type { AdoBoard as Board, AdoIteration, AdoWorkItem } from '../../../shared/ipc'
import { AdoStoryDetail } from './AdoStoryDetail'
import { itemMatches, storyVisible } from '../adoFind'
import { Hl } from './Hl'
import { TaskBoardView } from './TaskBoardView'
import { filterBoardByAssignee } from '../adoBoard'

interface Props { item: Item; group: Group }

export function AdoBoard({ item, group }: Props): React.JSX.Element {
  const ado = item.ado ?? { view: 'tree' as const, iterationPath: null }
  const bind = group.ado
  const cacheKey = adoCacheKey(item.id, ado.iterationPath)
  const cached = useHub((s) => s.adoCache[cacheKey])
  const board = cached?.board ?? null
  const find = useHub((s) => s.adoFind[item.id])

  const [iterations, setIterations] = useState<AdoIteration[]>([])
  const [iterReady, setIterReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [compact, setCompact] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const findInputRef = useRef<HTMLInputElement>(null)
  const findBarRef = useRef<HTMLDivElement>(null)

  const query = find?.open ? find.query : ''
  const filter = !!find?.open && find.filter

  const [assignee, setAssignee] = useState('')
  const assignees = React.useMemo(() => {
    if (!board) return [] as string[]
    const set = new Set<string>()
    for (const s of board.stories) if (s.assignedTo) set.add(s.assignedTo)
    for (const list of Object.values(board.tasksByParent)) for (const t of list) if (t.assignedTo) set.add(t.assignedTo)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [board])
  const viewBoard = React.useMemo(() => (board ? filterBoardByAssignee(board, assignee || null) : null), [board, assignee])

  const load = useCallback(async () => {
    if (!bind) return
    setRefreshing(true); setErr(null)
    const r = await window.hub.adoListBoard({ connId: bind.connId, project: bind.project, team: bind.team ?? undefined, iterationPath: ado.iterationPath ?? undefined })
    setRefreshing(false)
    if (r.ok) useHub.getState().setAdoCache(cacheKey, r.data)
    else setErr(r.error ?? 'Erreur de chargement')
  }, [bind, ado.iterationPath, cacheKey])

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

  const canLoad = iterReady || ado.iterationPath !== null
  useEffect(() => { if (canLoad) load() }, [load, canLoad])

  // Focus l'input à l'ouverture de la recherche.
  useEffect(() => { if (find?.open) findInputRef.current?.focus() }, [find?.open])
  // Replie les actions (↑↓ / œil / ✕) dans un « ⋯ » quand la barre est étroite.
  useEffect(() => {
    if (!find?.open) return
    const el = findBarRef.current
    if (!el) return
    const update = (): void => setCompact(el.clientWidth < 340)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [find?.open])
  useEffect(() => { if (!compact) setMoreOpen(false) }, [compact])
  // Réinitialise la position active quand la requête / le filtre change.
  useEffect(() => { setActiveIdx(0) }, [query, filter])
  // Met à jour le compteur + la correspondance active (scroll) après rendu.
  useEffect(() => {
    const root = contentRef.current
    const marks = root ? (Array.from(root.querySelectorAll('mark.ado-hl')) as HTMLElement[]) : []
    setMatchCount(marks.length)
    marks.forEach((m, i) => m.classList.toggle('active', i === activeIdx))
    if (marks[activeIdx]) marks[activeIdx].scrollIntoView({ block: 'center' })
  }, [query, filter, activeIdx, ado.view, board, item.id])

  const closeFind = (): void => useHub.getState().setAdoFind(item.id, { open: false })
  const go = (d: number): void => setActiveIdx((i) => (matchCount ? (i + d + matchCount) % matchCount : 0))

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
        <select className="ado-assignee-filter" value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Filtrer par personne assignée">
          <option value="">— toutes les personnes —</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn ado-refresh" onClick={load} disabled={refreshing} title="Rafraîchir">
          <span className={refreshing ? 'ado-spin-ico' : ''}>↻</span>
        </button>
        {refreshing && board && <span className="ado-refresh-dot" title="Mise à jour en cours…" />}
      </div>

      {find?.open && (
        <div className="ado-find-bar" ref={findBarRef}>
          <input
            ref={findInputRef}
            className="ado-find-input"
            placeholder="Rechercher dans le board…"
            value={find.query}
            onChange={(e) => useHub.getState().setAdoFind(item.id, { query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1) }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind() }
            }}
          />
          <span className="ado-find-count">{matchCount ? `${Math.min(activeIdx + 1, matchCount)}/${matchCount}` : (find.query ? '0' : '')}</span>
          {compact ? (
            <div className="ado-find-more">
              <button className="btn ado-find-btn" title="Options de recherche" onClick={() => setMoreOpen((o) => !o)}>⋯</button>
              {moreOpen && (
                <div className="ado-find-more-menu" onClick={(e) => e.stopPropagation()}>
                  <div className={!matchCount ? 'disabled' : ''} onClick={() => matchCount && go(-1)}>↑ Précédent</div>
                  <div className={!matchCount ? 'disabled' : ''} onClick={() => matchCount && go(1)}>↓ Suivant</div>
                  <div onClick={() => useHub.getState().setAdoFind(item.id, { filter: !find.filter })}>{filter ? '✓ ' : ''}Filtrer (œil)</div>
                  <div onClick={() => { setMoreOpen(false); closeFind() }}>✕ Fermer</div>
                </div>
              )}
            </div>
          ) : (
            <>
              <button className="btn ado-find-btn" title="Précédent" disabled={!matchCount} onClick={() => go(-1)}>↑</button>
              <button className="btn ado-find-btn" title="Suivant" disabled={!matchCount} onClick={() => go(1)}>↓</button>
              <button
                className={`btn ado-eye${filter ? ' on' : ''}`}
                title={filter ? 'Filtre actif : seules les correspondances sont affichées' : 'Filtrer : masquer les éléments sans correspondance'}
                onClick={() => useHub.getState().setAdoFind(item.id, { filter: !find.filter })}
              >
                <EyeIcon off={!filter} />
              </button>
              <button className="btn ado-find-btn" title="Fermer (Échap)" onClick={closeFind}>✕</button>
            </>
          )}
        </div>
      )}

      {err && <div className="ado-board-err">{err} <button className="btn" onClick={load}>Réessayer</button></div>}
      <div className="ado-content" ref={contentRef}>
        {viewBoard
          ? (ado.view === 'board'
              ? <TaskBoardView board={viewBoard} q={query} filter={filter} onOpen={setDetailId} />
              : <TreeView board={viewBoard} q={query} filter={filter} />)
          : refreshing
            ? <div className="ado-center"><span className="ado-spinner" /> Chargement du board…</div>
            : !err && <div className="ado-center">Aucune donnée.</div>}
      </div>
      {detailId !== null && board && (() => {
        const s = board.stories.find((x) => x.id === detailId)
        return s ? <AdoStoryDetail story={s} tasks={board.tasksByParent[s.id] ?? []} onClose={() => setDetailId(null)} /> : null
      })()}
    </div>
  )
}

function EyeIcon({ off }: { off: boolean }): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

interface ViewProps { board: Board; q: string; filter: boolean }

function TreeView({ board, q, filter }: ViewProps): React.JSX.Element {
  const stories = filter && q ? board.stories.filter((s) => storyVisible(s, board.tasksByParent[s.id] ?? [], q)) : board.stories
  if (stories.length === 0) return <div className="ado-center">{q && filter ? 'Aucune correspondance.' : 'Aucune User Story dans ce sprint.'}</div>
  return (
    <div className="ado-tree">
      {stories.map((s) => {
        const all = board.tasksByParent[s.id] ?? []
        const tasks = filter && q && !itemMatches(s, q) ? all.filter((t) => itemMatches(t, q)) : all
        return <StoryRow key={s.id} story={s} tasks={tasks} q={q} />
      })}
    </div>
  )
}

function StoryRow({ story, tasks, q }: { story: AdoWorkItem; tasks: AdoWorkItem[]; q: string }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="ado-story">
      <div className="ado-row story" onClick={() => setOpen((o) => !o)}>
        <span className="ado-caret">{tasks.length ? (open ? '▾' : '▸') : '·'}</span>
        <span className="ado-id"><Hl text={`#${story.id}`} q={q} /></span>
        <span className="ado-title"><Hl text={story.title} q={q} /></span>
        <span className="ado-state"><Hl text={story.state} q={q} /></span>
        <span className="ado-assignee"><Hl text={story.assignedTo ?? '—'} q={q} /></span>
      </div>
      {open && tasks.map((t) => (
        <div key={t.id} className="ado-row task">
          <span className="ado-caret" />
          <span className="ado-id"><Hl text={`#${t.id}`} q={q} /></span>
          <span className="ado-title"><Hl text={t.title} q={q} /></span>
          <span className="ado-state"><Hl text={t.state} q={q} /></span>
          <span className="ado-assignee"><Hl text={t.assignedTo ?? '—'} q={q} /></span>
        </div>
      ))}
    </div>
  )
}

