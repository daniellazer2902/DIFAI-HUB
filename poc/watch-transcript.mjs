// Surveille un repertoire et logge tout fichier cree/modifie avec sa taille.
// Usage: node watch-transcript.mjs "<dossier du transcript_path recu>"
import chokidar from 'chokidar';
import { statSync } from 'node:fs';
import { basename } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node watch-transcript.mjs <dir>'); process.exit(1); }

const size = (f) => { try { return statSync(f).size; } catch { return '?'; } };

chokidar.watch(dir, { ignoreInitial: false, depth: 1 })
  .on('add', (f) => console.log(`[ADD]    ${basename(f)}  (${size(f)} o)`))
  .on('change', (f) => console.log(`[CHANGE] ${basename(f)}  (${size(f)} o)`));

console.log(`[poc] watch sur: ${dir}`);
