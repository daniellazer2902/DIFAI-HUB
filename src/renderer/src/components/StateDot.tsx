import React from 'react'
import type { SessionState } from '../../../shared/ipc'

const META: Record<SessionState, { color: string; cls: string; glyph: string; label: string }> = {
  starting: { color: '#9cf', cls: 'pulse', glyph: '●', label: 'Démarrage…' },
  active: { color: '#fb3', cls: 'blink', glyph: '●', label: 'Travaille…' },
  waiting: { color: '#7fd', cls: '', glyph: '●', label: 'Prêt' },
  attention: { color: '#f55', cls: 'pulse', glyph: '●', label: 'Terminé — non vu' },
  done: { color: '#777', cls: '', glyph: '○', label: 'Terminée' }
}

export function StateDot({ state }: { state: SessionState }): React.JSX.Element {
  const m = META[state]
  return <span className={`statedot ${m.cls}`} title={m.label} style={{ color: m.color }}>{m.glyph}</span>
}

export function stateLabel(state: SessionState): string {
  return META[state].label
}
