import pty from 'node-pty';
import { execSync } from 'node:child_process';

const TAB_ID = 'poc-tab-1';

// FINDING POC : sous Windows, node-pty lance l'exe via CreateProcess — il ne parcourt
// PAS le PATH et ne sait pas executer un shim .cmd. Il faut le chemin ABSOLU de l'exe.
// Le futur PtyManager de l'app devra faire cette resolution.
function resolveClaude() {
  if (process.platform !== 'win32') return 'claude';
  const out = execSync('where claude', { encoding: 'utf8' });
  const exe = out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.toLowerCase().endsWith('.exe'));
  if (!exe) throw new Error('claude.exe introuvable via "where claude"');
  return exe;
}

const shell = resolveClaude();

const term = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 110,
  rows: 32,
  cwd: process.cwd(),
  env: { ...process.env, DIFAI_HUB_TAB: TAB_ID },
});

term.onData((data) => process.stdout.write(data));
term.onExit(({ exitCode }) => {
  console.log(`\n[poc] claude exited (code ${exitCode})`);
  process.exit(exitCode);
});

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on('data', (d) => term.write(d.toString()));
