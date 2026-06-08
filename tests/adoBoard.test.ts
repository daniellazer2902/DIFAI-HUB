import { describe, it, expect } from 'vitest'
import { tasksByState } from '../src/renderer/src/adoBoard'
import type { AdoWorkItem } from '../src/shared/ipc'

const wi = (id: number, state: string): AdoWorkItem =>
  ({ id, type: 'Task', title: `T${id}`, state, assignedTo: null, parentId: 1, childCount: 0 })

describe('tasksByState', () => {
  it('répartit les tâches dans la colonne de leur état', () => {
    const out = tasksByState([wi(1, 'New'), wi(2, 'Closed'), wi(3, 'New')], ['New', 'Active', 'Closed'])
    expect(out['New'].map((t) => t.id)).toEqual([1, 3])
    expect(out['Active']).toEqual([])
    expect(out['Closed'].map((t) => t.id)).toEqual([2])
  })

  it('garantit une entrée (tableau) pour chaque état, même vide', () => {
    const out = tasksByState([], ['New', 'Closed'])
    expect(Object.keys(out)).toEqual(['New', 'Closed'])
    expect(out['New']).toEqual([])
  })

  it('ignore les tâches dont l\'état n\'est dans aucune colonne', () => {
    const out = tasksByState([wi(1, 'Removed'), wi(2, 'New')], ['New', 'Closed'])
    expect(out['New'].map((t) => t.id)).toEqual([2])
    expect(Object.values(out).flat().map((t) => t.id)).toEqual([2])
  })
})
