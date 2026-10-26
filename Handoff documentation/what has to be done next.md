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
  - [x] Create OAuth client **HangCord Desktop**, type **Desktop app** (2026-10-25, explicitly approved). Its public client ID and encrypted client secret are configured in the API.
- [ ] **Cloudflare**, provisioned through owner-authorized agent setup on 2026-10-24:
  - [x] Create D1 `hangcord`, bind it in both Worker configs and apply migrations 0001–0003. Migration records were verified in the dashboard.
  - [ ] Finish secret provisioning. The owner explicitly authorized agent entry for this setup; values remain outside chat output and project files:
    - [x] `SESSION_SIGNING_KEY` is installed in **api** and **gateway** with the same generated value.
    - [x] `HANGCORD_KEK_V1` is installed in **gateway** (32 random bytes, base64). An offline recovery copy has **not** been created; resolve recovery custody before storing real messages.
    - [x] Transfer `GOOGLE_OAUTH_DESKTOP_CLIENT_SECRET` to **api**. Cloudflare secret metadata and the configured Google exchange route were verified.
    - [x] Main Firebase `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY` are installed as API Workers Secrets. The backup configuration is unused. Neither configuration is in the app or repository.
- [ ] **Open decisions** (from the plan):
  - the domain for the API and web companion
  - code signing (Apple Developer ID; for Windows, SignPath Foundation is free for open source)
  - the minimum user age and a privacy policy (India DPDP Act 2023)
  - the provider and key for Backup DB #2
  - generating the emergency CSV key pair offline (MASTER_PLAN §8.6)

## 2. Authorized checkpoint 2 implementation
The owner authorized resuming the checkpoints after the intentional revert. Selectively reuse and harden the historical server code; do not revert the entire revert commit. Firebase configuration stays in Cloudflare, and realtime must follow the master plan's RoomDO-per-room layout.

**Current state:** server core is committed, tagged and pushed as `cp-002` (`7db1efa`). [GitHub CI run 39882589960](https://github.com/ChiRepo/HangCord/actions/runs/39882589960) passed. Realtime is published as `cp-002.1` (`8174bc4`), with successful CI run 39952649234. The owner authorized continuation to checkpoint 2.2, now implemented locally with 35 Rust tests and a macOS native fixture smoke test passed. The owner authorized publishing 2.2, verifying CI, then continuing 2.3. Tag `cp-002.2` points to `0e45836`; Windows verification passed on follow-up `dbc4ebe`; verify the Linux restart refresh correction before 2.3. API/gateway Workers and their shared D1 binding are deployed. Live Google sign-in and authenticated macOS restart passed after the callback issuer fix. Real password-account acceptance and Linux/Windows verification remain pending.

For the current API, the owner sets `SESSION_SIGNING_KEY` and `FIREBASE_PROJECT_ID` as Workers Secrets; all three API D1 migrations are already applied. The gateway needs the same `SESSION_SIGNING_KEY`, its own `HANGCORD_KEK_V1`, and the same D1 binding. Its `USERS` binding points to the API UserDO; the API `GATEWAY` service binding points back to the gateway. Coordinate both deployments after provisioning, and verify those bindings before exposing traffic. Checkpoint 2.2 additionally requires `FIREBASE_WEB_API_KEY`, `GOOGLE_OAUTH_DESKTOP_CLIENT_ID` and the registered `GOOGLE_OAUTH_DESKTOP_CLIENT_SECRET` in the API Worker; no Firebase configuration enters the desktop bundle. Synthetic `hangcord-test` configuration exists only in the local integration harness.

Before any deployment to a namespace that ran the historical server core, plan invalidation/deletion of legacy `rt:*` UserDO records. The new SQL family storage does not migrate those records; users must sign in again.
The gateway migration is a fresh-namespace `v1` containing RoomDO and HangoutDO. If a historical gateway was deployed, inspect its migration history first and create an explicit compatible migration; do not overwrite an applied `v1`. Key rotation, reference counts, member-vault recovery, CSV failover and hot-history pruning remain later work.

Complete checkpoint 2 in four parts, each tested, reviewed, documented and pushed to `main` before the next one starts:
- **2: server core — pushed.** Sessions with refresh-token rotation and reuse detection; `/me`; preferences with ETag / If-Match; hangouts and their snapshot; **+ room**; the D1 schema; journaled writes.
- **2.1: realtime — published and CI passed; gateway deployed.** Gateway IDENTIFY / READY with cache versions, live messages with ACK and broadcast to members who can see the room, a nonce de-dupe, rate limits, REST history and fallback send, and message bodies encrypted at rest.
- **2.2: the desktop app goes live — local implementation, macOS fixture smoke, live Google sign-in and authenticated restart passed; cross-platform checks pending.**
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

**Email sender decision (owner, 2026-10-26):** OTP email should use `HangCord <no-reply@hangcord.in>`. Public DNS currently returns NXDOMAIN for `hangcord.in`; domain ownership/DNS setup and email-provider accounts remain to be confirmed. This is a chosen address, not a configured sending service.
