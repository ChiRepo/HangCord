# AGENTS.md — rules for every AI agent working on HangCord

> You're building HangCord, a real app people will rely on to hang out with friends. You can do this well. Go step by step, test everything, never guess, and say clearly when you're blocked. Careful, verified work is what makes an app feel effortless to the people using it.

## 1. Start of every session
1. Read `private and only to be accessed once which is before starting work on a project or unless user specifies and AI halucinated from its task/rules.md` **once**, before you start work. Re-read it only if the owner tells you to, or if you notice you've drifted from your task or made something up. It is private: never copy it anywhere.
2. Read this file and `docs/MASTER_PLAN.md` (especially §5 diagrams and §6 contract).
3. Run `npm ci` then `npm run checkpoint` to see the current baseline before changing anything (see §6a).
4. Do **not** open the private folder (see §2) unless the user says so in this conversation.
5. **GitHub first:** the repo is **`ChiRepo/HangCord`** (GitHub). Branches: **`main` = the real application** (desktop app + everything it shares), **`WebApp` = web companion work** (`apps/web` and web-only changes, merged into `main` when ready). Commit and push **only when the owner asks** (the owner or ChatGPT may also push). Before any new work starts, every change already made must be pushed; if it can't be, stop and tell the owner. Never push either private folder, `.dev.vars*`, `.env*` or keys — run gitleaks first.

## 2. The private folder
`Private files (.md files store here)/` holds `handoff.md`, `details.md`, `what changed previously.md`, `what has to be changed.md`, `next steps.md`, `guides.md`, `user preferences.md` and the owner's own notes. The rules live separately in `private and only to be accessed once which is before starting work on a project or unless user specifies and AI halucinated from its task/rules.md` (read once at start, see §1).
- **Reading:** only when the user explicitly tells you to in the current conversation.
- **Writing/editing:** only after the user types exactly: **`yes change the files from now on`**, or when the user directly asks for one specific file to be created or changed (that covers only that file). The grant lasts for the current conversation only; a new session needs it again.
- Never copy its contents into the repo, commits, PRs, issues or logs. It is git-ignored and must stay that way.
- Never put secrets in it.

## 3. What HangCord is
A full, installable desktop application (Windows, macOS, Linux; Tauri 2) plus a web companion — not a demo webapp. Build, test and debug it as production software. It is a **clean-room** product: never copy Discord code, assets, sounds, names or trademarks. Use the HangCord vocabulary (Hangout, Room, Lounge, Strand, Together, HangCord Plus).

**Sign-in is Firebase Authentication only:** Continue with Google, email + password, and new accounts confirmed by a 6-digit email code. Do not add other sign-in methods. Follow `docs/MASTER_PLAN.md` §6.1 exactly (desktop Google sign-in uses the system browser with PKCE + loopback, never a webview popup).

**New features (owner, 2026-10-21) — build exactly to spec:**
- **+ add from category** (ACCESS_AND_SETTINGS §7.1): every category header has a round **+** that adds a Room or Lounge inside it, with "Follow category guidelines" or "Own guidelines", pre-selected from the user's `rooms.newRoomGuidelines` preference. Shown only with `MANAGE_ROOMS` on that category; the server re-checks. Core logic: `workers/api/src/rooms/new-room.ts`.
- **Hangout + preference caching** (MASTER_PLAN §7.1): all cache logic lives in `packages/cache` (versions, patches, merge, LRU, wipe). Never decide access from the cache. Never cache secrets.
- **Mobile gate on every checkpoint** (MASTER_PLAN §15.1): see §6 step 1.

