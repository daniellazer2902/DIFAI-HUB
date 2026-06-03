import React, { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console(): React.JSX.Element | null {
  const openAgentId = useHub((s) => s.openAgentId)
  const agent = useHub((s) => s.agents.find((a) => a.id === s.openAgentId) ?? null)
  const close = useHub((s) => s.openAgent)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!openAgentId || !agent) return null

  return (
    <div id="console" className="open">
      <div className="console-header">
        <span>▸ {agent.type} — {agent.desc.slice(0, 50)}</span>
        <span className="cclose" title="Fermer la console" onClick={() => close(null)}>✕</span>
      </div>
      <div className="console-body" ref={bodyRef}>
        {agent.lines.map((l, i) => (
          <div className={`cline ${l.kind}`} key={i}>{icon(l.kind)} {l.text}</div>
        ))}
      </div>
    </div>
  )
}
