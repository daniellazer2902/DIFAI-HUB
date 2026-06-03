import { describe, it, expect } from 'vitest'
import { searchTranscript } from '../src/main/transcriptSearch'

const line = (o: unknown): string => JSON.stringify(o)

describe('searchTranscript', () => {
  it('trouve un prompt user (content string)', () => {
    const raw = line({ type: 'user', message: { content: 'peux-tu me donner 500 mots' } })
    const r = searchTranscript(raw, 'mots')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('user')
    expect(r[0].snippet.toLowerCase()).toContain('mots')
  })

  it('trouve un texte assistant (content array de text)', () => {
    const raw = line({ type: 'assistant', message: { content: [{ type: 'text', text: 'chiffre, nombre, calcul' }] } })
    const r = searchTranscript(raw, 'nombre')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('assistant')
    expect(r[0].snippet.toLowerCase()).toContain('nombre')
  })

  it('insensible à la casse', () => {
    const raw = line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Voici le NOMBRE' }] } })
    expect(searchTranscript(raw, 'nombre')).toHaveLength(1)
  })

  it('ignore les lignes non-JSON et les types non pertinents', () => {
    const raw = ['pas du json', line({ type: 'attachment' }), line({ type: 'system', message: { content: 'mots' } })].join('\n')
    expect(searchTranscript(raw, 'mots')).toEqual([])
  })

  it('tronque le snippet autour du match avec des ellipses', () => {
    const long = 'a'.repeat(200) + ' cible ' + 'b'.repeat(200)
    const raw = line({ type: 'user', message: { content: long } })
    const r = searchTranscript(raw, 'cible')
    expect(r[0].snippet.length).toBeLessThan(long.length)
    expect(r[0].snippet.startsWith('…')).toBe(true)
    expect(r[0].snippet.endsWith('…')).toBe(true)
  })

  it('respecte la limite de résultats', () => {
    const raw = Array.from({ length: 10 }, () => line({ type: 'user', message: { content: 'mot' } })).join('\n')
    expect(searchTranscript(raw, 'mot', 3)).toHaveLength(3)
  })

  it('query vide => aucun résultat', () => {
    const raw = line({ type: 'user', message: { content: 'mots' } })
    expect(searchTranscript(raw, '  ')).toEqual([])
  })
})
