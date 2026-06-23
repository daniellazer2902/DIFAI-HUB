// src/renderer/src/components/HtmlView.tsx
import React, { useEffect, useState } from 'react'

interface Props { root: string; filePath: string }

/** Affiche un .html dans une iframe sandboxée (scripts inline OK, isolée du reste de l'app). */
export function HtmlView({ root, filePath }: Props): React.JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setContent(null); setErr(null)
    void window.hub.notesReadRaw(root, filePath).then((r) => {
      if (cancelled) return
      if (r.ok) setContent(r.data.content)
      else setErr(r.error)
    })
    return () => { cancelled = true }
  }, [root, filePath])
  if (err) return <div className="notes-center notes-err">{err}</div>
  if (content === null) return <div className="notes-center">Chargement…</div>
  // allow-scripts SANS allow-same-origin : origine opaque, pas d'accès à l'app, réseau bloqué.
  return <iframe className="html-view" sandbox="allow-scripts" srcDoc={content} title={filePath} />
}
