# Database schemas

Every place HangCord stores data, from the device up to the cold archive. The status marks show what exists today:

| Mark | Meaning |
|---|---|
| ✅ | In `main` and tested |
| 🧪 | Written and tested in checkpoint 2 (`b65d0d2`, `7b97ac0`), then **reverted** (`f036237`); recover with `git show b65d0d2:workers/api/migrations/0001_init.sql` and so on |
| 🔧 | Implemented in the current local candidate; not pushed or deployed |
| 📐 | Designed in the docs, not built yet |

**Sources of truth:** `docs/ACCESS_AND_SETTINGS.md` §13 (data model), `docs/MASTER_PLAN.md` §7–8 (storage, rotation, CSV), and `packages/protocol` (the JSON shapes on the wire). If this file disagrees with them, fix the docs first and then this file.

## Ground rules (apply to every store)
- **Access data only in D1.** Hangouts, roles, members, rooms, overrides, bans and hangout keys live only in D1 and are never moved to a spill tier. If D1 can't answer, access checks fail **closed**.
- **Journal first.** Every write of every kind goes into the CSV journal before it's applied (MASTER_PLAN §8.5).
- **Encrypted at rest.** Message bodies are encrypted with the room data key before they reach any database. Wrapped keys stay wrapped, and no plain secret ever enters a database, a CSV, KV or a log.
- **ID formats:**
  - User ids are Firebase uids.
  - Hangout, room and message ids are 1–64 characters of `a-z 0-9 _ -`, because they're used in cache keys. The reverted code used 16 random characters from `a-z2-7`.
- **Permission bitfields** are unsigned 64-bit numbers stored and sent as **decimal strings**, using bits 0–59 (ACCESS_AND_SETTINGS §3).
- **Versions:**
  - `hangouts.version` goes up by 1 on every change that affects the hangout snapshot. Any access change bumps both `perm_version` **and** `version`.
  - `user_prefs.version` goes up by 1 on every preference change.

## 1. Device (Ground 0)

### ✅ Desktop encrypted cache: `cache.sqlite3` (`apps/desktop/src-tauri/src/cache.rs`)
```sql
PRAGMA journal_mode=WAL;
CREATE TABLE kv (
  k TEXT PRIMARY KEY,   -- cache key: [a-z0-9:_.-], ≤ 200 chars
  n BLOB NOT NULL,      -- 12-byte AES-GCM nonce, fresh per write
  v BLOB NOT NULL,      -- AES-256-GCM(value JSON), AAD = k  → rows can't be swapped
  t INTEGER NOT NULL    -- last write, Unix ms
);
```
- **Keys:** `prefs` holds the preferences; `hangout:<hangoutId>` holds one hangout snapshot (up to 50, least-recently-used first out).
- **Limits:** 2 MB per value and 64 MB per file (beyond that, the error `full`).
- **Wipe** (on sign-out or removal): DELETE, then `wal_checkpoint(TRUNCATE)`, then VACUUM.
- **Damaged rows:** a row that fails to decrypt is deleted and fetched again.
- **Files:** the data folder is 0700 and the files are 0600.
- **Device key:** 32 random bytes, kept in the OS keychain (`app.hangcord.desktop`). There's a 0600 `cache.key` fallback when no keychain exists, which is acceptable because the cache never holds secrets.
- **Values** are the protocol shapes `Preferences` and `HangoutSnapshot`, checked with zod when read back (`packages/cache`).

### 📐 Web companion (WebApp branch)
The same `CacheStore` keys, in SQLite-WASM on OPFS (IndexedDB as fallback). They're encrypted with a non-extractable WebCrypto key; phones keep at most 20 snapshots.

### 📐 Desktop outbox
Unsent messages are kept locally until their `MESSAGE_ACK` arrives (MASTER_PLAN §5.2).

## 2. Cloudflare D1: the main database

