// src/main/modules/notesModule.ts
import { readdirSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { dialog, shell } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '../../shared/ipc'
import type { AppContext, HubModule } from '../AppContext'
import type { NotesResult, NotesTree, NoteFile, NoteAsset } from '../../shared/ipc'
import { buildNoteTree, type DirEntry } from '../notes/noteTree'
import { isInside } from '../notes/paths'
import { readAssetDataUri } from '../notes/assets'

const MD_RE = /\.(md|markdown)$/i

function listDir(dir: string): DirEntry[] {
  return readdirSync(dir, { withFileTypes: true }).map((d) => ({ name: d.name, dir: d.isDirectory() }))
}

export function createNotesModule(): HubModule {
  return {
    name: 'notes',
    register(ctx: AppContext): void {
      const watchers = new Map<string, FSWatcher>() // itemId -> watcher

      ctx.ipc.handle(IPC.NotesPickFolder, async () => {
        const r = await dialog.showOpenDialog({ properties: ['openDirectory'] })
        return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
      })
      ctx.ipc.handle(IPC.NotesPickFile, async () => {
        const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] })
        return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
      })
      ctx.ipc.handle(IPC.NotesTree, (_e, root: string): NotesResult<NotesTree> => {
        try { return { ok: true, data: buildNoteTree(root, listDir) } }
        catch (err) { return { ok: false, error: (err as Error).message } }
      })
      ctx.ipc.handle(IPC.NotesRead, (_e, root: string, path: string): NotesResult<NoteFile> => {
        try {
          if (!isInside(root, path) || !MD_RE.test(path)) return { ok: false, error: 'Chemin hors vault' }
          return { ok: true, data: { path, markdown: readFileSync(path, 'utf8') } }
        } catch (err) { return { ok: false, error: (err as Error).message } }
      })
      ctx.ipc.handle(IPC.NotesAsset, (_e, root: string, path: string): NotesResult<NoteAsset> => {
        if (!isInside(root, path)) return { ok: false, error: 'Asset hors vault' }
        const dataUri = readAssetDataUri(path)
        return dataUri ? { ok: true, data: { dataUri } } : { ok: false, error: `Image illisible: ${extname(path)}` }
      })
      // Fire-and-forget (preload utilise ipcRenderer.send) -> ctx.ipc.on, comme sessionModule pour input/resize/kill.
      ctx.ipc.on(IPC.NotesOpenExternal, (_e, url: string) => {
        if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
      })
      ctx.ipc.on(IPC.NotesWatch, (_e, itemId: string, root: string) => {
        watchers.get(itemId)?.close()
        const w = chokidar.watch(root, {
          ignoreInitial: true, depth: 12,
          ignored: (p: string) => /(^|[\\/])(\.obsidian|\.git|\.trash|node_modules)([\\/]|$)/.test(p)
        })
        const emit = (event: string) => (p: string) => ctx.sender.send(IPC.NotesChanged, itemId, event, p)
        w.on('change', emit('change')).on('add', emit('add')).on('unlink', emit('unlink'))
         .on('addDir', emit('addDir')).on('unlinkDir', emit('unlinkDir'))
        watchers.set(itemId, w)
      })
      ctx.ipc.on(IPC.NotesUnwatch, (_e, itemId: string) => {
        watchers.get(itemId)?.close()
        watchers.delete(itemId)
      })
    }
  }
}
