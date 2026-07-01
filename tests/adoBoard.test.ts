import { describe, it, expect } from 'vitest'
import { tasksByColumn, filterBoardByAssignee } from '../src/renderer/src/adoBoard'
import type { AdoBoard, AdoTaskColumn, AdoWorkItem } from '../src/shared/ipc'

const task = (id: number, state: string, assignedTo: string | null = null): AdoWorkItem =>
  ({ id, type: 'Task', title: `T${id}`, state, assignedTo, parentId: 1, childCount: 0 })
const us = (id: number, assignedTo: string | null = null): AdoWorkItem =>
  ({ id, type: 'User Story', title: `US${id}`, state: 'Active', assignedTo, parentId: null, childCount: 0 })
const cols: AdoTaskColumn[] = [
  { name: 'New', mappings: [{ workItemType: 'Task', state: 'New' }] },
  { name: 'IN PR', mappings: [{ workItemType: 'Task', state: 'Active' }] },
  { name: 'Closed', mappings: [{ workItemType: 'Task', state: 'Closed' }] }
]

describe('tasksByColumn', () => {
  it('place chaque tâche dans la colonne dont le mapping (type,état) correspond', () => {
    const out = tasksByColumn([task(1, 'New'), task(2, 'Active'), task(3, 'New')], cols)
    expect(out['New'].map((t) => t.id)).toEqual([1, 3])
    expect(out['IN PR'].map((t) => t.id)).toEqual([2])
    expect(out['Closed']).toEqual([])
  })
  it('ignore les tâches sans colonne correspondante', () => {
    const out = tasksByColumn([task(1, 'Removed'), task(2, 'New')], cols)
    expect(Object.values(out).flat().map((t) => t.id)).toEqual([2])
  })
})

describe('filterBoardByAssignee', () => {
  const board: AdoBoard = {
    states: [], taskColumns: cols,
    stories: [us(10, 'Daniel'), us(11, 'Bob'), us(12, null)],
    tasksByParent: { 10: [task(100, 'New', 'Bob')], 11: [task(110, 'New', 'Daniel')], 12: [task(120, 'New', 'Eve')] }
  }
  it('null/"" : board inchangé', () => {
    expect(filterBoardByAssignee(board, null)).toBe(board)
  })
  it('garde une US si elle OU une de ses tâches est assignée à la personne, et ne montre que ses tâches', () => {
    const r = filterBoardByAssignee(board, 'Daniel')
    expect(r.stories.map((s) => s.id)).toEqual([10, 11])
    expect(r.tasksByParent[10]).toEqual([])
    expect(r.tasksByParent[11].map((t) => t.id)).toEqual([110])
    expect(r.taskColumns).toBe(board.taskColumns)
  })
})
