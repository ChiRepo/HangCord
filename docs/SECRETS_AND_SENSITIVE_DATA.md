# HangCord — Secrets and Sensitive Data Register

> Agent: this is the single list of everything sensitive in HangCord and exactly where it lives. If you are about to store, send, log or cache anything on this list somewhere not written here — stop. Add it here first (with the owner's OK), then code it. Names only in this file; **never write a real value anywhere in the repo or docs.**

Status: v1, 2026-10-21 (owner instruction: "everything sensitive — APIs, OTPs, all of it — in Cloudflare Workers server-side").

## 1. The rule in one sentence
**Every secret and every piece of sensitive data lives only on Cloudflare, server-side** (one owner-approved exception: members' *locked* hangout-key copies in their Firestore private vault, §4): fixed secrets in **Workers Secrets**, changing sensitive data in **Durable Object storage** (encrypted at rest by Cloudflare, plus HangCord's own encryption/HMAC using keys from Workers Secrets). Clients, the repo, Firestore, R2, KV and logs never hold a secret.

## 2. Two kinds of sensitive things

| Kind | Examples | Where | Why |
|---|---|---|---|
| **Fixed secrets** (set by the owner, change rarely) | API keys, service-account keys, OAuth client secret, master encryption key, peppers | **Workers Secrets**, one Worker at a time (least privilege), set with `wrangler secret put` | Encrypted by Cloudflare, not visible in the dashboard or Wrangler after being set, read only by the Worker through `env` |
| **Changing sensitive data** (created while the app runs) | email codes (OTP), step-up tokens, session refresh tokens, rate-limit counters, hangout keys (wrapped) | **Durable Object SQLite storage** inside the owning Worker | Workers Secrets can't be written at runtime per user. Durable Objects are private to the Worker, strongly consistent, single-threaded (no race conditions), encrypted at rest (AES-256), and can delete data on a timer (alarms) |

Not used for secrets: **KV** (eventually consistent, only 1,000 writes/day free), **Firestore** (outside Cloudflare — except the per-user *locked* hangout-key copies in §4), **R2**, **GitHub** (code only, never data), **D1** (except the wrapped-key backup in §4), and **Secrets Store** (still open beta — may replace per-Worker secrets later, only with the owner's OK).

## 3. Fixed secrets (Workers Secrets)

Free plan limits: ≤ 64 variables per Worker (secrets + vars), ≤ 5 KB each. Separate values per environment (`dev`, `staging`, `prod`); never reuse prod values in dev.

| Secret name | Used by Worker | What it is | Rotate |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | api | Firebase project identifier, kept server-side by owner decision (2026-10-22); required for token issuer/audience checks | project change |
| `FIREBASE_AUTH_ADMIN_SA_JSON` | api | Google service account limited to Firebase Auth admin (verify, set emailVerified, update password, delete unverified users) | 90 days |
| `FIRESTORE_SA_JSON` | api, storage-router | Service account limited to Firestore read/write (membership proofs, message spill) | 90 days |
| `CSV_ROUTINE_KEY` | storage-router | 32 random bytes (base64); encrypts/decrypts the live CSV journal and snapshots | yearly (old key kept until its files are gone) |
| `CSV_EMERGENCY_PUBLIC_KEY_V1` | storage-router | RSA-4096 public key (SPKI, base64) — **encrypt-only**, locks daily backups and snapshot safety copies | with the private key |
| `CSV_EMERGENCY_PRIVATE_KEY_V1` | **emergency-restore only** (no public route) | RSA-4096 private key (PKCS#8, base64, ~3.2 KB) — the **emergency decryption key**; generated offline by the owner; used only in the break-glass procedure (MASTER_PLAN §8.6) | after every emergency use, and yearly |
| `FIRESTORE_BACKUP_SA_JSON` | storage-router | Service account of the **backup Firebase project**, Firestore read/write only (used only when D1 + Firestore fail) | 90 days |
| `BACKUP2_ENDPOINT`, `BACKUP2_API_KEY` | storage-router | **Backup DB #2** — the owner supplies the provider and key at implementation; stored only here (add more `BACKUP2_*` names in this register first if the provider needs them) | owner's schedule |
| `GOOGLE_OAUTH_DESKTOP_CLIENT_SECRET` | api | Desktop Google sign-in code exchange | on leak |
| `BREVO_API_KEY`, `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `RESEND_API_KEY` | api | Email-code sending | 90 days |
| `EMAIL_CODE_PEPPER` | api | 32-byte random key for HMAC of email codes and email-address hashes | 180 days (old one kept until codes expire) |
| `SESSION_SIGNING_KEY` | api, gateway | Signs 15-minute session tokens | 90 days (two-key overlap) |
| `HANGCORD_KEK_V1` | gateway (HangoutDO) | 32-byte master key that wraps every hangout key | yearly / on suspicion (`_V2` procedure) |
| `TURNSTILE_SECRET_KEY` | api | CAPTCHA verification | on leak |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | api | Minting 10-minute voice tokens | 90 days |
| `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` | api | Minting 1-hour TURN credentials | 90 days |
| `GIF_PROVIDER_API_KEY` | api | GIF search proxy | on leak |
| `B2_KEY_ID`, `B2_APPLICATION_KEY` | storage-router | Backblaze bucket-scoped key | 90 days |
| `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY` | storage-router | Self-hosted S3 on the Oracle VM | 90 days |
| `ORACLE_ARCHIVE_ACCESS_KEY`, `ORACLE_ARCHIVE_SECRET_KEY` | storage-router | Oracle Object Storage (archive tier) customer secret key | 90 days |

**Firebase configuration:** even public identifiers stay in Cloudflare Workers Secrets by the owner's 2026-10-22 decision. Never embed project IDs, Firebase web configuration or API keys in the app or repository. This checkpoint requires only `FIREBASE_PROJECT_ID`; register later sign-in configuration before implementing those routes.

**Other public configuration** (plain `vars`): `GOOGLE_OAUTH_DESKTOP_CLIENT_ID`, `TURNSTILE_SITE_KEY`, `LIVEKIT_URL`, `EMAIL_FROM_ADDRESS`. Never put a registered secret in `vars`.

**How the owner sets them** (agents never see or type the values):
```bash
npx wrangler secret put BREVO_API_KEY --env prod          # paste value when prompted
npx wrangler deploy --env prod --secrets-file ~/hangcord-secrets/prod.env   # bulk, file kept OUTSIDE the repo
```
Local development: `.dev.vars` next to each Worker's Wrangler config, git-ignored; `.dev.vars.example` lists names only.

## 4. Changing sensitive data (Durable Objects)

| Data | Durable Object (Worker) | Stored as | Lifetime / deletion |
|---|---|---|---|
| **Email codes (OTP)** for sign-up, password reset and step-up | `VerificationDO` (api), one object per `HMAC(EMAIL_CODE_PEPPER, normalised email)` | `{codeHash = HMAC(EMAIL_CODE_PEPPER, code\|purpose\|uid), purpose, uid, expiresAt, attempts, sendsThisHour, hourStart, lastSentAt}` — never the plain code, never the plain email | 5 min; DO alarm deletes at expiry; deleted immediately on success; 3 wrong tries → burned |
| **Step-up tokens** (after a correct step-up code) | `UserDO` (gateway) | SHA-256 of a random token, bound to `{action, targetId}` | 5 min, single use, deleted on use |
| **Refresh tokens / sessions** | `UserDO` (api; authoritative for API and future gateway checks) | SHA-256 of the token + device name, created, last used | rotated on every use; revoked on logout / "log out everywhere" / password change |
| **Rate-limit counters** (per user, per IP hash, per email hash) | `RateLimitDO` (api) | counters + window start; IPs stored only as `HMAC(EMAIL_CODE_PEPPER, ip)` | expire with the window (alarm) |
| **Hangout secret keys** | `HangoutDO` (gateway) — primary | wrapped with `HANGCORD_KEK_V1` (AES-256-GCM, AAD = `hangoutId\|epoch\|kekVersion`) | kept per epoch; old epochs read-only |
| Hangout key **backup** | D1 `hangout_keys` (same Cloudflare account) | same wrapped ciphertext | deleted with the hangout (after the 7-day soft delete) |
| Hangout key **member copies** | **Firestore** `users/{uid}/private/vault/hangoutKeys/{hangoutId}` (owner's request: encrypted, deep inside each user's profile) | wrapped with a per-user key = HKDF(`HANGCORD_KEK_V1`, uid); AAD = `uid\|hangoutId\|epoch\|kekVersion`; plus the membership proof | deleted when the member leaves / is kicked / banned / deletes account / hangout deleted; re-wrapped on rotation |
| Unwrapped hangout key | `HangoutDO` **memory only** | non-extractable `CryptoKey` objects (raw bytes zeroed right after import) | ≤ 10 min, never persisted. Exact decryption procedure: ACCESS_AND_SETTINGS §10.6 |
| Pending sign-up profile (name chosen before verification) | `VerificationDO` | display name only | deleted with the code |

**Checkpoint 2.1 implementation status:** HangoutDO alone handles key material. RoomDO receives only ciphertext/epoch or authorized message plaintext through internal RPC. Wrapped bootstrap state survives a failed D1 write and retries the same key. Source 1 (DO) and source 2 (D1 backup) recovery are implemented; source 3 member-vault recovery, rotation, reference-count maintenance and key deletion are still planned. Missing keys fail closed. No new secret names are introduced. Gateway checks session activity through the API UserDO binding.

**CSV snapshots** (MASTER_PLAN §8.3) may temporarily carry rows from this table between the databases (D1, Firestore, and — only if both fail — the Firestore backup and Backup DB #2) when a database's writes run out — only in the same locked form (wrapped key copies, MACs, encrypted message bodies, hashes). A snapshot never contains a plain secret, plain code, plain key or KEK.

Everything in this table stays on Cloudflare **except the members' locked key copies**, which the owner asked to keep in each user's private vault folder in Firestore. Firestore never holds a usable secret: those copies can only be unlocked with the KEK, which exists only in the gateway Worker's Workers Secrets. Firestore otherwise keeps only spilled message rows whose bodies are already encrypted.

## 4a. CSV backups (MASTER_PLAN §8.5)
- **Every CSV is encrypted.** Live journal chunks and snapshots: `CSV_ROUTINE_KEY` (storage-router). Daily backups and snapshot safety copies: the emergency public key, so they **can only be opened with the emergency decryption key** `CSV_EMERGENCY_PRIVATE_KEY_V{n}`, which lives only in the `emergency-restore` Worker's secrets and is used only in the break-glass procedure (MASTER_PLAN §8.6). Stored in R2 with a copy in Backblaze B2.
- **Excluded from every CSV:** email-code HMACs, step-up token hashes, refresh-token hashes, rate-limit counters, and of course the KEK, plain keys and any Workers Secret.
- Wrapped hangout keys and vault copies **are** included (still encrypted), so data can be recovered.
- The owner keeps an **offline copy of every `HANGCORD_KEK_V{n}` and every `CSV_EMERGENCY_PRIVATE_KEY_V{n}`** (password manager or printed in a safe). Losing them makes encrypted data and backups unreadable. Agents never generate, see or handle the emergency private key.

## 5. Things HangCord never stores anywhere
- Plain passwords (Firebase Authentication holds password hashes; HangCord's Worker only passes a new password through to Firebase during reset and never logs or saves it).
- Plain email codes, plain step-up tokens, plain refresh tokens.
- The KEK or an unwrapped hangout key outside HangoutDO memory.
- Raw IP addresses (only HMACs, only in rate-limit counters).
- Any secret inside the desktop/web bundle. The release step scans the built app (including with REA on our own build) for key patterns and fails if it finds one.

## 6. What the client is allowed to hold
| Item | Where on the device | Lifetime |
|---|---|---|
| HangCord session token | memory | 15 min |
| Refresh token | OS keychain (desktop, Rust `keyring`) / httpOnly secure cookie (web) | until rotated or revoked |
| Firebase ID token | Firebase SDK memory | 1 h (only to obtain a HangCord session) |
| LiveKit room token, TURN credentials, presigned upload URL | memory | 10 min / 1 h / 5 min |
| MLS private keys (encrypted DMs) | OS keychain-protected local store; optional passphrase backup | device lifetime |

## 7. Logging and errors
- Never log request bodies on `/auth/*`, `/mls/*`, `/hangouts/*/key/*`, or any header named `Authorization` / `Cookie`.
- Log user references as uid only; email only as its HMAC.
- Error messages never reveal whether an email has an account, whether a code was close, or which secret failed.
- Worker observability/log retention set to the minimum needed; no third-party log shipping of auth routes.

## 8. Checks that must exist
- Test: no CSV export or journal file contains a plain secret, plain code, token hash, rate-limit counter or KEK; every export decrypts with the emergency key (in a test environment with test-only keys) and matches its manifest; the storage-router has no way to decrypt a backup; the emergency-restore Worker refuses outside an open emergency window.
- CI: gitleaks on every commit; fail if any name from §3 appears with a value in the repo.
- Test: every Worker starts and refuses to serve if a required secret is missing (fail closed with a clear startup error, never a default value).
- Test: `VerificationDO` — expiry by alarm, 3-try burn, resend doesn't reset the hourly count, concurrent guesses can't exceed 3 (single-threaded DO), plain code never present in storage.
- Test: Firestore contains no plain secrets or plain codes (emulator scan); every vault key copy is ciphertext bound to its uid and hangout.
- Release: bundle scan for key patterns; secret rotation runbook rehearsed in staging.
