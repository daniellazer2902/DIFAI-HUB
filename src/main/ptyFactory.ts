import pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

// Adapte node-pty à l'interface PtySpawner (file, args, opts).
export const nodePtySpawner: PtySpawner = (file, args, opts) => pty.spawn(file, args, opts)
