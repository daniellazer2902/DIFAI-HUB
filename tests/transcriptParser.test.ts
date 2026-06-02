import { describe, it, expect } from 'vitest'
import { parseTranscriptLine } from '../src/main/transcriptParser'

describe('parseTranscriptLine', () => {
  it('user + content string => prompt', () => {
    const raw = JSON.stringify({ type: 'user', message: { role: 'user', content: 'Liste les .mjs' } })
    expect(parseTranscriptLine(raw)).toEqual([{ kind: 'prompt', text: 'Liste les .mjs' }])
  })

  it('assistant + texte => text', () => {
    const raw = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Voici' }] } })
    expect(parseTranscriptLine(raw)).toEqual([{ kind: 'text', text: 'Voici' }])
  })

  it('assistant + tool_use => tool (nom de l\'outil)', () => {
    const raw = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Glob', input: {} }] } })
    expect(parseTranscriptLine(raw)).toEqual([{ kind: 'tool', text: 'Glob' }])
  })

  it('user + tool_result => result (tronqué)', () => {
    const long = 'x'.repeat(500)
    const raw = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: long }] } })
    const out = parseTranscriptLine(raw)
    expect(out[0].kind).toBe('result')
    expect(out[0].text.length).toBeLessThanOrEqual(200)
  })

  it('plusieurs items dans un message assistant => plusieurs entrées', () => {
    const raw = JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'text', text: 'Je cherche' }, { type: 'tool_use', name: 'Bash' }
    ] } })
    expect(parseTranscriptLine(raw)).toEqual([
      { kind: 'text', text: 'Je cherche' }, { kind: 'tool', text: 'Bash' }
    ])
  })

  it('ligne non-JSON ou type ignoré => []', () => {
    expect(parseTranscriptLine('pas du json')).toEqual([])
    expect(parseTranscriptLine(JSON.stringify({ type: 'attachment' }))).toEqual([])
  })
})
