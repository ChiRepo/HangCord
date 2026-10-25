# What changes were made

The history of the work, oldest first. Each entry says what was done, why, and where it lives. Add new entries at the bottom, with the date, what changed, commands run and their result, and what's left.

## 1. Planning and design (2026-10-21)
- **The plan:** wrote `docs/MASTER_PLAN.md`, the main plan.
  - It covers the stack, the workflow–API–app diagrams, the API and realtime contract, the storage design, the memory governor, security, the roadmap and the free-tier limits, with sources.
  - Sign-in is through Firebase Authentication only, in three flows: Google, email + password, and new accounts confirmed with a 6-digit code sent by email. The codes live only on Cloudflare.
- **Access spec:** wrote `docs/ACCESS_AND_SETTINGS.md`, covering permission bits 0–59, the permission algorithm, roles, hierarchy, room and hangout settings, hangout secret keys with each member's encrypted copy, and the audit log.
- **Secrets register:** wrote `docs/SECRETS_AND_SENSITIVE_DATA.md`, listing every secret and sensitive item, where it lives, which Worker reads it, and how it rotates.
- **Databases** (owner's decisions):
  - Two working databases: Cloudflare D1 (the main one) and Firestore.
  - Two backups, used only when both fail: a second Firestore project, then "Backup DB #2" (provider and key to come from the owner).
  - GitHub holds code only, never data.
  - TiDB was considered and cancelled.
- **CSV safety net:**
  - A write-ahead CSV journal for every write.
  - A "snapshot mode" for when a database runs out of free writes or fails: unsaved rows are packed into one CSV and saved as a single item.
  - A daily encrypted CSV export of everything, plus an emergency decryption key kept in its own Worker with no public route.
- **Design skills:** installed three design skill packs (Anthropic skills, UI/UX Pro Max, Bencium) for the redesign.
- **UI/UX redesign "Calm Minimal"** (owner chose it):
  - Look: dark graphite, one warm amber, green for online, flat surfaces, Space Grotesk + Inter.
  - Six screens: Main, Voice, Sign in, Verify, Onboarding, Settings.
  - Owner feedback applied: online status is premium and **round**, with presence badges as perfect circles (dot, crescent, bar, ring).
  - Lives in `ui-ux/calm-minimal/`.

## 2. Checkpoint 1: foundation (`cp-001`)
- **Monorepo:** npm workspaces on Node 22.12+, strict TypeScript, ESLint, Vitest.
- **Contract** (`packages/protocol`):
  - OpenAPI 3.1 plus the gateway events.
  - zod mirrors of the detailed schemas.
  - Permission bits, plus a test that compares them with the docs table.
  - `planNewRoom` (the **+** logic).
  - A contract test that fails if the docs name an endpoint the contract lacks.
- **`packages/cache`:** preference and hangout-snapshot caching with versions, patches, per-key merge, tombstones, LRU 50 (20 on phones) and wipe.
- **`packages/ui`:** Calm Minimal tokens, a contrast check and `PresenceBadge`.
- **Four Workers:** api, gateway, storage-router and emergency-restore.
  - They fail closed if a secret is missing and never name it.
  - There is one 15-minute cron, because the free plan allows 5 per account.
- **Web shell with sample data:**
  - **+** on every category (follow the category's guidelines or set its own, pre-selected by a preference).
  - A phone layout.
  - Playwright tests at desktop and phone sizes, plus axe accessibility checks.
- **Policy tests:**
  - No secrets in Worker vars.
  - Private folders listed in every ignore file.
  - Mobile viewport, `dvh` instead of `vh`, no raw colours, no Discord words in the UI.
- **Other:** LiveKit config for the Oracle VM, and a gitleaks config.
- **Owner's additions in this checkpoint:**
  1. **+** on every category to add text or voice rooms.
  2. Cache hangouts the way preferences are cached.
  3. Optimise every checkpoint for mobile.
- **Free-tier review:** the owner looked at Supabase, Resend and Sentry and **kept the original plan**.

## 3. Checkpoint 1.1: the real desktop application (`cp-001.1`)
- **Tauri 2 app** (`apps/desktop`):
  - Typed IPC: 8 commands, each granted explicitly.
  - Strict CSP, single instance, remembered window size and position.
  - Original app icons.
- **Memory governor:**
  - Sets a budget from the machine's RAM: `min(profile, 25% of available, 1.7 GB)`, never below 250 MB.
  - Counts the whole process tree, using PSS on Linux and skipping threads.
  - Has Green / Yellow / Red zones, Lightweight mode, and a live memory readout in the UI.
- **Encrypted local cache:**
  - SQLite with each value encrypted by AES-256-GCM, a fresh nonce per write, and the key name as AAD.
  - A 64 MB cap, and wipe with VACUUM.
  - The device key is in the OS keychain, with a 0600 file fallback.
- **Two independent reviews;** every must-fix item was fixed and checked.
- **Desktop end-to-end test** (`tests/desktop/run.mjs`, 13 checks) passes on the test build and on the installed `.deb`.
- **Linux installers built:** `.deb` (2.6 MB) and AppImage (78 MB).

## 4. Tooling (2026-10-22)
- **Agent plugins registered:** claude-mem, headroom, token-optimizer, superpowers and context-mode. The owner installs rtk on the Mac. Plugins must never store content from the private folders.
- **Graphify code map** (`graphify/`):
  - A local code graph, made with no AI and no network, pinned to version 0.9.93.
  - Rebuilt with `npm run graph`.
  - CI's `code-map` job fails when the map is stale.
  - A local MCP server (`.mcp.json`, `hangcord-code-map`) lets agents query it.
  - A privacy guard and policy tests keep private and secret files out of the graph.

## 5. GitHub, branches and the first release (2026-10-22)
- **Repo:** the owner created `ChiRepo/HangCord`, which is **public** for now.
- **First commit:** the whole project, with private folders excluded and gitleaks clean.
- **Owner's branch rule: `main` = the real application.**
  - The UI moved from `apps/web` to `apps/desktop/ui`.
  - `tests/e2e` became `tests/ui`, covering desktop window sizes only.
  - The web bundle-size check was removed from `main`.
- **`WebApp`** keeps the full earlier version with `apps/web`, phone tests and the mobile gate.
- **Tags** (added by the owner): `cp-001` → `f6b9ecc` and `cp-001.1` → `6a478e3`.
- **CI fixes:**
  - Uses the pinned gitleaks 8.30.1 CLI.
  - The UI-test preview server binds to `127.0.0.1`.
  - Release files are flattened before checksums.
  - `release.yml` also starts from the `release` branch, because this environment can't push tags.
- **Result:** CI on `main` is green, and a **draft release `v0.0.1`** has installers for macOS, Windows and Linux plus `SHA256SUMS.txt`.

## 6. Checkpoint 2 and 2.1: built, then reverted (2026-10-22)
- **`cp-002` (`b65d0d2`), the server core:**
  - A Firebase ID token check against Google's keys with no SDK.
  - HangCord sessions: 15-minute HMAC tokens, plus single-use refresh tokens whose hashes live in a `UserDO`, with reuse detection.
  - `/me`, and preferences with ETag / If-Match / 412.
  - Hangouts and their snapshot.
  - **+ room**, wired to `planNewRoom` + `computePermissions`.
  - The D1 schema, with every write journaled in the same D1 batch.
  - 15 integration tests against local Cloudflare (workerd).
- **`cp-002.1` (`7b97ac0`), realtime:**
  - One `HangoutDO` per hangout: WebSocket IDENTIFY → READY, live messages with ACK and broadcast, nonce de-dupe and rate limits.
  - REST history and a fallback send.
  - Message bodies encrypted (KEK → hangout key → room key).
  - 10 realtime integration tests.
- **The owner sent the Firebase web configs** for the main and backup projects, and asked that they be **stored in Cloudflare Workers, not in the app or repo**. A partly finished local edit had put the API key in an app file. It was deleted before any commit, so **no Firebase key is in git**.
- **The owner then asked to revert to checkpoint 1.1** while keeping the CI fixes. That's commit `f036237`, a revert commit with no force-push. The code is recoverable with `git revert f036237`, or by cherry-picking parts of `b65d0d2` / `7b97ac0`.


## 7. Checkpoint 2 server core (2026-10-23, pushed)

The owner authorized publication. Commit `7db1efa366d1c01d870031b21029cd46e582782d` and annotated tag `cp-002` were pushed atomically to `main`. [GitHub CI run 39882589960](https://github.com/ChiRepo/HangCord/actions/runs/39882589960) passed. The implementation selectively reuses and hardens the historical server core; Firebase configuration stays in Cloudflare. Deployment remains pending.

Implemented:
- Contract schemas and REST handlers for sessions, refresh, logout, `/me`, preferences, hangouts, snapshots and room creation.
- Strict Firebase signature/project/claim/provider checks, verified email for both supported providers, and bounded public-key fetching. Firebase sign-in itself is not wired into the desktop yet.
- Fifteen-minute access tokens, immediate logout checks, atomic single-use refresh rotation with complete consumed-token replay detection, fixed 30-day family expiry and cleanup alarms. Firebase UIDs containing dots are encoded safely.
- Preference compare-and-swap, server-wins timestamp ties, safe handling of valid object-property names, and guards that prevent rejected writes from entering the journal.
- Version-guarded room creation that preserves capacity under concurrency; live category inheritance; member permission recomputation for timed gates; deterministic room ordering.
- Permission evaluation for overrides, verification, pending/quarantined members, age restrictions, hierarchy, private Strands and closed schedules. Schedule calculation and feature endpoints are later work; an unevaluated configured schedule stays closed. Adult confirmation has no endpoint yet.
- The historical initial D1 schema plus a separate gate-facts migration, preserving the original migration for existing databases.
- `FIREBASE_PROJECT_ID` registered as a Workers Secret; empty Firebase identifiers removed from production Wrangler vars. Secret-name checks now inspect all Worker source files, including re-exported declarations.

Resource bounds retained for API input protection: 64 KiB request bodies measured in UTF-8 bytes, 200 preference keys, 128-character key names and 4,096-character serialized values per preference. These are input guards, not paid-tier limits. Room limits remain the existing protocol's 50 per category and 500 per hangout.

Validation:
- Baseline dependency installation, JS lint/types/build, UI tests and Rust check passed before implementation. UI: **31 passed, 8 expected viewport skips**; desktop UI code is unchanged.
- Current JS suites: **177 tests passed across their latest runs**, including **45 API tests** against unit fixtures and real local workerd/D1/UserDO, and **42 protocol tests**. The complete workspace run exposed an empty Firebase var in storage-router after reclassification; that configuration was fixed and all **26 policy tests** passed afterward.
- `npm run desktop:test`: **20 passed, 0 failed** on macOS. No new native UI/installer claim.
- Independent review found the inherited preference-property bug; fixed and covered by integration tests. A proposed missing-value schema issue was disproved against installed Zod 4.6.7 (missing `value` is rejected), and an API regression records that behavior. The first reviewer hit a model usage limit; a fresh agent completed the bounded independent review.
- Final `npm run lint`, `npm run typecheck:js`, `npm run build`, `npm run check:secrets-names`, `npm run graph:check` and `git diff --check` passed. `npm run graph` refreshed the existing three map artifacts with pinned Graphify 0.9.93; SQL nodes are omitted because the optional SQL parser is not installed. Migrations were reviewed directly and exercised by the integration suite.
- Gitleaks scanned all versioned and unignored source files with file paths preserved: **no leaks found** (exit 0). The unfiltered checkout scan reported two generic-key matches in ignored Rust `libmuda-*.rmeta` dependency metadata. No secret-scanner rule was weakened; generated build caches were not deleted to hide findings.
- The graph refresh command now disables Graphify's automatic global skill rewriting. The tool's incidental skill updates were restored from its backups. Temporary agent worktrees, patches and scan copies were removed; no duplicate project or handoff files remain.

Deployment limits: the D1 binding is still a placeholder; the owner provisions real secrets and database configuration. D1 journal rows are atomic write-ahead records only. Encrypted CSV sealing, tier failover and daily exports remain unimplemented and must not be represented as working. Historical KV refresh sessions are not migrated; deploying over an old namespace requires explicit cleanup and re-sign-in.


## 8. Checkpoint 2.1 realtime (published 2026-10-23)

Implemented:
- RoomDO per room with hibernating sockets, IDENTIFY/READY, heartbeat, durable message sequences, ACKs, current per-recipient permission/session checks and REST history/fallback send. The API forwards message REST calls through its gateway service binding.
- Durable nonce deduplication, conflicting-content rejection, five accepted messages per user/room per five seconds, inherited slowmode, atomic local encrypted-message journal/outbox and idempotent D1 retry after read-back.
- HangoutDO key custody with the exact §10.6 derivation/AAD/envelope formats, bounded non-extractable key cache, DO-to-D1 recovery and restart-safe first-key bootstrap. Raw keys never leave the key custodian.
- Shared data, journal and session helpers moved from the API into `packages/server`, avoiding separate gateway copies. Crypto helpers and independent Node crypto fixtures live there too.
- Migration `0003_messages.sql`, strict protocol schemas and updated wire/storage contracts. Historical realtime code was reviewed selectively; its HangoutDO socket layout and incompatible crypto format were not restored.

Validation:
- `npm run test:js`: **196 passed, 0 failed**. Includes 45 API tests, 44 protocol tests, 3 crypto fixture tests and 19 gateway tests. Gateway integration uses real local Workers, cross-worker bindings, shared D1 and generated test credentials.
- Gateway tests cover live room broadcasts, cache versions, forbidden rooms, forged identity headers, logout, expiry, membership revocation, concurrent nonce retries, slowmode, cursor validation, API forwarding, D1 write failure/retry, process restart and interrupted key bootstrap.
- `npm run typecheck:js`, `npm run lint`, `npm run build`, `npm run check:secrets-names` and `git diff --check`: passed. Build output: main JS 345.06 kB / 105.56 kB gzip. No desktop source changed; prior Rust/UI checks remain baseline evidence, not newly rerun tests.
- A stale ACK failure fixture was corrected to `{nonce, ok:false, error}`. The process-restart test initially exceeded its 30-second limit; its lifecycle budget is now 120 seconds. The full gateway rerun passed all 19 tests in 31.75 seconds.
- Graph refresh and freshness check passed with pinned Graphify 0.9.93. The optional SQL parser is absent; all three migrations were exercised directly by integration tests. Gitleaks scanned versioned/unignored source with paths preserved: **no leaks found**. Ignored build artifacts and private folders were excluded; no scanner rules were weakened.
- Independent read-only review completed with no actionable findings in the scoped session, permission, journal, nonce and crypto paths. The final regression additions also passed.

Not implemented or claimed: desktop live sign-in/chat, RESUME, edit/delete/reaction events, key rotation/reference counts/member-vault recovery, encrypted CSV snapshots, failover, daily backups, or pruning the retained RoomDO history. The serialized room work queue is not yet admission-bounded; retries currently use a fixed five-second interval. Deployment and load/resource testing remain pending. The gateway config targets fresh namespaces; an existing historical deployment needs a migration plan first.

## 9. Checkpoint 2.1 publication and 2.2 desktop integration (2026-10-23)

The owner authorized publication of `cp-002.1`, then paused further work. Commit `8174bc4b298509281b45bd310f9cdffa020c26c5` and tag `cp-002.1` are on origin/main; GitHub CI run 39952649234 succeeded. A later owner instruction resumed checkpoints. Remote state was rechecked during this slice.

Checkpoint 2.2 local changes:
- Contract-first API password, public desktop configuration and Google code-exchange routes. Firebase and Google tokens are verified in the Worker; same-email linking requires password-account proof. Provider fetches are bounded, fixed-origin and reject redirects. Exact native CORS origins expose ETag.
- Rust native HTTP/WebSocket bridge, OS-keychain session rotation, Google browser PKCE/loopback callback, cancellation and short IPC errors. No HTTP/shell plugin, provider-token webview exposure or plaintext session fallback.
- Desktop sign-in and real hangout/room/message screens replace production sample data. Shared cache binds snapshots/preferences to the account. UI guards stale responses, deduplicates sends by nonce, keeps pending sends during room changes and responds to memory pressure. Account creation/reset, member directory and durable pending-send storage remain future work.
- Test-only mock IPC stays under `tests/ui`. A separate local HTTP/WebSocket fixture drives the real native boundary in the Linux built-app harness; Linux CI unlocks a disposable Secret Service keyring. Fixture evidence does not prove provider deployment or real-account login.
- Current checks: 214 JavaScript tests pass; 58 UI checks pass with eight viewport skips; lint, JavaScript types, build and registered-secret checks pass. All 35 Rust tests and the isolated macOS native fixture smoke passed. No checkpoint 2.2 commit, push or release is claimed.

## 10. Checkpoint 2.2 native verification and Cloudflare setup (2026-10-24)

- Independent review fixes cover expired-access-token logout revocation, gateway installation racing logout, and `email_unverified` error mapping. All 35 Rust tests pass.
- The isolated macOS debug test-hooks application built successfully (46.51 MiB). Manual fixture checks covered password sign-in, hangout/room creation, committed message delivery, Lightweight mode and restart with restored session/preferences. The final observed screen was signed out. This does not establish real-provider sign-in, cross-platform completion, signing or a release.
- Owner-authorized setup created D1 `hangcord` (`f52a5d63-ea01-4e2e-b933-8a8082edfa94`), applied migrations 0001–0003 and verified their migration records. Both Worker configs now bind the database.
- API and gateway deployments succeeded. The gateway uses the API UserDO namespace; the API service binding targets the gateway. Both bindings were verified through Cloudflare metadata. Initial code versions: API `aa9146aa-e254-4fcd-a168-691723b22703`, gateway `fa232304-1c06-4f87-9678-b518590783d5`; subsequent secret updates create newer versions.
- The owner explicitly authorized agent secret entry for this setup. The supplied main Firebase configuration and newly generated 32-byte session/encryption keys were stored only in Cloudflare Workers Secrets. Values were not returned, written to the repository or passed to optimization tools. No backup Firebase configuration was installed. An offline recovery copy of the generated encryption key has not been created.
- Real Firebase/Google account acceptance, Google desktop OAuth configuration, updated Linux/Windows CI, load/resource testing and publication remain pending.

## 11. Checkpoint 2.2 OAuth setup and final checks (2026-10-25)

- The owner approved creation and configuration of the **HangCord Desktop** Google OAuth client. The Desktop app client was created once; the public ID is checked into API configuration and deployed. `/v1/auth/desktop-config` returned HTTP 200 with that ID.
- Both deployed Workers returned HTTP 200 from `/v1/health`. A deliberately invalid, synthetic password sign-in returned the expected HTTP 401 `invalid_credentials`; this is not successful real-account acceptance.
- Cloudflare browser authentication expired before the new OAuth secret could be transferred. The Google creation dialog was left open; do not close it or create duplicate credentials. The owner was asked to complete Cloudflare sign-in.
- The isolated macOS debug app rebuilt successfully against the deployed HTTPS/WSS origins, without `test-hooks` (46.50 MiB). It is not a signed release. UI main bundle: 361.79 kB / 109.92 kB gzip.
- Four secret-scan findings were hard-coded test placeholders. Test-only provider values now use fresh UUIDs; scanner rules were not weakened. The affected API suite passed 54 tests and the gateway suite passed 19 tests. Lint, API types, registered-secret names and whitespace checks passed. Gitleaks scanned versioned/unignored source (3.97 MB) with paths preserved and reported no leaks. Private folders and ignored build/secret files were excluded.
- Five temporary agent worktrees were compared with the canonical checkout and removed after integration. No checkpoint 2.2 commit, tag or push has been made.

- OAuth setup completed after the owner restored Cloudflare browser sign-in. The Google client secret was transferred directly from the observed creation dialog into an encrypted API Worker secret; its value was redacted from tool output and temporary runtime variables were cleared. Secret-name metadata confirms it exists. The exchange route changed from HTTP 503 `auth_not_configured` to HTTP 401 `invalid_credentials` for a deliberately invalid test code.
- The deployed-endpoint native app opens Google account selection in the system browser and cancellation restores the sign-in form. The first owner sign-in used the callback from the cancelled test and therefore hit `ERR_CONNECTION_REFUSED`; a fresh native attempt was started. Successful live account acceptance remains unverified until the app shows the authenticated state.

- Packaging audit found that CI and release installers did not receive the required service origins. Both workflows now supply the public deployed HTTPS/WSS origins; the Linux test-hooks build retains its explicit loopback overrides and `--no-bundle`. YAML validation checked all five build paths, and all 26 policy tests passed. These workflow changes are local and have not run on GitHub yet.
- The owner reported a second sign-in error; the desktop showed only the generic connection message and no authenticated state. The UI now distinguishes OAuth timeout, network failure, unexpected response and general sign-in failure, and explains the three-minute Google callback window. Do not claim live sign-in until a fresh owner-initiated attempt succeeds in the app.

- After the clearer sign-in messages, lint and all JavaScript type checks passed; six targeted sign-in/accessibility/cancellation UI checks passed at 1440/1024/480 px. The first targeted-test command had incorrect npm argument forwarding and ran no tests; the corrected workspace command passed. The deployed-endpoint macOS debug bundle rebuilt successfully (46.50 MiB; main JS 362.11 kB / 110.01 kB gzip), without test hooks. Graph freshness and the final source secret scan passed. The rebuilt app was opened at the sign-in screen and left for an owner-initiated attempt; no callback timer was started.

## 12. Google callback issuer fix and live acceptance (2026-10-25)

- Read the browser error, “This sign-in callback was not accepted.” Google included `iss=https://accounts.google.com`, which the native callback allowlist rejected. The earlier timeout explanation did not identify this parser bug.
- The parser now accepts the optional decoded issuer only when it exactly matches Google. Wrong or duplicate issuers remain rejected; state checks are unchanged. Synthetic regression tests cover the full callback through the loopback listener, invalid and duplicate issuers, state mismatch and error responses. No real authorization codes or state values were saved. Independent read-only review found no actionable issues.
- All five OAuth tests passed. The standard Rust run stalled in the existing OS-keychain fallback migration test and was stopped; rerunning the other 36 tests passed. The isolated macOS debug app rebuilt without test hooks against deployed HTTPS/WSS origins (46.50 MiB).
- Live verification passed: the browser displayed “You can return to HangCord. This window can be closed.” and the native app displayed “Your first hangout.” Quitting and reopening the app restored the authenticated screen, verifying the saved session across restart. No real chat messages were created during this verification.
- Checkpoint 2.2 remains unpublished. Cross-platform CI, real password-account acceptance and encryption-key recovery custody remain outstanding.

All 37 Rust tests then passed with `--features test-hooks` and `HANGCORD_KEY_STORAGE=file`, which bypasses the OS keychain only for the cache-key test path. This does not prove the stalled keychain migration path; live sign-in and session restoration were separately verified in the normal app without test hooks.

## 13. Checkpoint 2.2 publication and Windows CI fixture correction (2026-10-25)

- Published `0e45836ea0d4d7f4a22022fb206ee05c4cd5d08e` and annotated tag `cp-002.2` after a clean staged-source secret scan. Remote branch and peeled tag match.
- CI run 40195612508 passed shared checks, UI tests, code-map verification and the full-history secret scan. Linux passed Rust tests and native e2e. Windows passed 36 tests but timed out in the offline logout test's one-second connection-refused wait.
- The test now accepts a loopback request and drops the connection without an HTTP response. This tests failed revocation without depending on operating-system closed-port timing. Local credentials/cache clearing and rejection of a gateway connection arriving after logout remain asserted. All three focused logout tests pass locally; Windows rerun is required. No production behavior changed.
