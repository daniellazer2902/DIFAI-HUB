import { createServer, type Server } from 'node:http'
import type { Unsub } from '../shared/ipc'

/** Mini-serveur HTTP local : reçoit les POST des hooks et les diffuse aux abonnés. */
export class HookServer {
  private server: Server | null = null
  private boundPort = 0
  private readonly listeners = new Set<(event: unknown) => void>()

  onEvent(cb: (event: unknown) => void): Unsub {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  /** Diffuse un event à tous les abonnés (appelé par le serveur HTTP, et exposé pour les tests). */
  dispatch(event: unknown): void {
    for (const cb of this.listeners) cb(event)
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        if (req.method !== 'POST') { res.writeHead(404); res.end(); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try { this.dispatch(JSON.parse(body)) } catch { /* body non-JSON : ignore */ }
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('ok')
        })
      })
      this.server.on('error', reject)
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address()
        this.boundPort = addr && typeof addr === 'object' ? addr.port : 0
        resolve(this.boundPort)
      })
    })
  }

  get port(): number { return this.boundPort }

  stop(): void {
    this.server?.close()
    this.server = null
    this.listeners.clear()
  }
}
