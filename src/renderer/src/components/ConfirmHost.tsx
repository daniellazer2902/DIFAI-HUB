import React from 'react'
import { useConfirm } from '../confirm'
import { Modal } from './Modal'

/** Rend la confirmation courante du store `useConfirm`. Monté une fois à la racine. */
export function ConfirmHost(): React.JSX.Element | null {
  const spec = useConfirm((s) => s.spec)
  const resolve = useConfirm((s) => s.resolveConfirm)
  if (!spec) return null
  return (
    <Modal
      title={spec.title}
      onClose={() => resolve(false)}
      footer={
        <>
          <button className="btn" onClick={() => resolve(false)}>{spec.cancelLabel ?? 'Annuler'}</button>
          <button className={`btn ${spec.danger ? 'danger' : 'primary'}`} onClick={() => resolve(true)}>{spec.confirmLabel ?? 'Confirmer'}</button>
        </>
      }
    >
      {spec.message && <p className="modal-msg">{spec.message}</p>}
      {spec.items && spec.items.length > 0 && (
        <ul className="modal-list">{spec.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      )}
    </Modal>
  )
}
