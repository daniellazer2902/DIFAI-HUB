import { mountTerminal } from './terminal'

const root = document.getElementById('app')!
root.innerHTML = '<div id="term" style="position:absolute;inset:0;"></div>'

const cwd = 'C:\\Users\\daniel.gavriline\\Desktop\\Travail\\Claude apps\\DIFAI-HUB'

async function boot(): Promise<void> {
  const tabId = await window.hub.newSession(cwd)
  mountTerminal(document.getElementById('term')!, tabId)
}

boot()
