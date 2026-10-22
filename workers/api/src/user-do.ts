// UserDO — one per user (idFromName(uid)). Holds refresh-token HASHES only (Cloudflare-only sensitive
// state, docs/SECRETS_AND_SENSITIVE_DATA.md). Single-threaded, so two refreshes can't both win.
import { DurableObject } from "cloudflare:workers";
import { REFRESH_TTL_MS, sha256 } from "./auth/session";

interface RefreshRecord { hash: string; exp: number; prevHash: string | null }

export class UserDO extends DurableObject {
  /** New session family `sid`; stores the hash of its first refresh secret. */
  async issue(sid: string, secret: string, now: number): Promise<void> {
    const rec: RefreshRecord = { hash: await sha256(secret), exp: now + REFRESH_TTL_MS, prevHash: null };
    await this.ctx.storage.put(`rt:${sid}`, rec);
    await this.prune(now);
  }

  /**
   * Rotate: the presented secret must be the current one. Presenting the PREVIOUS (already used)
   * secret means it was stolen or replayed → the whole session is revoked (reuse detection).
   */
  async rotate(sid: string, secret: string, next: string, now: number): Promise<"ok" | "invalid" | "reused"> {
    const rec = await this.ctx.storage.get<RefreshRecord>(`rt:${sid}`);
    if (!rec || rec.exp <= now) return "invalid";
    const h = await sha256(secret);
    if (h === rec.prevHash) {
      await this.ctx.storage.delete(`rt:${sid}`);
      return "reused";
    }
    if (h !== rec.hash) return "invalid";
    await this.ctx.storage.put(`rt:${sid}`, { hash: await sha256(next), exp: now + REFRESH_TTL_MS, prevHash: h } satisfies RefreshRecord);
    return "ok";
  }

  async isActive(sid: string, now: number): Promise<boolean> {
    const rec = await this.ctx.storage.get<RefreshRecord>(`rt:${sid}`);
    return !!rec && rec.exp > now;
  }

  async revoke(sid: string): Promise<void> {
    await this.ctx.storage.delete(`rt:${sid}`);
  }

  async revokeAll(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async prune(now: number) {
    const all = await this.ctx.storage.list<RefreshRecord>({ prefix: "rt:" });
    const dead = [...all].filter(([, r]) => r.exp <= now).map(([k]) => k);
    if (dead.length) await this.ctx.storage.delete(dead);
  }
}
