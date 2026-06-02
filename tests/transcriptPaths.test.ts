import { describe, it, expect } from 'vitest'
import { subagentsDir, newCompleteLines } from '../src/main/transcriptPaths'

describe('subagentsDir', () => {
  it('déduit <dir>/<sessionId>/subagents du transcript_path', () => {
    const got = subagentsDir('C:\\u\\.claude\\projects\\slug\\sess-1.jsonl', 'sess-1')
    expect(got).toBe('C:\\u\\.claude\\projects\\slug\\sess-1\\subagents')
  })
})

describe('newCompleteLines', () => {
  it('retourne les lignes complètes au-delà de seen et le nouveau compte', () => {
    const text = 'a\nb\nc\n'
    expect(newCompleteLines(text, 0)).toEqual({ lines: ['a', 'b', 'c'], count: 3 })
    expect(newCompleteLines(text, 2)).toEqual({ lines: ['c'], count: 3 })
  })

  it('ignore une dernière ligne partielle (sans \\n final)', () => {
    const text = 'a\nb\npartiel'
    expect(newCompleteLines(text, 0)).toEqual({ lines: ['a', 'b'], count: 2 })
  })

  it('rien de neuf => lignes vides', () => {
    expect(newCompleteLines('a\nb\n', 2)).toEqual({ lines: [], count: 2 })
  })
})
