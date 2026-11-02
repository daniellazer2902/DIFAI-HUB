/**
 * Cache + sauvegarde debouncée des mémos, partagé entre l'onglet et la fenêtre flottante :
 * les deux éditeurs d'un même mémo restent synchronisés via `subscribe`.
 */
export interface MemoBackend {
  load(id: string): Promise<string>
  save(id: string, html: string): Promise<void>
  remove(id: string): void
}

type Listener = (html: string, source: string) => void

export interface MemoSync {
  load(id: string): Promise<string>
  /** Contenu en cache (undefined si jamais chargé). */
  peek(id: string): string | undefined
  update(id: string, html: string, source: string): void
  flush(id: string): Promise<void>
  flushAll(): Promise<void>
  remove(id: string): void
  subscribe(id: string, cb: Listener): () => void
  pending(): string[]
}

export const MEMO_SAVE_DELAY = 500

export function createMemoSync(backend: () => MemoBackend, delay = MEMO_SAVE_DELAY): MemoSync {
  const cache = new Map<string, string>()
  const loading = new Map<string, Promise<string>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const listeners = new Map<string, Set<Listener>>()

  async function flush(id: string): Promise<void> {
    const t = timers.get(id)
    if (!t) return
    clearTimeout(t)
    timers.delete(id)
    const html = cache.get(id)
    if (html !== undefined) await backend().save(id, html)
  }

  return {
    load(id) {
      if (cache.has(id)) return Promise.resolve(cache.get(id) as string)
      let p = loading.get(id)
      if (!p) {
        p = backend().load(id).then((html) => {
          loading.delete(id)
          // Une frappe arrivée pendant le chargement l'emporte sur le disque.
          if (!cache.has(id)) cache.set(id, html ?? '')
          return cache.get(id) as string
        }, () => { loading.delete(id); if (!cache.has(id)) cache.set(id, ''); return cache.get(id) as string })
        loading.set(id, p)
      }
      return p
    },
    peek: (id) => cache.get(id),
    update(id, html, source) {
      if (cache.get(id) === html) return
      cache.set(id, html)
      listeners.get(id)?.forEach((cb) => cb(html, source))
      const t = timers.get(id)
      if (t) clearTimeout(t)
      timers.set(id, setTimeout(() => { void flush(id) }, delay))
    },
    flush,
    async flushAll() {
      await Promise.all([...timers.keys()].map((id) => flush(id)))
    },
    remove(id) {
      const t = timers.get(id)
      if (t) clearTimeout(t)
      timers.delete(id)
      cache.delete(id)
      listeners.delete(id)
      backend().remove(id)
    },
    subscribe(id, cb) {
      let set = listeners.get(id)
      if (!set) { set = new Set(); listeners.set(id, set) }
      set.add(cb)
      return () => { listeners.get(id)?.delete(cb) }
    },
    pending: () => [...timers.keys()]
  }
}

export const memoSync = createMemoSync(() => ({
  load: (id) => window.hub.memoLoad(id),
  save: (id, html) => window.hub.memoSave(id, html),
  remove: (id) => window.hub.memoDelete(id)
}))
