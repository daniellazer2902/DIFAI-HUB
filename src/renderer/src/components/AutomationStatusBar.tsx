import React, { useState } from 'react'
import { useHub } from '../store'
import { summarizeRuns } from '../automationSummary'
import { countsAsActive } from '../../../shared/runStatus'

/** Ligne d'état des runs, juste au-dessus de Paramètres. Dérivée du store, sans modèle propre. */
export function AutomationStatusBar(): React.JSX.Element | null {
  const runs = useHub((s) => s.runs)
  const groups = useHub((s) => s.groups)
  const [open, setOpen] = useState(false)
  const { active, attention, pending } = summarizeRuns(runs)
  if (active === 0 && pending === 0) return null

  const actifs = Object.values(runs).filter((r) => countsAsActive(r.status))
  const pendingRuns = Object.values(runs).filter((r) => r.status === 'pending')

  const groupOf = (runId: string): string =>
    groups.find((g) => g.items.some((i) => i.kind === 'run' && i.runId === runId))?.name ?? ''

  function goTo(runId: string): void {
    const s = useHub.getState()
    for (const g of s.groups) {
      const item = g.items.find((i) => i.kind === 'run' && i.runId === runId)
      if (item) { s.setActiveGroup(g.id); s.setActiveItem(item.id); return }
    }
  }

  return (
    <div className="auto-bar">
      {pending > 0 && (
        <div className="auto-bar-pending">
          <span className="auto-dot pending" />
          <span className="auto-bar-pending-label">{pending} PR{pending > 1 ? 's' : ''} en attente de feu vert</span>
          <button className="auto-bar-btn" onClick={() => window.hub.automationApprovePending()}>Lancer</button>
          <button className="auto-bar-btn ghost" onClick={() => window.hub.automationDismissPending()}>Écarter</button>
        </div>
      )}
      {pending > 0 && (
        <ul className="auto-bar-list">
          {pendingRuns.map((r) => (
            <li key={r.id} className="auto-bar-pending-item">
              <span className="auto-dot pending" />
              {r.project}/{r.repo} · !{r.prId} {r.title}
            </li>
          ))}
        </ul>
      )}
      {active > 0 && (
        <>
          <button className="auto-bar-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <span className={`auto-dot${attention > 0 ? ' warn' : ''}`} />
            <span>{active} run{active > 1 ? 's' : ''}{attention > 0 ? ` · ${attention} attention` : ''}</span>
          </button>
          {open && (
            <ul className="auto-bar-list">
              {actifs.map((r) => (
                <li key={r.id}>
                  <button onClick={() => goTo(r.id)}>
                    <span className={`auto-dot${r.status === 'attention' ? ' warn' : ''}`} />
                    {groupOf(r.id)} · !{r.prId}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
