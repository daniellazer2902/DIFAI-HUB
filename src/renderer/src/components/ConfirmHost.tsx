import React, { useState } from 'react'
import { useConfirm, type ConfirmSpec } from '../confirm'
import { Modal } from './Modal'

type Resolve = (v: boolean | string | null) => void

function Body({ spec }: { spec: ConfirmSpec }): React.JSX.Element {
  return (
    <>
      {spec.message && <p className="modal-msg">{spec.message}</p>}
      {spec.items && spec.items.length > 0 && (
        <ul className="modal-list">{spec.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      )}
    </>
  )
}

function PromptModal({ spec, resolve }: { spec: ConfirmSpec; resolve: Resolve }): React.JSX.Element {
  const [value, setValue] = useState(spec.input?.initial ?? '')
  return (
    <Modal
      title={spec.title}
      onClose={() => resolve(null)}
      footer={
        <>
          <button className="btn" onClick={() => resolve(null)}>{spec.cancelLabel ?? 'Annuler'}</button>
          <button className="btn primary" onClick={() => resolve(value)}>{spec.confirmLabel ?? 'Confirmer'}</button>
        </>
      }
    >
      <Body spec={spec} />
      <div className="setting-row col">
        <label htmlFor="confirm-input">{spec.input?.label}</label>
        <input
          id="confirm-input"
          autoFocus
          value={value}
          placeholder={spec.input?.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); resolve(value) } }}
        />
      </div>
    </Modal>
  )
}

/** Rend la confirmation courante du store `useConfirm`. Monté une fois à la racine. */
export function ConfirmHost(): React.JSX.Element | null {
  const spec = useConfirm((s) => s.spec)
  const resolve = useConfirm((s) => s.resolveConfirm)
  if (!spec) return null
  if (spec.input) return <PromptModal key={spec.title} spec={spec} resolve={resolve} />
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
      <Body spec={spec} />
    </Modal>
  )
}
