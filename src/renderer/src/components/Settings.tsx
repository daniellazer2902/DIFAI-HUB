import React from 'react'
import { useHub } from '../store'
import { Modal } from './Modal'
import { AdoConnections } from './AdoConnections'
import { writeSoundEnabled } from '../sound'
import { writeConfirmOnClose, writeGlobalDefaultCwd } from '../settings'

export function Settings({ onClose }: { onClose: () => void }): React.JSX.Element {
  const soundEnabled = useHub((s) => s.soundEnabled)
  const confirmOnClose = useHub((s) => s.confirmOnClose)
  const globalDefaultCwd = useHub((s) => s.globalDefaultCwd)

  function toggleSound(): void { const v = !soundEnabled; useHub.getState().setSoundEnabled(v); writeSoundEnabled(v) }
  function toggleConfirm(): void { const v = !confirmOnClose; useHub.getState().setConfirmOnClose(v); writeConfirmOnClose(v) }
  async function pick(): Promise<void> {
    const f = await window.hub.pickFolder()
    if (f) { useHub.getState().setGlobalDefaultCwd(f); writeGlobalDefaultCwd(f) }
  }
  function reset(): void { useHub.getState().setGlobalDefaultCwd(null); writeGlobalDefaultCwd(null) }

  return (
    <Modal title="Réglages" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Fermer</button>}>
      <div className="setting-row">
        <span className="setting-label">Notifications sonores</span>
        <button className={`toggle${soundEnabled ? ' on' : ''}`} onClick={toggleSound}>{soundEnabled ? 'Activé' : 'Coupé'}</button>
      </div>
      <div className="setting-row">
        <span className="setting-label">Confirmer avant de quitter l'application</span>
        <button className={`toggle${confirmOnClose ? ' on' : ''}`} onClick={toggleConfirm}>{confirmOnClose ? 'Oui' : 'Non'}</button>
      </div>
      <div className="setting-row">
        <span className="setting-label">Dossier par défaut</span>
        <span className="setting-path" title={globalDefaultCwd ?? ''}>{globalDefaultCwd ?? "(dossier de l'app)"}</span>
        <button className="btn" onClick={pick}>Choisir…</button>
        {globalDefaultCwd && <button className="btn" onClick={reset}>Réinitialiser</button>}
      </div>
      <div className="settings-section-title">Intégrations</div>
      <AdoConnections />
    </Modal>
  )
}
