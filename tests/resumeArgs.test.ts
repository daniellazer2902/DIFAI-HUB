import { describe, it, expect } from 'vitest'
import { stripResumeFlags, withResume } from '../src/shared/resumeArgs'

describe('stripResumeFlags', () => {
  it('laisse intacts les args sans reprise', () => {
    expect(stripResumeFlags(['--model', 'opus', '--dangerously-skip-permissions'])).toEqual(['--model', 'opus', '--dangerously-skip-permissions'])
  })

  it('retire --resume / -r avec leur id', () => {
    expect(stripResumeFlags(['--resume', 'abc', '--model', 'opus'])).toEqual(['--model', 'opus'])
    expect(stripResumeFlags(['-r', 'abc'])).toEqual([])
    expect(stripResumeFlags(['--resume=abc', '--verbose'])).toEqual(['--verbose'])
  })

  it('retire --resume sans valeur (sélecteur interactif) sans manger le flag suivant', () => {
    expect(stripResumeFlags(['--resume', '--model', 'opus'])).toEqual(['--model', 'opus'])
    expect(stripResumeFlags(['--model', 'opus', '--resume'])).toEqual(['--model', 'opus'])
  })

  it('retire --continue / -c, --fork-session et --session-id', () => {
    expect(stripResumeFlags(['-c', '--fork-session', '--session-id', 'x', '--session-id=y', '--continue'])).toEqual([])
  })

  it('retire --from-pr et --teleport (valeur optionnelle)', () => {
    expect(stripResumeFlags(['--from-pr', '123', '--teleport', '--verbose', '--from-pr=4'])).toEqual(['--verbose'])
  })
})

describe('withResume', () => {
  it('ajoute --resume <id> aux args nettoyés', () => {
    expect(withResume(['--resume', 'old', '--model', 'opus'], 'new')).toEqual(['--model', 'opus', '--resume', 'new'])
  })

  it('fonctionne sans args de départ', () => {
    expect(withResume(undefined, 'sid')).toEqual(['--resume', 'sid'])
  })
})
