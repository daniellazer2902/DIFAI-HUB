import React, { useEffect, useState } from 'react'
import { useHub } from './store'
import { Terminal } from './components/Terminal'
import { Rail } from './components/Rail'
import { Console } from './components/Console'
import type { Unsub } from '../../shared/ipc'

const cwd = 'C:\\Users\\daniel.gavriline\\Desktop\\Travail\\Claude apps\\DIFAI-HUB'

export function App(): React.JSX.Element {
  const [tabId, setTabId] = useState<string | null>(null)

  useEffect(() => {
    const unsubs: Unsub[] = []
    let active = true

    window.hub.newSession(cwd).then((id) => {
      if (!active) return
      useHub.getState().setTab(id)
      setTabId(id)

      unsubs.push(window.hub.onSessionState((tid, state) => {
        if (tid === id) useHub.getState().setSessionState(state)
      }))
      unsubs.push(window.hub.onAgentAdded((tid, agentId, type, desc) => {
        if (tid === id) useHub.getState().addAgent({ id: agentId, type, desc, lines: [] })
      }))
      unsubs.push(window.hub.onAgentLines((tid, agentId, lines) => {
        if (tid === id) useHub.getState().appendLines(agentId, lines)
      }))
    })

    return () => {
      active = false
      unsubs.forEach((u) => u())
    }
  }, [])

  return (
    <div id="row">
      {tabId && <Terminal tabId={tabId} />}
      <Console />
      <Rail />
    </div>
  )
}
