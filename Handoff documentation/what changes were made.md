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
