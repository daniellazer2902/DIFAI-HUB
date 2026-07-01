import type { AdoBoard, AdoTaskColumn, AdoWorkItem } from '../../shared/ipc'

/** Place les tâches dans la colonne dont un mapping correspond à (type, état). 1ère colonne gagnante ; non-mappées ignorées. */
export function tasksByColumn(
  tasks: AdoWorkItem[],
  taskColumns: AdoTaskColumn[]
): Record<string, AdoWorkItem[]> {
  const out: Record<string, AdoWorkItem[]> = {}
  for (const c of taskColumns) out[c.name] = []
  for (const t of tasks) {
    const col = taskColumns.find((c) => c.mappings.some((m) => m.workItemType === t.type && m.state === t.state))
    if (col) out[col.name].push(t)
  }
  return out
}

/** Filtre le board sur une personne : US visible si elle OU une tâche lui est assignée ; ne garde que SES tâches. */
export function filterBoardByAssignee(board: AdoBoard, assignee: string | null): AdoBoard {
  if (!assignee) return board
  const stories = board.stories.filter(
    (s) => s.assignedTo === assignee || (board.tasksByParent[s.id] ?? []).some((t) => t.assignedTo === assignee)
  )
  const tasksByParent: Record<number, AdoWorkItem[]> = {}
  for (const s of stories) tasksByParent[s.id] = (board.tasksByParent[s.id] ?? []).filter((t) => t.assignedTo === assignee)
  return { ...board, stories, tasksByParent }
}
