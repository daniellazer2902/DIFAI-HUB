// Hook generique POC : lit l'evenement sur stdin, y ajoute DIFAI_HUB_TAB depuis l'env,
// et POST l'event COMPLET au serveur local. Sert pour SessionStart, SubagentStop, etc.
// (input.hook_event_name distingue le type ; on forwarde tous les champs tels quels).
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8')); // fd 0 = stdin
const payload = JSON.stringify({
  ...input,
  tabId: process.env.DIFAI_HUB_TAB ?? null,
});

try {
  await fetch('http://127.0.0.1:7711', { method: 'POST', body: payload });
} catch (e) {
  // ne jamais bloquer la session si le hub est absent
  process.stderr.write(`[poc hook] POST echoue: ${e}\n`);
}
