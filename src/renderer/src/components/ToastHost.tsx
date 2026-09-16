import React, { useEffect } from 'react'
import { useToasts, dismissToast, isPersistent, AUTO_DISMISS_MS, type Toast } from '../toasts'
import { jumpToRun } from '../runFocus'

function ToastCard({ t }: { t: Toast }): React.JSX.Element {
  useEffect(() => {
    if (isPersistent(t.level)) return
    const h = setTimeout(() => dismissToast(t.id), AUTO_DISMISS_MS)
    return () => clearTimeout(h)
  }, [t.id, t.level])

  return (
    <div
      className={`toast ${t.level}`}
      role="status"
      tabIndex={0}
      onClick={() => { if (t.runId) jumpToRun(t.runId); dismissToast(t.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (t.runId) jumpToRun(t.runId); dismissToast(t.id) } }}
    >
      <div className="toast-title">{t.title}</div>
      {t.body && <div className="toast-body">{t.body}</div>}
    </div>
  )
}

/** Pile de notifications en haut à droite. Montée une fois à la racine. */
export function ToastHost(): React.JSX.Element | null {
  const list = useToasts((s) => s.list)
  if (list.length === 0) return null
  return <div className="toast-host">{list.map((t) => <ToastCard key={t.id} t={t} />)}</div>
}