**UI/UX — Calm Minimal (approved 2026-10-21):** the look of the whole app comes from `ui-ux/calm-minimal/` — read `DESIGN_SYSTEM.md` first, use `ui-ux/calm-minimal/tokens.css` (not the old `ui-ux/tokens.css`), and match `ui-ux/calm-minimal/screens/`.
- Dark graphite surfaces, one warm brand colour (Lantern `#F2A93B`), Moss green for online; Space Grotesk headings, Inter UI text, JetBrains Mono code; flat surfaces with 1px borders — no shadows, glass or gradients on chrome.
- **Presence badges are always perfect circles** (`border-radius: 50%`, `box-sizing: border-box`, 16px with a 3px surface ring) with a shape per state: online dot, idle crescent, do-not-disturb bar, offline ring. Avatars and call controls are round too.
- Screens not yet redesigned (Lounge watch-together, DMs, Roles, Room permissions, Security, Create account, Brand) keep their **features and layout** from `ui-ux/screens/` but take their **look** from Calm Minimal. Where both exist, the Calm Minimal screen wins.
- Use HangCord words everywhere (Hangout, Room, Lounge, Strand…, MASTER_PLAN §2.2) — never "server" or "channel".
- Design skills to use: `ui-ux-pro-max` (data + pre-delivery checklist), `bencium-controlled-ux-designer` (ask the owner before any new colour, font or component pattern), `design-audit` (review passes), `webapp-testing` + Playwright (verify every screen).
- A screen isn't done until: text contrast ≥ 4.5:1, visible 2px Lantern focus ring, full keyboard path, `prefers-reduced-motion` honoured, works at 1024px and narrow widths.
- Never hard-code colours, and don't redesign without the owner's approval.

**Roles, permissions, room/hangout settings and hangout secret keys:** follow `docs/ACCESS_AND_SETTINGS.md` exactly. Every access check goes through `computePermissions()`; access data never leaves D1; the hangout key is never returned, logged or stored unwrapped. Decrypt hangout keys only with the exact procedure in `docs/ACCESS_AND_SETTINGS.md` §10.6 (fixed labels, AAD formats, source order, fingerprint check); never invent a variation.

## 4. Anti-hallucination rules
- The diagrams in `docs/MASTER_PLAN.md` §5 and `packages/protocol/` are the source of truth. If an endpoint, event, table or tier isn't there, add it there first (via the Architect role), then code it.
- Every provider limit or API behaviour you rely on must cite a documentation URL.
- Check package versions in the registry; never invent them.
- Run code before claiming it works; paste real command output in your report.
- After two failed attempts at the same problem, stop and report.

## 5. Secrets
**Everything sensitive lives only on Cloudflare, server-side.** The complete list is `docs/SECRETS_AND_SENSITIVE_DATA.md` — if something sensitive isn't listed there, don't store it; ask.
- **Fixed secrets** (API keys, service accounts, OAuth client secret, `HANGCORD_KEK_V1`, `EMAIL_CODE_PEPPER`…) → **Workers Secrets** via `wrangler secret put`, only in the Worker that needs it. Never in code, Wrangler `vars`, markdown, commits, logs, Firestore, KV, R2, GitHub or the client bundle. You never see or type real values; the owner sets them. Local dev uses git-ignored `.dev.vars`.
- **Changing sensitive data** (email codes/OTP, step-up tokens, refresh-token hashes, rate-limit counters, wrapped hangout keys) → **Durable Object storage** (`VerificationDO`, `UserDO`, `RateLimitDO`, `HangoutDO`), stored as HMACs/hashes or wrapped ciphertext, deleted on schedule.
- Workers fail closed at startup if a required secret is missing — never fall back to a default.
- Clients only receive short-lived tokens from the API Worker.
- gitleaks must pass before every commit.