### 🔧 `0001_init.sql` + `0002_verified_user_facts.sql` (checkpoint 2)
```sql
CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, email TEXT, avatar_url TEXT,
  provider TEXT NOT NULL /* google.com | password */, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE user_prefs (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL,
  prefs_json TEXT NOT NULL /* {key: {value, updatedAt}}, tombstone = {value: null} */, updated_at INTEGER NOT NULL);

CREATE TABLE hangouts (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, icon TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}', verification_level INTEGER NOT NULL DEFAULT 0, policy_flags INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1, perm_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, deleted_at INTEGER);

CREATE TABLE roles (id TEXT PRIMARY KEY /* @everyone: id = hangout id */, hangout_id TEXT NOT NULL, name TEXT NOT NULL,
  color TEXT, position INTEGER NOT NULL, permissions TEXT NOT NULL /* u64 decimal */);
CREATE INDEX roles_by_hangout ON roles(hangout_id);

CREATE TABLE members (hangout_id TEXT NOT NULL, user_id TEXT NOT NULL, nickname TEXT, roles_json TEXT NOT NULL DEFAULT '[]',
  joined_at INTEGER NOT NULL, timeout_until INTEGER, flags INTEGER NOT NULL DEFAULT 0 /* 1 = pending rules */,
  PRIMARY KEY (hangout_id, user_id));
CREATE INDEX members_by_user ON members(user_id);

CREATE TABLE rooms (id TEXT PRIMARY KEY, hangout_id TEXT NOT NULL,
  type TEXT NOT NULL /* text|lounge|spotlight|board|bulletin|category */, category_id TEXT, position INTEGER NOT NULL,
  name TEXT NOT NULL, topic TEXT, settings_json TEXT NOT NULL DEFAULT '{}' /* categories: roomDefaults, guidelinesText */,
  sync_with_category INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX rooms_by_hangout ON rooms(hangout_id);

CREATE TABLE overrides (room_id TEXT NOT NULL, target_type TEXT NOT NULL /* role|member */, target_id TEXT NOT NULL,
  allow TEXT NOT NULL, deny TEXT NOT NULL, PRIMARY KEY (room_id, target_type, target_id));

-- Write-ahead journal, Layer 1 (MASTER_PLAN §8.5): written in the SAME D1 batch as the change it records.
CREATE TABLE journal (seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, db TEXT NOT NULL /* d1|firestore */,
  tbl TEXT NOT NULL, op TEXT NOT NULL /* insert|update|delete */, pk TEXT NOT NULL /* JSON */, cols TEXT NOT NULL /* JSON */);
```

`0002_verified_user_facts.sql` adds `users.email_verified` and `users.adult_confirmed`, integer booleans defaulting to 0. Verified Firebase sign-in updates the former; no adult-confirmation endpoint exists in this slice. Gate ages use the server-owned `users.created_at` and `members.joined_at`, not client preferences or Firebase's last-authentication timestamp.

Preference writes guard both the journal row and data mutation with the expected version. Room-creation batches share the loaded hangout version and permission version, advance the version last, and return 409 on a competing change. Every future access mutator must advance both versions atomically. Failed guards leave no phantom journal entries.

### 🧪 Historical `0002_messages.sql` (checkpoint 2.1; not currently restored)
The future messages migration needs the next free migration number; `0002` is now the gate-facts migration.
```sql
CREATE TABLE messages (id TEXT PRIMARY KEY, hangout_id TEXT NOT NULL, room_id TEXT NOT NULL, author_id TEXT NOT NULL,
  body_enc TEXT NOT NULL /* v1.<iv>.<ciphertext>, AAD = hangoutId|roomId|messageId|epoch */, epoch INTEGER NOT NULL,
  created_at INTEGER NOT NULL, edited_at INTEGER, deleted_at INTEGER);
CREATE INDEX messages_by_room ON messages(room_id, created_at);

CREATE TABLE hangout_keys (hangout_id TEXT NOT NULL, epoch INTEGER NOT NULL, kek_version INTEGER NOT NULL,
  wrapped_key TEXT NOT NULL /* AES-GCM(HSK) under HANGCORD_KEK_V<n>, AAD = hangoutId|epoch|kekVersion */,
  iv TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL, retired_at INTEGER,
  PRIMARY KEY (hangout_id, epoch));
```

