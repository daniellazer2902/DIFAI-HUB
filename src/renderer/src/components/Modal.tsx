import React, { useEffect } from 'react'

interface Props {
  title: string
  children?: React.ReactNode
  footer?: React.ReactNode
  onClose?: () => void
}

/** Shell de modale présentationnel : overlay + boîte centrée, ferme sur Échap / clic backdrop. */
export function Modal({ title, children, footer, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-title">{title}</div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
