import React from 'react'
import { splitHighlight } from '../adoFind'

/** Texte avec occurrences de `q` surlignées (mark.ado-hl, repéré par la recherche). */
export function Hl({ text, q }: { text: string; q: string }): React.JSX.Element {
  if (!q) return <>{text}</>
  return (
    <>
      {splitHighlight(text, q).map((s, i) =>
        s.hit ? <mark key={i} className="ado-hl">{s.text}</mark> : <span key={i}>{s.text}</span>
      )}
    </>
  )
}
