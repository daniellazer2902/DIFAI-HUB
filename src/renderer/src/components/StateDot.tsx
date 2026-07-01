import React from 'react'
import type { SessionState } from '../../../shared/ipc'

const META: Record<SessionState, { color: string; cls: string; label: string }> = {
  starting: { color: '#9ccfff', cls: 'pulse', label: 'Démarrage…' },
  active: { color: '#ffb43b', cls: 'blink', label: 'Travaille…' },
  waiting: { color: '#5fe0a8', cls: '', label: 'Prêt' },
  attention: { color: '#ff5c5c', cls: 'pulse', label: 'Terminé — non vu' },
  done: { color: '#7a7a7a', cls: 'hollow', label: 'Terminée' }
}

export function StateDot({ state }: { state: SessionState }): React.JSX.Element {
  const m = META[state]
  // Cercle plein (rond → distinct du carré de groupe) ; « done » = cercle creux.
  return <span className={`statedot ${m.cls}`} title={m.label} style={{ ['--dot' as string]: m.color }} />
}

export function stateLabel(state: SessionState): string {
  return META[state].label
}
