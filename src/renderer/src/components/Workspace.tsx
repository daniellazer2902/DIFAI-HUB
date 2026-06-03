import React from 'react'
import { useHub } from '../store'
import { clampConsoleWidth, writeConsoleWidth } from '../util'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { Rail } from './Rail'

export function Workspace(): React.JSX.Element {
  const tabs = useHub((s) => s.tabs)
  const activeTabId = useHub((s) => s.activeTabId)
  const toggleRail = useHub((s) => s.toggleRail)
  const consoleWidth = useHub((s) => s.consoleWidth)
  const setConsoleWidth = useHub((s) => s.setConsoleWidth)

  // Glisser la poignée : à gauche = console plus large, à droite = plus étroite.
  function startResize(e: React.MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startW = consoleWidth
    const move = (ev: MouseEvent): void => setConsoleWidth(clampConsoleWidth(startW - (ev.clientX - startX)))
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      writeConsoleWidth(useHub.getState().consoleWidth)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

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
            {t.openAgentId && (
              <>
                <div className="splitter" title="Redimensionner la console" onMouseDown={startResize} />
                <div className="console-host" style={{ width: consoleWidth }}>
                  <Console tabId={t.id} />
                </div>
              </>
            )}
            {!t.railCollapsed && <Rail tabId={t.id} />}
          </div>
        </div>
      ))}
    </div>
  )
}
