import { mountTerminal } from './terminal'
import { mountRail } from './rail'

const root = document.getElementById('app')!
root.innerHTML = `
  <div id="row">
    <div id="term"></div>
    <div id="console"></div>
    <div id="rail"></div>
  </div>`

const cwd = 'C:\\Users\\daniel.gavriline\\Desktop\\Travail\\Claude apps\\DIFAI-HUB'

async function boot(): Promise<void> {
  const tabId = await window.hub.newSession(cwd)
  mountTerminal(document.getElementById('term')!, tabId)
  mountRail(tabId, document.getElementById('rail')!, document.getElementById('console')!)
}

boot()
