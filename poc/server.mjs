import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const PORT = 7711;

const server = createServer((req, res) => {
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    console.log('[HOOK RECU]', body);
    appendFileSync('captured-hooks.jsonl', body + '\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`POC server: http://127.0.0.1:${PORT}`);
});
