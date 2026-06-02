// Hook SessionStart : lit l'evenement sur stdin, lit DIFAI_HUB_TAB dans l'env,
// POST la correlation au serveur local du POC.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8')); // fd 0 = stdin
const payload = JSON.stringify({
  hook: 'SessionStart',
  tabId: process.env.DIFAI_HUB_TAB ?? null,
  session_id: input.session_id ?? null,
  transcript_path: input.transcript_path ?? null,
  cwd: input.cwd ?? null,
  source: input.source ?? null,
});

try {
  await fetch('http://127.0.0.1:7711', { method: 'POST', body: payload });
} catch (e) {
  // ne jamais bloquer la session si le hub est absent
  process.stderr.write(`[poc hook] POST echoue: ${e}\n`);
}
