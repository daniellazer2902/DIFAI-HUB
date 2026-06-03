import React from 'react'
import { useHub } from '../store'

export function Rail({ itemId }: { itemId: string }): React.JSX.Element | null {
  const item = useHub((s) => s.groups.flatMap((g) => g.items).find((i) => i.id === itemId))
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)
  if (!item) return null

  return (
    <div className="rail">
      {item.agents.map((a) => (
        <div
          key={a.id}
          className={`agent${a.id === item.openAgentId ? ' sel' : ''}${a.done ? ' done' : ''}`}
          onClick={() => open(itemId, a.id === item.openAgentId ? null : a.id)}
        >
          <span className="aclose" title="Retirer" onClick={(e) => { e.stopPropagation(); if (item.tabId) remove(item.tabId, a.id) }}>✕</span>
          <div className="type">{a.done ? '✓' : '▸'} {a.type}</div>
          <div className="desc">{a.desc.slice(0, 60)}</div>
        </div>
      ))}
    </div>
  )
}
