import React from 'react'
import { useHub } from '../store'
import { clampConsoleWidth, writeConsoleWidth } from '../util'
import { Terminal } from './Terminal'
import { Console } from './Console'
import { Rail } from './Rail'
import { SearchPanel } from './SearchPanel'

export function Workspace(): React.JSX.Element {
  const groups = useHub((s) => s.groups)
  const activeGroupId = useHub((s) => s.activeGroupId)
  const activeItemId = useHub((s) => s.activeItemId)
  const toggleRail = useHub((s) => s.toggleRail)
  const consoleWidth = useHub((s) => s.consoleWidth)
  const setConsoleWidth = useHub((s) => s.setConsoleWidth)

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

  // Onglets = items VIVANTS du groupe actif.
  const activeGroup = groups.find((g) => g.id === activeGroupId)
  const liveItems = (activeGroup?.items ?? []).filter((i) => i.tabId)

  return (
    <div id="workspace">
      {liveItems.map((it) => (
        <div key={it.id} className="tabpane" style={{ display: it.id === activeItemId ? 'block' : 'none' }}>
          <div className="term-wrap">
            <div className="term-area">
              <button className="rails-toggle" onClick={() => toggleRail(it.id)}>
                {it.railCollapsed ? '› Rails' : '‹ Rails'}
              </button>
              <Terminal tabId={it.tabId as string} />
            </div>
            {(it.searchOpen || it.openAgentId) && (
              <>
                <div className="splitter" title="Redimensionner le panneau" onMouseDown={startResize} />
                <div className="console-host" style={{ width: consoleWidth }}>
                  {it.searchOpen ? <SearchPanel itemId={it.id} /> : <Console itemId={it.id} />}
                </div>
              </>
            )}
            {!it.railCollapsed && <Rail itemId={it.id} />}
          </div>
        </div>
      ))}
    </div>
  )
}
