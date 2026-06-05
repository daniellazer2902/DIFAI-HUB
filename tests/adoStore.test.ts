import { describe, it, expect } from 'vitest'
import { parseConnections, serializeConnections, upsertConnection } from '../src/main/adoStore'

describe('adoStore', () => {
  it('parse une liste valide', () => {
    const raw = JSON.stringify([{ id: 'c1', label: 'Acme', baseUrl: 'https://dev.azure.com/acme' }])
    expect(parseConnections(raw)).toEqual([{ id: 'c1', label: 'Acme', baseUrl: 'https://dev.azure.com/acme' }])
  })
  it('ignore les entrées invalides et le JSON cassé', () => {
    expect(parseConnections('nope')).toEqual([])
    expect(parseConnections(JSON.stringify([{ id: 'x' }, { id: 'c1', label: 'A', baseUrl: 'u' }]))).toEqual([{ id: 'c1', label: 'A', baseUrl: 'u' }])
  })
  it('upsert ajoute puis remplace par id', () => {
    let list = upsertConnection([], { id: 'c1', label: 'A', baseUrl: 'u' })
    expect(list).toHaveLength(1)
    list = upsertConnection(list, { id: 'c1', label: 'A2', baseUrl: 'u2' })
    expect(list).toEqual([{ id: 'c1', label: 'A2', baseUrl: 'u2' }])
  })
  it('round-trip serialize/parse', () => {
    const list = [{ id: 'c1', label: 'A', baseUrl: 'u' }]
    expect(parseConnections(serializeConnections(list))).toEqual(list)
  })
})
