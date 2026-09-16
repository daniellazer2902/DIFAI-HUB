import React, { useEffect } from 'react'

interface Props {
  title: string
  children?: React.ReactNode
  footer?: React.ReactNode
  onClose?: () => void
  /** Boîte élargie et redimensionnable, pour un contenu que la largeur par défaut serre trop. */
  wide?: boolean
}

/** Shell de modale présentationnel : overlay + boîte centrée, ferme sur Échap / clic backdrop. */
export function Modal({ title, children, footer, onClose, wide }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-title">{title}</div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
