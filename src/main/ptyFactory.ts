import pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

// Adapte node-pty à l'interface PtySpawner attendue par PtyManager.
export const nodePtySpawner: PtySpawner = (file, opts) => pty.spawn(file, [], opts)
