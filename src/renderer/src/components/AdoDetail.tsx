import React, { useEffect, useState } from 'react'
import type { AdoWorkItemDetail } from '../../../shared/ipc'
import { sanitizeHtml } from '../sanitize'

interface Props { connId: string; project: string; id: number; onBack: () => void }

function initials(name: string | null): string {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—'
}

/** Détail plein-onglet d'un work item (US ou tâche), lecture seule, avec flèche retour. */
export function AdoDetail({ connId, project, id, onBack }: Props): React.JSX.Element {
  const [detail, setDetail] = useState<AdoWorkItemDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setErr(null); setDetail(null)
    window.hub.adoGetDetail(connId, project, id).then((r) => {
      if (cancelled) return
      if (r.ok) setDetail(r.data); else setErr(r.error ?? 'Erreur de chargement')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [connId, project, id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onBack() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <div className="ado-detail">
      <div className="ado-detail-head">
        <button className="ado-back" title="Retour (Échap)" onClick={onBack}>← Retour</button>
        {detail && <><span className="ado-id">#{detail.id}</span><span className="ado-type">{detail.type}</span><span className="ado-state">{detail.state}</span></>}
      </div>
      {loading && <div className="ado-center"><span className="ado-spinner" /> Chargement…</div>}
      {err && <div className="ado-center">{err}</div>}
      {detail && (
        <div className="ado-detail-body">
          <h1 className="ado-detail-title">{detail.title}</h1>
          <div className="ado-detail-meta">
            <span className="ado-assignee-chip"><span className="ado-chip-ini">{initials(detail.assignedTo)}</span>{detail.assignedTo ?? 'Non assigné'}</span>
            {detail.storyPoints != null && <span className="ado-meta-pill">SP : {detail.storyPoints}</span>}
            {detail.priority != null && <span className="ado-meta-pill">Priorité : {detail.priority}</span>}
          </div>
          {detail.descriptionHtml && (<>
            <div className="ado-detail-section">Description</div>
            <div className="ado-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.descriptionHtml) }} />
          </>)}
          {detail.acceptanceCriteriaHtml && (<>
            <div className="ado-detail-section">Critères d'acceptation</div>
            <div className="ado-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.acceptanceCriteriaHtml) }} />
          </>)}
          <div className="ado-detail-section">Commentaires ({detail.comments.length})</div>
          {detail.comments.length === 0 && <div className="ado-center">Aucun commentaire.</div>}
          {detail.comments.map((c, i) => (
            <div key={i} className="ado-comment">
              <div className="ado-comment-head"><span className="ado-comment-author">{c.author}</span><span className="ado-comment-date">{c.date}</span></div>
              <div className="ado-html ado-comment-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.html) }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
