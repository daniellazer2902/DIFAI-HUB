import { randomUUID } from 'node:crypto'

export interface PtyProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
}

export interface SpawnOptions {
  name: string
  cols: number
  rows: number
  cwd: string
  env: NodeJS.ProcessEnv
}

export type PtySpawner = (file: string, args: string[], opts: SpawnOptions) => PtyProcess

export class PtyManager {
  private readonly spawn: PtySpawner
  private readonly claudePath: string
  private readonly ptys = new Map<string, PtyProcess>()
  private dataCb: (tabId: string, data: string) => void = () => {}
  private exitCb: (tabId: string, exitCode: number) => void = () => {}

  constructor(deps: { spawn: PtySpawner; claudePath: string }) {
    this.spawn = deps.spawn
    this.claudePath = deps.claudePath
  }

  onData(cb: (tabId: string, data: string) => void): void { this.dataCb = cb }
  onExit(cb: (tabId: string, exitCode: number) => void): void { this.exitCb = cb }

  create(cwd: string, opts?: { args?: string[]; env?: Record<string, string> }): string {
    const tabId = randomUUID()
    const pty = this.spawn(this.claudePath, opts?.args ?? [], {
      name: 'xterm-color',
      cols: 110,
      rows: 32,
      cwd,
      env: { ...process.env, DIFAI_HUB_TAB: tabId, ...(opts?.env ?? {}) }
    })
    pty.onData((data) => this.dataCb(tabId, data))
    pty.onExit(({ exitCode }) => {
      this.exitCb(tabId, exitCode)
      this.ptys.delete(tabId)
    })
    this.ptys.set(tabId, pty)
    return tabId
  }

  write(tabId: string, data: string): void { this.ptys.get(tabId)?.write(data) }
  resize(tabId: string, cols: number, rows: number): void { this.ptys.get(tabId)?.resize(cols, rows) }
  kill(tabId: string): void {
    const pty = this.ptys.get(tabId)
    if (!pty) return
    pty.kill()
    this.ptys.delete(tabId)
  }
  has(tabId: string): boolean { return this.ptys.has(tabId) }
}
