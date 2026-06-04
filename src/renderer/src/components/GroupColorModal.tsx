import React, { useState } from 'react'
import { Modal } from './Modal'
import { PALETTE, darken, textOn } from '../color'

interface Props {
  current: string | null
  onPick: (color: string | null) => void
  onClose: () => void
}

export function GroupColorModal({ current, onPick, onClose }: Props): React.JSX.Element {
  const [pending, setPending] = useState<string | null>(current)
  const preview = pending ?? '#2a2a2a'
  const dark = darken(preview)
  return (
    <Modal
      title="Couleur du groupe"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => { onPick(null); onClose() }}>Retirer la couleur</button>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={() => { onPick(pending); onClose() }}>Appliquer</button>
        </>
      }
    >
      <div className="swatches">
        {PALETTE.map((c) => (
          <button key={c} className={`swatch${pending === c ? ' sel' : ''}`} style={{ background: c }} title={c} onClick={() => setPending(c)} />
        ))}
      </div>
      <div className="color-wheel-row">
        <label>Personnalisée</label>
        <input type="color" value={pending ?? '#3a7bd0'} onChange={(e) => setPending(e.target.value)} />
      </div>
      <div className="color-preview">
        <div className="cp-head" style={{ background: preview, color: textOn(preview) }}>Aperçu groupe</div>
        <div className="cp-item" style={{ background: preview, color: textOn(preview) }}>item au repos</div>
        <div className="cp-item" style={{ background: dark, color: textOn(dark) }}>item survol / sélection</div>
      </div>
    </Modal>
  )
}
