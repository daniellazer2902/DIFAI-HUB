import type React from 'react'
import { textOn } from './color'

/** Gris neutre de la palette, utilisé quand le groupe n'a pas de couleur. */
export const MEMO_NEUTRAL = '#6b7280'

/** Variables CSS d'un mémo : --mc = couleur du groupe, --mt = texte lisible dessus. */
export function memoColorVars(color: string | null | undefined): React.CSSProperties {
  const c = color || MEMO_NEUTRAL
  return { '--mc': c, '--mt': textOn(c) } as React.CSSProperties
}
