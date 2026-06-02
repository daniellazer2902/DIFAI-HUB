export type SessionState = 'starting' | 'active' | 'waiting' | 'done'

export interface SessionInfo {
  tabId: string
  cwd: string
  sessionId: string | null
  transcriptPath: string | null
  state: SessionState
}

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionInfo>()

  register(tabId: string, cwd: string): void {
    this.sessions.set(tabId, { tabId, cwd, sessionId: null, transcriptPath: null, state: 'starting' })
  }

  correlate(tabId: string, sessionId: string, transcriptPath: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    s.sessionId = sessionId
    s.transcriptPath = transcriptPath
    s.state = 'active'
  }

  setState(tabId: string, state: SessionState): void {
    const s = this.sessions.get(tabId)
    if (s) s.state = state
  }

  get(tabId: string): SessionInfo | undefined { return this.sessions.get(tabId) }
  remove(tabId: string): void { this.sessions.delete(tabId) }
  count(): number { return this.sessions.size }
}
