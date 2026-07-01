import pty from 'node-pty'
import type { PtySpawner } from './PtyManager'

// Adapte node-pty à l'interface PtySpawner (file, args, opts).
// Sous Windows, on force la DLL ConPTY moderne embarquée par node-pty (useConptyDll)
// au lieu du conhost de l'OS : comportement correct et identique sur Win10 comme Win11,
// sans dépendre de l'installation de Windows Terminal par l'utilisateur.
export const nodePtySpawner: PtySpawner = (file, args, opts) =>
  pty.spawn(file, args, { ...opts, useConptyDll: process.platform === 'win32' })