### 📐 Still to add (ACCESS_AND_SETTINGS §12–13, MASTER_PLAN §8.3)
```
bans(hangout_id, user_id, reason, banned_by, at)
invites(code, hangout_id, room_id, created_by, max_age, max_uses, uses, temporary, expires_at, mac)
audit_log(id, hangout_id, at, actor_id, action, target_type, target_id, changes JSON, reason ≤512, step_up, prev_hash, hash)  -- hash chain per hangout
automod_rules(id, hangout_id, json)
security_actions(hangout_id, invites_paused_until, dms_paused_until, raised_by, note)
csv_snapshots(id, created_at, from_db, first_seq, last_seq, row_count, sha256, bytes BLOB)   -- snapshot mode: ONE row per snapshot
hangout_keys: + ref_count (per the docs)
```
Every new table is added to **both** the journal and the daily CSV export.

## 3. Firestore (main project)
- 📐 `users/{uid}/private/vault/hangoutKeys/{hangoutId}` holds each member's **encrypted** copy of the hangout key, plus a membership proof.
  - It's wrapped with a per-user key, `HKDF(KEK, uid)`, with AAD `uid|hangoutId|epoch|kekVersion`.
  - It's deleted when the member leaves, is kicked or banned, deletes their account, or the hangout is deleted.
- 📐 `csvSnapshots/{id}` has a `bytes` field. It's used only when D1 is out of writes and holds one gzipped CSV of ≤ 700 KB.
- **Security rules (both projects): deny all.** Only the Workers' service accounts read or write.
```
rules_version = '2';
service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }
```

## 4. Firestore backup (separate project, Firestore only, no sign-in)
- 📐 `csvSnapshots/{id}`, used **only** when D1 and Firestore have both failed or run out of writes. It's emptied when the data goes back home.

## 5. Backup DB #2 (last resort)
- 📐 Reached only through a `SnapshotStore` adapter (`put` / `get` / `delete` / `health`). The provider and key come from the owner; agents never choose one.

## 6. Durable Object storage (Cloudflare-only sensitive state)
| Object | Holds | Status |
|---|---|---|
| `UserDO` (api) | SQLite `refresh_families(sid, hash, exp)` and `refresh_used(sid, hash)`. Atomic single-use rotation; any consumed-token replay revokes the family. A fixed 30-day deadline and alarms remove expired families and hashes. API access checks `isActive` on every protected request. No raw tokens or CSV export of hashes | 🔧 |
| `HangoutDO` (gateway) | `hangoutId`, `seq`, `key:<epoch>` (a wrapped key copy), and a SQLite `messages(id, room_id, author_id, body_enc, epoch, created_at, edited_at, nonce, UNIQUE(author_id, nonce))` table as the hot live window | 🧪 |
| `VerificationDO` (api) | one per `HMAC(pepper, email)`: `{codeHash, purpose, uid, expiresAt, attempts, sendsThisHour, hourStart, lastSentAt}`. An alarm deletes it at expiry | 📐 |
| `RateLimitDO` | rate-limit counters | 📐 |
| `StorageRouter` (storage-router) | the quota meter per database, the routing index (`committed@tier` / `saved@snapshot:{db}:{id}`), and the journal chunks waiting to be sealed | 📐 |

## 7. R2 and object tiers
- 📐 `journal/YYYY-MM-DD/NNNNNN.csv.gz.enc`: sealed journal chunks (every 30 s or 500 rows), encrypted with `CSV_ROUTINE_KEY`, with a SHA-256 of the plain CSV.
- 📐 `backups/csv/YYYY-MM-DD/{db}/{table}.csv.gz.enc` plus `manifest.csv`: the daily export at 01:00 UTC, encrypted to the **emergency public key**. A copy goes to Backblaze B2. Retention is 7 daily, 4 weekly and 6 monthly.
- 📐 Media: R2 holds hot media, then Backblaze B2 / Garage (cool), then Oracle Archive (cold).
- **Order of jobs:** export at 01:00 UTC; the journal is truncated at the 01:30 tick only after its chunks are committed **and** included in a verified export.

## 8. Not stored anywhere (on purpose)
Plain hangout keys, the KEK, refresh tokens, plain email codes, passwords (Firebase holds those), and Firebase or other API keys outside Workers configuration. Short-lived security data (code HMACs, refresh-token hashes, rate counters) is left out of the CSV exports; after a disaster restore, people sign in again.
