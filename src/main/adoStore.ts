import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdoConnection } from '../shared/ipc'

function normConn(x: unknown): AdoConnection | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.baseUrl !== 'string') return null
  return { id: o.id, label: o.label, baseUrl: o.baseUrl }
}
export function parseConnections(raw: string): AdoConnection[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr.map(normConn).filter(Boolean) as AdoConnection[]) : []
  } catch { return [] }
}
export function serializeConnections(list: AdoConnection[]): string {
  return JSON.stringify(list, null, 2)
}
export function upsertConnection(list: AdoConnection[], conn: AdoConnection): AdoConnection[] {
  const i = list.findIndex((c) => c.id === conn.id)
  if (i < 0) return [...list, conn]
  const copy = [...list]; copy[i] = conn; return copy
}

const FILE = 'ado.json'
export function loadConnections(dir: string): AdoConnection[] {
  try { return parseConnections(readFileSync(join(dir, FILE), 'utf8')) } catch { return [] }
}
export function saveConnections(dir: string, list: AdoConnection[]): void {
  try { writeFileSync(join(dir, FILE), serializeConnections(list), 'utf8') } catch { /* ignore */ }
}
