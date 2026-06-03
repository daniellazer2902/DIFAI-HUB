import React from 'react'
import { useHub } from '../store'

export function Rail(): React.JSX.Element {
  const agents = useHub((s) => s.agents)
  const openAgentId = useHub((s) => s.openAgentId)
  const open = useHub((s) => s.openAgent)
  const remove = useHub((s) => s.removeAgent)

  return (
    <div id="rail">
      {agents.map((a) => (
        <div
          key={a.id}
          className={`agent${a.id === openAgentId ? ' sel' : ''}`}
          onClick={() => open(a.id)}
        >
          <span
            className="aclose"
            title="Retirer"
            onClick={(e) => { e.stopPropagation(); remove(a.id) }}
          >✕</span>
          <div className="type">▸ {a.type}</div>
          <div className="desc">{a.desc.slice(0, 60)}</div>
        </div>
      ))}
    </div>
  )
}
