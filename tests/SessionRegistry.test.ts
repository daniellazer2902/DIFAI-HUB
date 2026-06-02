import { describe, it, expect } from 'vitest'
import { SessionRegistry } from '../src/main/SessionRegistry'

describe('SessionRegistry', () => {
  it('register crée une entrée en état starting', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\proj')
    const s = reg.get('tab1')
    expect(s?.cwd).toBe('C:\\proj')
    expect(s?.state).toBe('starting')
    expect(s?.sessionId).toBeNull()
  })

  it('correlate renseigne sessionId + transcriptPath et passe en active', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\proj')
    reg.correlate('tab1', 'sess-123', 'C:\\t.jsonl')
    const s = reg.get('tab1')
    expect(s?.sessionId).toBe('sess-123')
    expect(s?.transcriptPath).toBe('C:\\t.jsonl')
    expect(s?.state).toBe('active')
  })

  it('setState change l\'état', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'C:\\proj')
    reg.setState('tab1', 'waiting')
    expect(reg.get('tab1')?.state).toBe('waiting')
  })

  it('ignore les tabId inconnus sans planter', () => {
    const reg = new SessionRegistry()
    expect(() => reg.correlate('absent', 's', 't')).not.toThrow()
    expect(() => reg.setState('absent', 'active')).not.toThrow()
    expect(reg.get('absent')).toBeUndefined()
  })

  it('remove supprime l\'entrée et count reflète le nombre de sessions', () => {
    const reg = new SessionRegistry()
    reg.register('tab1', 'a')
    reg.register('tab2', 'b')
    expect(reg.count()).toBe(2)
    reg.remove('tab1')
    expect(reg.count()).toBe(1)
    expect(reg.get('tab1')).toBeUndefined()
  })
})
