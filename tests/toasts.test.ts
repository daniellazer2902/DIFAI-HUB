import { describe, it, expect, beforeEach } from 'vitest'
import { useToasts, pushToast, dismissToast, isPersistent } from '../src/renderer/src/toasts'

beforeEach(() => { useToasts.setState({ list: [] }) })

describe('toasts', () => {
  it('empile les toasts, le plus récent en tête', () => {
    pushToast({ runId: 'r1', level: 'done', title: 'A', body: '' })
    pushToast({ runId: 'r2', level: 'done', title: 'B', body: '' })
    expect(useToasts.getState().list.map((t) => t.title)).toEqual(['B', 'A'])
  })

  it('remplace le toast existant du même run', () => {
    pushToast({ runId: 'r1', level: 'attention', title: 'Attente', body: '' })
    pushToast({ runId: 'r1', level: 'done', title: 'Terminé', body: '' })
    const list = useToasts.getState().list
    expect(list.length).toBe(1)
    expect(list[0].level).toBe('done')
  })

  it('un toast sans runId ne remplace rien', () => {
    pushToast({ runId: '', level: 'attention', title: 'Lot 1', body: '' })
    pushToast({ runId: '', level: 'attention', title: 'Lot 2', body: '' })
    expect(useToasts.getState().list.length).toBe(2)
  })

  it('dismissToast retire le toast ciblé', () => {
    pushToast({ runId: 'r1', level: 'done', title: 'A', body: '' })
    const id = useToasts.getState().list[0].id
    dismissToast(id)
    expect(useToasts.getState().list).toEqual([])
  })

  it('seul le niveau done disparaît tout seul', () => {
    expect(isPersistent('done')).toBe(false)
    expect(isPersistent('attention')).toBe(true)
    expect(isPersistent('failed')).toBe(true)
  })
})
