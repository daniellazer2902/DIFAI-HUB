import React, { useEffect, useRef } from 'react'
import { useHub } from '../store'
import type { ConsoleLineKind } from '../../../shared/ipc'

function icon(kind: ConsoleLineKind): string {
  return kind === 'tool' ? '🔧' : kind === 'prompt' ? '›' : kind === 'result' ? '⮑' : '·'
}

export function Console({ itemId }: { itemId: string }): React.JSX.Element | null {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)
  const bodyRef = useRef<HTMLDivElement>(null)
  const agent = item?.agents.find((a) => a.id === item.openAgentId) ?? null

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [agent?.lines.length])

  if (!item) return null

  return (
    <div className="agents-tab">
      <div className="rail">
        {item.agents.length === 0 && <div className="rail-empty">Aucun agent</div>}
        {item.agents.map((a) => (
          <div
            key={a.id}
            className={`agent ${a.kind}${a.id === item.openAgentId ? ' sel' : ''}${a.done ? ' done' : ''}${a.failed ? ' failed' : ''}`}
            onClick={() => open(itemId, a.id === item.openAgentId ? null : a.id)}
          >
            <span className="aclose" title="Retirer" onClick={(e) => { e.stopPropagation(); if (item.tabId) remove(item.tabId, a.id) }}>✕</span>
            <div className="type"><span className={`abadge ${a.kind}`}>{a.kind === 'shell' ? 'SHELL' : 'AGENT'}</span> {a.done ? (a.failed ? '✗' : '✓') : '▸'} {a.type}</div>
            <div className="desc">{a.desc.slice(0, 60)}</div>
          </div>
        ))}
      </div>
      <div className="console">
        {agent ? (
          <>
            <div className="console-header"><span><span className={`abadge ${agent.kind}`}>{agent.kind === 'shell' ? 'SHELL' : 'AGENT'}</span> {agent.type} — {agent.desc.slice(0, 50)}</span></div>
            <div className="console-body" ref={bodyRef}>
              {agent.lines.map((l, i) => (
                <div className={`cline ${l.kind}`} key={i}>{icon(l.kind)} {l.text}</div>
              ))}
            </div>
          </>
        ) : (
          <div className="console-empty">Sélectionne un agent dans la liste.</div>
        )}
      </div>
    </div>
  )
}