## 6. Checkpoint protocol (after every piece of finished work)
**Where we are (MASTER_PLAN §16.1):** checkpoint **1** (`cp-001`, Phase 0 foundation) is done. Checkpoint **1.1** (`cp-001.1`) — done on Linux, waiting for the macOS build on the owner's Mac and Windows from CI — is **the real-world desktop application** in `apps/desktop` (Tauri 2: Rust core, typed IPC, memory governor v1, encrypted local SQLite cache, installers). HangCord is an installable application first — never treat the web shell as "the app".
1. Full tests pass (unit, integration, e2e for touched areas) — record output. **Mobile gate (MASTER_PLAN §15.1) is part of every checkpoint:** e2e runs in `desktop-chromium`, `mobile-chrome` and `mobile-safari`; phones get one pane at a time, ≥ 44 px targets, no sideways scroll, `100dvh` + safe areas, keyboard never covers inputs; web JS ≤ 200 KB gzipped (`npm run check:size`). A checkpoint that fails on phones is not done.
2. Lint, typecheck, perf budget, gitleaks pass.
3. Independent review by an agent that did not write the code.
4. Update `docs/`. Update private files **only** if write permission was granted (§2).
5. Push (§1.5): commit (conventional commits) on the right branch (`main` for the application, `WebApp` for web-companion work), tag `cp-NNN`, push to `ChiRepo/HangCord` after a clean gitleaks scan. Refresh the code map first (`npm run graph`, §6c). Tag `vX.Y.Z` to publish a release with installers (`.github/workflows/release.yml`).
6. `wrangler deploy` Workers if they changed.
If the push fails (no credentials, no network), stop and tell the user; never work around auth.

## 6b. Desktop app rules (checkpoint 1.1, `apps/desktop`)
- The desktop app is **the** product. Every user-facing feature must work in it, not just in the browser.
- New Rust↔UI calls: add the command to `src-tauri/build.rs` (app manifest) **and** grant it in `src-tauri/capabilities/default.json`. Never add filesystem, shell, HTTP or updater plugins without the owner's OK.
- IPC returns short error codes only — never paths, SQL, stack traces or key material.
- Local data goes only through the encrypted cache (`cache.rs` behind `packages/cache`). Nothing secret is ever cached; the server still decides access.
- Anything that holds data in memory must respect the governor's zone (`governor://status`): grow in Green, evict in Yellow, unload in Red. Never exceed 1.7 GB.
- Test with `npm run desktop:test` (Rust) and the desktop e2e: `npx tauri build --no-bundle --features test-hooks --ci`, then `xvfb-run -a dbus-run-session -- node tests/desktop/run.mjs apps/desktop/src-tauri/target/release/hangcord-desktop` (needs `tauri-driver` 2.1.0 + WebKitWebDriver). The `test-hooks` feature only lets tests force the file key — never ship a test-hooks build. macOS uses the manual checklist in `apps/desktop/README.md`.
- Rust 1.95+ (`rust-version` in `Cargo.toml`). Generated `src-tauri/gen/` is git-ignored.
- Memory accounting: Linux uses PSS (`/proc/<pid>/smaps_rollup`); macOS (`phys_footprint`, WebKit helpers parented to launchd) and Windows (private working set) are TODO — RSS is an over-estimate there until done.
- Build installers per OS: Linux here/CI (`.deb`), macOS on the owner's Mac (`.dmg`), Windows in CI (`.msi`/NSIS).

