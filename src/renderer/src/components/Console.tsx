import React, { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console({ itemId }: { itemId: string }): React.JSX.Element | null {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const close = useHub((s) => s.openAgent)
  const bodyRef = useRef<HTMLDivElement>(null)
  const agent = item?.agents.find((a) => a.id === item.openAgentId) ?? null

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!item || !agent) return null

  return (
    <div className="console">
      <div className="console-header">
        <span>▸ {agent.type} — {agent.desc.slice(0, 50)}</span>
        <span className="cclose" title="Fermer la console" onClick={() => close(itemId, null)}>✕</span>
      </div>
      <div className="console-body" ref={bodyRef}>
        {agent.lines.map((l, i) => (
          <div className={`cline ${l.kind}`} key={i}>{icon(l.kind)} {l.text}</div>
        ))}
      </div>
    </div>
  )
}
