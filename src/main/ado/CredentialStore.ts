import { join } from 'node:path'

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
}
interface FsLike {
  readFileSync(p: string, enc?: string): string
  writeFileSync(p: string, data: string, enc?: string): void
}

const FILE = 'credentials.json'

/** PAT chiffrés via safeStorage, sérialisés en base64 dans credentials.json. */
export class CredentialStore {
  private map: Record<string, string> // connId -> base64(cipher)
  constructor(private dir: string, private safe: SafeStorageLike, private fs: FsLike) {
    this.map = this.read()
  }
  private path(): string { return join(this.dir, FILE) }
  private read(): Record<string, string> {
    try { return JSON.parse(this.fs.readFileSync(this.path(), 'utf8')) } catch { return {} }
  }
  private flush(): void {
    try { this.fs.writeFileSync(this.path(), JSON.stringify(this.map), 'utf8') } catch { /* ignore */ }
  }
  set(connId: string, pat: string): void {
    if (!this.safe.isEncryptionAvailable()) { this.map[connId] = 'plain:' + Buffer.from(pat).toString('base64'); this.flush(); return }
    this.map[connId] = this.safe.encryptString(pat).toString('base64')
    this.flush()
  }
  get(connId: string): string | null {
    const v = this.map[connId]
    if (!v) return null
    if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString('utf8')
    try { return this.safe.decryptString(Buffer.from(v, 'base64')) } catch { return null }
  }
  delete(connId: string): void { delete this.map[connId]; this.flush() }
}
