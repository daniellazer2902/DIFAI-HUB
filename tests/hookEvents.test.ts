import { describe, it, expect } from 'vitest'
import { SessionRegistry } from '../src/main/SessionRegistry'
import { applyHookEvent } from '../src/main/hookEvents'

describe('applyHookEvent', () => {
  it('SessionStart corrèle et passe en active', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    applyHookEvent(reg, {
      hook_event_name: 'SessionStart', tabId: 'tab1',
      session_id: 'sess-1', transcript_path: 'C:\\t.jsonl'
    })
    expect(reg.get('tab1')?.sessionId).toBe('sess-1')
    expect(reg.get('tab1')?.state).toBe('active')
  })

  it('Stop passe la session en waiting', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    applyHookEvent(reg, { hook_event_name: 'Stop', tabId: 'tab1' })
    expect(reg.get('tab1')?.state).toBe('waiting')
  })

  it('Notification passe la session en waiting', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    applyHookEvent(reg, { hook_event_name: 'Notification', tabId: 'tab1' })
    expect(reg.get('tab1')?.state).toBe('waiting')
  })

  it('ignore un event sans tabId', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\p')
    expect(() => applyHookEvent(reg, { hook_event_name: 'Stop' })).not.toThrow()
    expect(reg.get('tab1')?.state).toBe('starting')
  })
})