## 6a. How to run everything
- `npm ci` · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run check:size` · `npm run check:secrets-names` · `npm run e2e` — or all of it: `npm run checkpoint`. `typecheck` and `test` include Rust (`desktop:check`, `desktop:test`); `typecheck:js` / `test:js` skip it (CI's checks job uses those; Rust runs in the desktop jobs).
- Secret scan: `gitleaks dir . --config .gitleaks.toml` (CI runs gitleaks on every push).
- `tools/policy` turns repo rules into tests (no secrets in Wrangler `vars`, ≤ 5 Cron Triggers per account, emergency-restore has no route, private folders in every ignore file, mobile viewport/dvh/safe-area). Don't weaken a policy test to make it pass — fix the cause.
- `packages/protocol/test/contract.test.ts` fails if an endpoint listed in the docs is missing from `openapi.yaml` — update the contract first, then the code.
- **Cloudflare free plan: only 5 Cron Triggers per account.** All timed jobs run from the storage-router's one 15-minute cron (`workers/storage-router/src/jobs.ts`). Don't add crons elsewhere.
- CI lives in `.github/workflows/ci.yml`. Jobs: checks + secrets-scan + code-map (stale graph fails) + desktop-linux (Rust tests, desktop e2e, .deb/AppImage) on pushes to `main`/`WebApp` and on PRs; desktop-windows on `main` and manual runs; desktop-macos on manual runs only (free-minute budget). Releases: `.github/workflows/release.yml` builds Linux, Windows and macOS installers for a `v*` tag and attaches them to a GitHub Release (draft until the owner publishes it).
- Agent plugins (claude-mem, context-mode, headroom, token-optimizer, superpowers) must never index, summarise or store anything from the two private folders, `.dev.vars*` or `.env*`. Wrap any private text that has to appear in a session in `<private>…</private>` so claude-mem skips it.

## 6c. Code map (Graphify, `graphify/`)
- Before searching or opening many files, read `graphify/graph/GRAPH_REPORT.md`, then ask the graph — through the local `hangcord-code-map` MCP server in `.mcp.json` (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`), or in the terminal (repo root, `export GRAPHIFY_OUT=graphify/graph`): `graphify query "<question>"`, `graphify explain "<Symbol>"`, `graphify path "A" "B"`, `graphify affected "<Symbol>"` (what a change touches).
- The graph is a map, not the truth — open the file before you edit it; the code wins.
- After every change set, before pushing: `npm run graph` (local, ~2 s, no AI model, no network) and keep the three outputs with the code. CI's `code-map` job (`npm run graph:check`) fails if the map is stale. Graphify is pinned (`graphify/requirements.txt`, 0.9.93).
- Never graph the private folders or secret files (`.graphifyignore`, a guard in `refresh.sh` and a policy test enforce it). Never run the full `/graphify` assistant pipeline, `graphify extract` with an LLM backend, or `--no-gitignore`. Details: `graphify/README.md`.

## 7. Lead agent and subagents
- One Lead owns the roadmap order, merges and (when the owner asks) the push (§1.5).
- Subagents get: goal, exact directories in scope, relevant contract sections, acceptance tests. They work in separate git worktrees on non-overlapping directories.
- Roles and boundaries: see `docs/MASTER_PLAN.md` §14.
- Each subagent reports: files changed, commands run with real output, test results, open risks.

## 8. Data rules
- Persistence goes through the StorageRouter only. Row mode in the healthy database (D1 first); when its writes reach 85% or it fails, **CSV snapshot mode**: rows stay in the server-side CSV journal and are saved to the first healthy database on the ladder (D1 ⇄ Firestore; only if both fail: Firestore backup, then Backup DB #2 — its provider and key come from the owner, never pick one yourself) as **one write per snapshot** (≤ 700 KB gzipped, read-back checksum), then expanded back after the reset. Never write per-row into a database that's out of writes. **Every write of every kind goes into the CSV journal first**, and a daily CSV export of every table/collection is kept in R2 + Backblaze B2 (MASTER_PLAN §8.5) — new tables must be added to both. **Every CSV is encrypted** (§8.6): journal/snapshots with `CSV_ROUTINE_KEY`; backups with the emergency public key, openable only by the emergency decryption key in `workers/emergency-restore` during the owner's break-glass window. Never generate, request, log or copy the emergency private key. Never hard-code a tier. See MASTER_PLAN §7–8 (§8.3).
- Never delete journal data until the chunk is confirmed in a tier.
- Never write user data into this code repository.
- Encrypted DM content is ciphertext everywhere on the server.

## 9. Memory
The desktop app's total memory must stay within the governor budget (max 1.7 GB). Any feature that holds data in memory must register its cache with the governor. See MASTER_PLAN §11.
