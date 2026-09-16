import { describe, it, expect } from 'vitest'
import { renderPrompt, promptVars, DEFAULT_REVIEW_PROMPT, DEFAULT_ALLOWED_TOOLS } from '../src/main/automations/renderPrompt'
import type { AdoPullRequest } from '../src/shared/ipc'

const pr: AdoPullRequest = {
  prId: 1842, project: 'BanqueAlim', repo: 'PortailAsso', title: 'feat(proxidon): activation dédiée',
  author: 'Dev A', sourceBranch: 'feat/x', targetBranch: 'develop',
  url: 'https://dev.azure.com/acme/BanqueAlim/_git/PortailAsso/pullrequest/1842'
}

describe('renderPrompt', () => {
  it('substitue les variables connues', () => {
    expect(renderPrompt('PR {{prId}} sur {{repo}}', promptVars(pr, 'acme')))
      .toBe('PR 1842 sur PortailAsso')
  })

  it('laisse intacte une variable inconnue', () => {
    expect(renderPrompt('x {{inconnue}} y', promptVars(pr, 'acme'))).toBe('x {{inconnue}} y')
  })

  it('n interprète pas le contenu substitué', () => {
    const hostile = { ...pr, title: '{{prId}} et $(rm -rf /)' }
    const out = renderPrompt('Titre : {{title}}', promptVars(hostile, 'acme'))
    expect(out).toBe('Titre : {{prId}} et $(rm -rf /)')
  })

  it('substitue toutes les occurrences d une même variable', () => {
    expect(renderPrompt('{{repo}}/{{repo}}', promptVars(pr, 'acme'))).toBe('PortailAsso/PortailAsso')
  })

  it('le gabarit par défaut renseigne les quatre reponses du Step 0', () => {
    const out = renderPrompt(DEFAULT_REVIEW_PROMPT, promptVars(pr, 'acme'))
    expect(out).toContain('/difai-tech-devops-ado-code-review')
    expect(out).toContain('Organisation : acme')
    expect(out).toContain('Projet : BanqueAlim')
    expect(out).toContain('Repository : PortailAsso')
    expect(out).toContain('PR : 1842')
    expect(out).toContain('$ADO_PAT')
    expect(out).not.toContain('{{')
  })

  it('le préréglage d outils exclut l écriture de fichiers', () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Read')
    expect(DEFAULT_ALLOWED_TOOLS).not.toContain('Edit')
    expect(DEFAULT_ALLOWED_TOOLS).not.toContain('Write')
  })
})
