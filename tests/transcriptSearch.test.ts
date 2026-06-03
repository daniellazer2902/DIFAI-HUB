import { describe, it, expect } from 'vitest'
import { searchTranscript } from '../src/main/transcriptSearch'

const line = (o: unknown): string => JSON.stringify(o)

describe('searchTranscript', () => {
  it('trouve un prompt user (content string) et renvoie le texte entier', () => {
    const raw = line({ type: 'user', message: { content: 'peux-tu me donner 500 mots' } })
    const r = searchTranscript(raw, 'mots')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('user')
    expect(r[0].text).toBe('peux-tu me donner 500 mots')
    expect(r[0].count).toBe(1)
  })

  it('trouve un texte assistant (content array de text)', () => {
    const raw = line({ type: 'assistant', message: { content: [{ type: 'text', text: 'chiffre, nombre, calcul' }] } })
    const r = searchTranscript(raw, 'nombre')
    expect(r).toHaveLength(1)
    expect(r[0].role).toBe('assistant')
  })

  it('insensible à la casse', () => {
    const raw = line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Voici le NOMBRE' }] } })
    expect(searchTranscript(raw, 'nombre')).toHaveLength(1)
  })

  it('ignore les lignes non-JSON et les types non pertinents', () => {
    const raw = ['pas du json', line({ type: 'attachment' }), line({ type: 'system', message: { content: 'mots' } })].join('\n')
    expect(searchTranscript(raw, 'mots')).toEqual([])
  })

  it('compte toutes les occurrences dans un message (un seul résultat, count cumulé)', () => {
    const raw = line({ type: 'assistant', message: { content: [{ type: 'text', text: 'escale, couloir, escalier, escalade' }] } })
    const r = searchTranscript(raw, 'escal')
    expect(r).toHaveLength(1)
    expect(r[0].count).toBe(3)
  })

  it('un résultat par message (plusieurs messages)', () => {
    const raw = [
      line({ type: 'user', message: { content: 'mot un' } }),
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'un mot deux' }] } })
    ].join('\n')
    expect(searchTranscript(raw, 'mot')).toHaveLength(2)
  })

  it('respecte la limite de messages', () => {
    const raw = Array.from({ length: 10 }, () => line({ type: 'user', message: { content: 'mot' } })).join('\n')
    expect(searchTranscript(raw, 'mot', 3)).toHaveLength(3)
  })

  it('query vide => aucun résultat', () => {
    const raw = line({ type: 'user', message: { content: 'mots' } })
    expect(searchTranscript(raw, '  ')).toEqual([])
  })
})
