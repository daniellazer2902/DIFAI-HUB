import React from 'react'

/** Chevron pivotant : pointe à droite (fermé) → vers le bas (ouvert). Réutilisé pour les sections repliables. */
export function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg className={`ado-twisty${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}
