import { describe, it, expect } from 'vitest'
import { newAutomation, validateAutomation, parseToolList } from '../src/renderer/src/automationForm'

describe('automationForm', () => {
  it('une nouvelle automation part activée, avec le gabarit et les outils par défaut', () => {
    const a = newAutomation()
    expect(a.enabled).toBe(true)
    expect(a.trigger).toBe('reviewer-assigned')
    expect(a.pollSeconds).toBe(300)
    expect(a.prompt).toContain('/difai-tech-devops-ado-code-review')
    expect(a.allowedTools).toContain('Read')
  })

  it('refuse un prompt vide', () => {
    expect(validateAutomation({ ...newAutomation(), prompt: '   ' }))
      .toBe('Le prompt ne peut pas être vide.')
  })

  it('refuse un intervalle inférieur à une minute', () => {
    expect(validateAutomation({ ...newAutomation(), pollSeconds: 30 }))
      .toBe('L intervalle minimum est de 60 secondes.')
  })

  it('accepte une automation correcte', () => {
    expect(validateAutomation(newAutomation())).toBeNull()
  })

  it('parseToolList découpe sur les virgules et les retours à la ligne', () => {
    expect(parseToolList('Read, Grep\nBash(curl:*) ,')).toEqual(['Read', 'Grep', 'Bash(curl:*)'])
  })

  it('parseToolList sur une chaîne vide rend une liste vide', () => {
    expect(parseToolList('  ')).toEqual([])
  })
})
