import type { PtyManager } from '../PtyManager'
import type { AdoPullRequest } from '../../shared/ipc'
import { renderPrompt, promptVars } from './renderPrompt'

export interface RunnerDeps {
  pty: PtyManager
  settingsPath: () => string
  hookPort: () => number
}

export interface RunLaunchOptions {
  cwd: string
  org: string
  pat: string
  prompt: string
  allowedTools: string[]
  pr: AdoPullRequest
}

export function buildRunArgs(o: { settingsPath: string; allowedTools: string[]; prompt: string }): string[] {
  return [
    '--settings', o.settingsPath,
    ...(o.allowedTools.length ? ['--allowedTools', o.allowedTools.join(',')] : []),
    o.prompt
  ]
}

export class AutomationRunner {
  constructor(private deps: RunnerDeps) {}

  /** Lance la session amorcée ; renvoie le tabId du pty créé. */
  start(o: RunLaunchOptions): string {
    const prompt = renderPrompt(o.prompt, promptVars(o.pr, o.org))
    return this.deps.pty.create(o.cwd, {
      args: buildRunArgs({ settingsPath: this.deps.settingsPath(), allowedTools: o.allowedTools, prompt }),
      env: { DIFAI_HUB_PORT: String(this.deps.hookPort()), ADO_PAT: o.pat }
    })
  }
}
