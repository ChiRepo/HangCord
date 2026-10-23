// UserDO — one per user (idFromName(uid)). Holds refresh-token HASHES only (Cloudflare-only sensitive
// state, docs/SECRETS_AND_SENSITIVE_DATA.md). Rotation is atomic even when hashing yields to another request.
import { DurableObject } from "cloudflare:workers";
import { REFRESH_TTL_MS, sha256 } from "@hangcord/server";

type RefreshRecord = { hash: string; exp: number };

export class UserDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS refresh_families (
        sid TEXT PRIMARY KEY, hash TEXT NOT NULL, exp INTEGER NOT NULL
      ); CREATE INDEX IF NOT EXISTS refresh_exp ON refresh_families(exp);
      CREATE TABLE IF NOT EXISTS refresh_used (
        sid TEXT NOT NULL REFERENCES refresh_families(sid) ON DELETE CASCADE,
        hash TEXT NOT NULL, PRIMARY KEY(sid, hash)
      );`);
    });
  }

  /** New session family `sid`; stores the hash of its first refresh secret. */
  async issue(sid: string, secret: string, now: number): Promise<void> {
    const hash = await sha256(secret);
    this.ctx.storage.transactionSync(() => {
      this.prune(now);
      // Never overwrite a family: a reused ID must not resurrect a revoked session.
      this.ctx.storage.sql.exec("INSERT INTO refresh_families(sid, hash, exp) VALUES (?, ?, ?)", sid, hash, now + REFRESH_TTL_MS);
    });
    await this.scheduleCleanup();
  }

  /**
   * Rotate: the presented secret must be the current one. Presenting ANY already consumed secret
   * revokes the family. Hash before transactionSync: no await separates the comparison and update.
   * https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transactionsync
   */
  async rotate(sid: string, secret: string, next: string, now: number): Promise<"ok" | "invalid" | "reused"> {
    const [hash, nextHash] = await Promise.all([sha256(secret), sha256(next)]);
    const result = this.ctx.storage.transactionSync(() => {
      const rec = this.ctx.storage.sql.exec<RefreshRecord>("SELECT hash, exp FROM refresh_families WHERE sid = ?", sid).toArray()[0];
      if (!rec || rec.exp <= now) {
        if (rec) this.remove(sid);
        return "invalid" as const;
      }
      if (this.ctx.storage.sql.exec("SELECT 1 FROM refresh_used WHERE sid = ? AND hash = ?", sid, hash).toArray().length) {
        this.remove(sid);
        return "reused" as const;
      }
      if (hash !== rec.hash || hash === nextHash) return "invalid" as const;
      this.ctx.storage.sql.exec("INSERT INTO refresh_used(sid, hash) VALUES (?, ?)", sid, hash);
      this.ctx.storage.sql.exec("UPDATE refresh_families SET hash = ? WHERE sid = ?", nextHash, sid);
      return "ok" as const;
    });
    await this.scheduleCleanup();
    return result;
  }

  async isActive(sid: string, now: number): Promise<boolean> {
    const rec = this.ctx.storage.sql.exec<{ exp: number }>("SELECT exp FROM refresh_families WHERE sid = ?", sid).toArray()[0];
    return !!rec && rec.exp > now;
  }

  async revoke(sid: string): Promise<void> {
    this.ctx.storage.transactionSync(() => this.remove(sid));
    await this.scheduleCleanup();
  }

  async revokeAll(): Promise<void> {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM refresh_used; DELETE FROM refresh_families");
    });
    await this.scheduleCleanup();
  }

  override async alarm(): Promise<void> {
    this.ctx.storage.transactionSync(() => this.prune(Date.now()));
    await this.scheduleCleanup();
  }

  private remove(sid: string): void {
    this.ctx.storage.sql.exec("DELETE FROM refresh_used WHERE sid = ?", sid);
    this.ctx.storage.sql.exec("DELETE FROM refresh_families WHERE sid = ?", sid);
  }

  private prune(now: number): void {
    this.ctx.storage.sql.exec("DELETE FROM refresh_used WHERE sid IN (SELECT sid FROM refresh_families WHERE exp <= ?)", now);
    this.ctx.storage.sql.exec("DELETE FROM refresh_families WHERE exp <= ?", now);
  }

  private async scheduleCleanup(): Promise<void> {
    // No await between reading the next expiry and scheduling: concurrent requests cannot overwrite
    // an earlier deadline with a stale one. Durable Object output gates persist this before replying.
    const next = this.ctx.storage.sql.exec<{ exp: number | null }>("SELECT MIN(exp) AS exp FROM refresh_families").one().exp;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}
