import { describe, it, expect, vi } from 'vitest'
import { AutomationRunner, buildRunArgs } from '../src/main/automations/AutomationRunner'
import { PtyManager } from '../src/main/PtyManager'
import type { AdoPullRequest } from '../src/shared/ipc'

const pr: AdoPullRequest = {
  prId: 1842, project: 'BanqueAlim', repo: 'PortailAsso', title: 'feat: x', author: 'Dev A',
  sourceBranch: 'feat/x', targetBranch: 'develop', url: 'u'
}

function fakePty() {
  const spawn = vi.fn(() => ({
    write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: vi.fn(), onExit: vi.fn()
  }))
  return { spawn, pty: new PtyManager({ spawn: spawn as never, claudePath: 'C:/claude.cmd' }) }
}

describe('buildRunArgs', () => {
  it('place le prompt en dernier, après les réglages et les outils', () => {
    const args = buildRunArgs({ settingsPath: 'S', allowedTools: ['Read', 'Grep'], prompt: 'P' })
    expect(args).toEqual(['--settings', 'S', '--allowedTools', 'Read,Grep', 'P'])
  })

  it('omet --allowedTools quand la liste est vide', () => {
    expect(buildRunArgs({ settingsPath: 'S', allowedTools: [], prompt: 'P' }))
      .toEqual(['--settings', 'S', 'P'])
  })
})

describe('AutomationRunner', () => {
  it('lance le pty dans le cwd demandé et renvoie un tabId', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 7000 })
    const tabId = runner.start({
      cwd: 'C:/travail/banque', org: 'acme', pat: 'secret',
      prompt: 'Revue {{prId}}', allowedTools: ['Read'], pr
    })
    expect(typeof tabId).toBe('string')
    const [, args, opts] = spawn.mock.calls[0]
    expect((opts as { cwd: string }).cwd).toBe('C:/travail/banque')
    expect((args as string[]).at(-1)).toBe('Revue 1842')
  })

  it('injecte le PAT et le port de hooks dans l environnement', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 7000 })
    runner.start({ cwd: 'C:/x', org: 'acme', pat: 'secret', prompt: 'p', allowedTools: [], pr })
    const env = (spawn.mock.calls[0][2] as { env: Record<string, string> }).env
    expect(env.ADO_PAT).toBe('secret')
    expect(env.DIFAI_HUB_PORT).toBe('7000')
    expect(env.DIFAI_HUB_TAB).toBeTruthy()
  })

  it('ne laisse aucune variable non substituée dans le prompt transmis', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 1 })
    runner.start({
      cwd: 'C:/x', org: 'acme', pat: 'p',
      prompt: '{{org}}/{{project}}/{{repo}}#{{prId}} {{title}}', allowedTools: [], pr
    })
    expect((spawn.mock.calls[0][1] as string[]).at(-1))
      .toBe('acme/BanqueAlim/PortailAsso#1842 feat: x')
  })

  it('transmet un prompt multiligne avec accents et apostrophes caractère pour caractère identique', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 1 })
    const multilinePrompt = `Revue détaillée de l'implémentation :
- Architecture et résolution d'erreurs
- Évaluation de la qualité du code`
    runner.start({
      cwd: 'C:/x', org: 'acme', pat: 'secret',
      prompt: multilinePrompt, allowedTools: [], pr
    })
    expect((spawn.mock.calls[0][1] as string[]).at(-1)).toBe(multilinePrompt)
  })

  it('n interprète jamais $ADO_PAT comme une substitution de variable d environnement', () => {
    const { spawn, pty } = fakePty()
    const runner = new AutomationRunner({ pty, settingsPath: () => 'S', hookPort: () => 1 })
    const promptWithPat = 'Utilise $ADO_PAT pour l authentification'
    runner.start({
      cwd: 'C:/x', org: 'acme', pat: 'super-secret-token',
      prompt: promptWithPat, allowedTools: [], pr
    })
    const argsArray = spawn.mock.calls[0][1] as string[]
    expect(argsArray.at(-1)).toBe(promptWithPat)
    expect(argsArray.at(-1)).not.toContain('super-secret-token')
  })
})
