// src/renderer/src/components/ImageView.tsx
import React, { useEffect, useState } from 'react'

interface Props { root: string; filePath: string }

/** Affiche une image locale (data URI via notesAsset). Lecture seule, fit-to-width. */
export function ImageView({ root, filePath }: Props): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setSrc(null); setErr(null)
    void window.hub.notesAsset(root, filePath).then((r) => {
      if (cancelled) return
      if (r.ok) setSrc(r.data.dataUri)
      else setErr(r.error)
    })
    return () => { cancelled = true }
  }, [root, filePath])
  if (err) return <div className="notes-center notes-err">{err}</div>
  if (!src) return <div className="notes-center">Chargement…</div>
  return <div className="img-view"><img src={src} alt={filePath} /></div>
}
