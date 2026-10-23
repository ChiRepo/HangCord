# What has to be done next

Work top to bottom. Items marked **Owner** need the owner's accounts or decisions; agents prepare them but never do them alone. Tick items off here and log them in `what changes were made.md`.

## 0. Before any new work
- [ ] **Push first.** Everything already done must be on GitHub before new work starts. Commit only when the owner asks.
- [ ] Run `npm ci` and `npm run checkpoint` on a fresh clone of `main`, and note the baseline.
- [ ] Read `handoff.md`, `preferences.md` and `AGENTS.md`.

## 1. Owner tasks (agents can explain each one, but not do it)
- [ ] **Publish the draft release `v0.0.1`** on GitHub (Releases → v0.0.1 → Edit → Publish) when ready. The installers are unsigned, so Windows and macOS warn the first time someone opens one.
- [ ] **Private folders on the Mac:** copy `Private files (.md files store here)/` and the rules folder into the new clone of the repo. They stay git-ignored.
- [ ] **Repo visibility:** `ChiRepo/HangCord` is public. No secrets are in it, but the plan recommends private.
- [ ] **Firebase:** two projects exist, the main one and the backup, and both have Authentication turned on.
  - [ ] Main project: keep **Email/Password** and **Google** sign-in on. Use the free Spark plan only, and don't use Analytics.
  - [ ] Backup project: it only needs **Firestore**, with no sign-in and no apps. Turn Authentication off there.
  - [ ] Both projects: create Firestore in production mode with the deny-all rules from `docs/ACCESS_AND_SETTINGS.md` §13.
  - [ ] Google Cloud Console → Credentials: restrict the main project's browser API key to the Identity Toolkit and Token Service APIs. Add website restrictions once there is a domain.
  - [ ] Create an OAuth client of type **Desktop app**, for Google sign-in through the system browser.
- [ ] **Cloudflare**, with the owner running each command:
  - [ ] Create the D1 database: `npx wrangler d1 create hangcord`. Paste its id, which is not a secret, into the Worker configs when checkpoint 2 lands.
  - [ ] Set the secrets. Each command asks for the value; never paste a value into chat or a file:
    - `npx wrangler secret put SESSION_SIGNING_KEY` for **api** and **gateway** (the same value in both)
    - `npx wrangler secret put HANGCORD_KEK_V1` for **gateway**: 32 random bytes in base64 (`openssl rand -base64 32`), with an offline copy kept
    - `npx wrangler secret put GOOGLE_OAUTH_DESKTOP_CLIENT_SECRET` for **api**
    - **Firebase config, per the owner's rule "store it in Cloudflare Workers":** keep the main project's web API key and project ID in Workers configuration, not in the app or the repo. The current API uses `FIREBASE_PROJECT_ID` as a Workers Secret. Register the web API key when implementing checkpoint 2.2; never put its value in this repo.
- [ ] **Open decisions** (from the plan):
  - the domain for the API and web companion
  - code signing (Apple Developer ID; for Windows, SignPath Foundation is free for open source)
  - the minimum user age and a privacy policy (India DPDP Act 2023)
  - the provider and key for Backup DB #2
  - generating the emergency CSV key pair offline (MASTER_PLAN §8.6)

## 2. Authorized checkpoint 2 implementation
The owner authorized resuming the checkpoints after the intentional revert. Selectively reuse and harden the historical server code; do not revert the entire revert commit. Firebase configuration stays in Cloudflare, and realtime must follow the master plan's RoomDO-per-room layout.

**Current state:** the server-core slice is implemented locally and reviewed. The owner authorized commit, tag and push of `cp-002`, then continuation to checkpoint 2.1, on 2026-10-23. Verify the push succeeded before starting that slice. Deployment also needs the owner's real D1 binding and Workers Secrets; the checked-in D1 ID is a placeholder, not a usable cloud database.

For the current API, the owner sets `SESSION_SIGNING_KEY` and `FIREBASE_PROJECT_ID` as Workers Secrets, then applies both API D1 migrations. The Firebase web API key and desktop OAuth flow belong to checkpoint 2.2; no Firebase configuration enters the desktop bundle. Synthetic `hangcord-test` configuration exists only in the local integration harness.

Before any deployment to a namespace that ran the historical server core, plan invalidation/deletion of legacy `rt:*` UserDO records. The new SQL family storage does not migrate those records; users must sign in again.
Then build checkpoint 2 in four parts, each tested, reviewed, documented and pushed to `main` before the next one starts:
- **2: server core.** Sessions with refresh-token rotation and reuse detection; `/me`; preferences with ETag / If-Match; hangouts and their snapshot; **+ room**; the D1 schema; journaled writes.
- **2.1: realtime.** Gateway IDENTIFY / READY with cache versions, live messages with ACK and broadcast to members who can see the room, a nonce de-dupe, rate limits, REST history and fallback send, and message bodies encrypted at rest.
- **2.2: the desktop app goes live.**
  - Google sign-in through the system browser (PKCE + a loopback redirect in Rust), and email + password.
  - The session and refresh token kept in the OS keychain.
  - Real data instead of `sample.ts`, and live chat.
  - CORS on the API so the desktop app's origin (`tauri://localhost` / `http://tauri.localhost`) can call it.
- **2.3: email codes.**
  - A `VerificationDO`: codes stored hashed, valid 5 minutes, burned after 3 wrong tries.
  - The provider chain Brevo → Mailjet → Resend, with Firebase's verification link as the last fallback.
  - Password reset, and a cleanup of unverified accounts after 24 h.

**The full checkpoint 2 series (2–2.3) is done when:** two desktop apps chat in real time with each other; a restart shows hangouts and preferences instantly from the cache; and all tests, the desktop e2e, gitleaks and the code-map check pass.

## 3. Engineering debt (do it alongside the checkpoints)
- [ ] **WebApp branch CI:** port the `main` CI fixes (pinned gitleaks CLI, preview on `127.0.0.1`, readable failure annotations). Its CI fails until then.
- [ ] **Memory governor on macOS and Windows:** macOS needs `phys_footprint` and must count WebKit helper processes (they're parented to launchd, so use the responsibility PID); Windows needs the private working set. RSS over-counts until then.
- [ ] Rotate the device cache key on sign-out, not just wipe the cache.
- [ ] A Rust test writes a real keychain entry (`app.hangcord.desktop.test`) on Mac and Windows CI; clean it up.
- [ ] Automate Lighthouse mobile budgets (LCP < 2.5 s, INP < 200 ms) on the WebApp branch.
- [ ] GitHub's `ubuntu-latest` runners are moving to Ubuntu 26 (CI shows a notice). Check the Linux job's apt package names when it switches.
- [ ] The owner's private notes on the Mac (`handoff.md`, `what changed previously.md` and so on) are out of date. Update them only when the owner allows it.

## 4. Later phases (MASTER_PLAN §16)
- Phase 1 rest: invites, roles UI, the storage-router sealing journal rows into encrypted CSV chunks in R2, the daily export.
- Phase 2: voice lounges on LiveKit (Oracle VM), Together, whiteboard.
- Phase 3: encrypted DMs (MLS), friends.
- Phase 4+: step-up actions, audit-log chain checks, AutoMod, translation, AI catch-up, schedule and reminders.
- The HangCord Plus slot stays reserved and disabled.
