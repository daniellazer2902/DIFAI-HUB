import { describe, it, expect } from 'vitest'
import { effectiveScope, matchesScope } from '../src/shared/automationScope'

describe('effectiveScope', () => {
  it('hérite du périmètre du groupe quand l automation ne surcharge pas', () => {
    const group = [{ project: 'Socle', repos: [] }, { project: 'Catalogues', repos: ['api'] }]
    expect(effectiveScope(group, undefined)).toEqual(group)
  })

  it('utilise la surcharge de l automation quand elle est non vide', () => {
    const group = [{ project: 'Socle', repos: [] }]
    const over = [{ project: 'Prescription', repos: ['front'] }]
    expect(effectiveScope(group, over)).toEqual(over)
  })

  it('traite une surcharge vide comme une absence de surcharge', () => {
    const group = [{ project: 'Socle', repos: [] }]
    expect(effectiveScope(group, [])).toEqual(group)
  })

  it('renvoie une liste vide quand le groupe n a aucun périmètre', () => {
    expect(effectiveScope([], undefined)).toEqual([])
  })

  it('garde une PR quand la liste de repos est vide (tous les repos du projet)', () => {
    expect(matchesScope([{ project: 'Socle', repos: [] }], 'Socle', 'nimporte')).toBe(true)
  })

  it('filtre par repo quand la liste est renseignée', () => {
    const scope = [{ project: 'Socle', repos: ['api', 'front'] }]
    expect(matchesScope(scope, 'Socle', 'api')).toBe(true)
    expect(matchesScope(scope, 'Socle', 'batch')).toBe(false)
    expect(matchesScope(scope, 'Autre', 'api')).toBe(false)
  })
})
