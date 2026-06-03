import React from 'react'
import { useHub } from '../store'

export function Rail({ tabId }: { tabId: string }): React.JSX.Element | null {
  const tab = useHub((s) => s.tabs.find((t) => t.id === tabId))
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)
  if (!tab) return null

  return (
    <div className="rail">
      {tab.agents.map((a) => (
        <div
          key={a.id}
          className={`agent${a.id === tab.openAgentId ? ' sel' : ''}${a.done ? ' done' : ''}`}
          onClick={() => open(tabId, a.id)}
        >
          <span className="aclose" title="Retirer" onClick={(e) => { e.stopPropagation(); remove(tabId, a.id) }}>✕</span>
          <div className="type">{a.done ? '✓' : '▸'} {a.type}</div>
          <div className="desc">{a.desc.slice(0, 60)}</div>
        </div>
      ))}
    </div>
  )
}
