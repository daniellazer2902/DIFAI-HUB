// Hook forward generique : lit l'event sur stdin, ajoute tabId (env), POST au HookServer.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const port = process.env.DIFAI_HUB_PORT
const payload = JSON.stringify({ ...input, tabId: process.env.DIFAI_HUB_TAB ?? null })

try {
  await fetch(`http://127.0.0.1:${port}/hook`, { method: 'POST', body: payload })
} catch {
  // hub absent : ne jamais bloquer la session claude
}
