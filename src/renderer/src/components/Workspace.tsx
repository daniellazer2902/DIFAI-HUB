import React from 'react'
import { useHub } from '../store'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { Rail } from './Rail'

export function Workspace(): React.JSX.Element {
  const tabs = useHub((s) => s.tabs)
  const activeTabId = useHub((s) => s.activeTabId)
  const toggleRail = useHub((s) => s.toggleRail)

  return (
    <div id="workspace">
      {tabs.map((t) => (
        <div key={t.id} className="tabpane" style={{ display: t.id === activeTabId ? 'block' : 'none' }}>
          <div className="term-wrap">
            <div className="term-area">
              <button className="rails-toggle" onClick={() => toggleRail(t.id)}>
                {t.railCollapsed ? '› Rails' : '‹ Rails'}
              </button>
              <Terminal tabId={t.id} />
            </div>
            <Console tabId={t.id} />
            {!t.railCollapsed && <Rail tabId={t.id} />}
          </div>
        </div>
      ))}
    </div>
  )
}
