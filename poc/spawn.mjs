import pty from 'node-pty';

const TAB_ID = 'poc-tab-1';
const shell = process.platform === 'win32' ? 'claude.cmd' : 'claude';

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
