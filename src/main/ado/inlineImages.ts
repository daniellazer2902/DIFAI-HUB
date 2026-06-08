/** Récupère une pièce jointe authentifiée → {mime, base64}, ou null si échec / trop volumineux. */
export type AttachmentFetcher = (url: string) => Promise<{ mime: string; base64: string } | null>

const IMG_SRC = /(<img\b[^>]*?\ssrc=")([^"]+)("[^>]*>)/gi

/** Remplace les <img> pointant vers des pièces jointes ADO (/_apis/wit/attachments/) par un data: URI. */
export async function inlineImages(html: string, fetchAttachment: AttachmentFetcher): Promise<string> {
  if (!html) return html
  const urls = new Set<string>()
  for (const m of html.matchAll(IMG_SRC)) {
    if (m[2].includes('/_apis/wit/attachments/')) urls.add(m[2])
  }
  if (urls.size === 0) return html
  const map = new Map<string, string>()
  for (const url of urls) {
    const a = await fetchAttachment(url)
    if (a) map.set(url, `data:${a.mime};base64,${a.base64}`)
  }
  return html.replace(IMG_SRC, (full, pre, src, post) => (map.has(src) ? `${pre}${map.get(src)}${post}` : full))
}
