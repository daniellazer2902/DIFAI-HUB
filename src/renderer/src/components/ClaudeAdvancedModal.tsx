import { useState } from 'react'
import { Modal } from './Modal'

interface Props {
  onLaunch: (command: string) => void
  onClose: () => void
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#161616', border: '1px solid #444', borderRadius: 6,
  color: '#ddd', padding: '6px 8px', fontFamily: 'inherit', fontSize: 12
}

/**
 * Lancement d'une session Claude avec des paramètres libres.
 * Modale dédiée, prévue pour s'enrichir plus tard (cases à cocher, modèle, paramètres enregistrés).
 */
export function ClaudeAdvancedModal({ onLaunch, onClose }: Props): React.JSX.Element {
  const [command, setCommand] = useState('claude --dangerously-skip-permissions')
  const launch = (): void => { if (command.trim()) { onLaunch(command); onClose() } }
  return (
    <Modal
      title="Claude avancé"
      onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!command.trim()} onClick={launch}>Lancer</button>
      </>}
    >
      <div className="setting-row"><label>Commande / paramètres de lancement</label></div>
      <input
        style={INPUT_STYLE}
        autoFocus
        value={command}
        placeholder="claude --dangerously-skip-permissions"
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); launch() } }}
      />
      <div className="muted" style={{ marginTop: 8 }}>
        Le préfixe « claude » est optionnel. Ex. : <code>--dangerously-skip-permissions</code>, <code>--model opus</code>.
      </div>
      {/* À venir (plus tard) : cases à cocher (skip permissions…), choix du modèle, profils de lancement enregistrés. */}
    </Modal>
  )
}
