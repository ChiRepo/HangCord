# Graph Report - HangCord-repo  (2026-10-25)

## Corpus Check
- 137 files · ~123,618 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: .toml 23, (none) 11, .xml 2)

## Summary
- 1563 nodes · 2974 edges · 89 communities (80 shown, 9 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0e45836e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- governor.rs
- HangCord Design System — Calm Minimal (current)
- cache.rs
- AGENTS.md — rules for every AI agent working on HangCord
- worker-kit/src/index.ts
- HangCord — Master Plan
- package.json
- compute.ts
- HangCord — Access, Settings and Hangout Keys (spec)
- desktop/ui/package.json
- tauri.conf.json
- device_key.rs
- ClientCache
- tests/ui/package.json
- api/package.json
- gateway/package.json
- storage-router/package.json
- packages/ui/package.json
- gateway-events.ts
- compilerOptions
- desktop/package.json
- run.mjs
- protocol/package.json
- emergency-restore/package.json
- app.ts
- cache/package.json
- worker-kit/package.json
- policy/package.json
- server/src/session.ts
- exports/README.md
- rooms.ts
- Database schemas
- HangCord desktop app (checkpoint 1.1)
- LiveClient
- packages/ui/tsconfig.json
- schemas.ts
- cache.test.ts
- api/tsconfig.json
- emergency-restore/tsconfig.json
- gateway/tsconfig.json
- storage-router/tsconfig.json
- default.json
- cache/tsconfig.json
- protocol/tsconfig.json
- worker-kit/tsconfig.json
- desktop/ui/tsconfig.json
- policy/tsconfig.json
- App.tsx
- livekit/README.md
- hangcord-desktop
- hangcord-code-map
- tests/ui/tsconfig.json
- hangout-do.ts
- native.rs
- Workflow design
- UserDO
- Preferences: what the owner wants
- What has to be done next
- api.int.test.ts
- api/src/index.ts
- data.ts
- What changes were made
- NativeBridge
- lib.rs
- contract.test.ts
- policy.test.ts
- live.ts
- realtime.int.test.ts
- NativeResult
- server/package.json
- tauri
- HangCord — Secrets and Sensitive Data Register
- fail
- README.md
- Profile
- Handoff — start here
- What changes were made
- server/tsconfig.json
- HangCord UI/UX
- MemoryCacheStore
- oauth.rs
- .listen
- desktop.ts
- firebase.ts
- vitest
- backend.mjs

## God Nodes (most connected - your core abstractions)
1. `LiveClient` - 39 edges
2. `NativeBridge` - 36 edges
3. `fail()` - 28 edges
4. `RoomDO` - 26 edges
5. `ClientCache` - 24 edges
6. `UserDO` - 24 edges
7. `HangoutDO` - 23 edges
8. `vitest` - 22 edges
9. `EncryptedStore` - 20 edges
10. `App()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `3. What HangCord is` --references--> `computePermissions()`  [INFERRED]
  AGENTS.md → packages/protocol/src/compute.ts
- `16. Tests that must exist` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts
- `D. Getting the plain HSK for `(hangoutId, epoch)` — source order` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts
- `11. Step-up confirmation` --references--> `UserDO`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → workers/api/src/user-do.ts
- `📐 Web companion (WebApp branch)` --references--> `CacheStore`  [INFERRED]
  Handoff documentation/database schemas.md → packages/cache/src/store.ts

## Import Cycles
- 2-file cycle: `workers/gateway/src/index.ts -> workers/gateway/src/room-do.ts -> workers/gateway/src/index.ts`
- 2-file cycle: `apps/desktop/src-tauri/src/native.rs -> apps/desktop/src-tauri/src/oauth.rs -> apps/desktop/src-tauri/src/native.rs`

## Communities (89 total, 9 thin omitted)

### Community 0 - "governor.rs"
Cohesion: 0.09
Nodes (19): BUDGET_EVERY, FLOOR, GIB, Governor, HARD_CEILING, lightweight_change_recomputes_budget_immediately(), live_sample_ignores_threads(), live_sample_is_sane() (+11 more)

### Community 1 - "HangCord Design System — Calm Minimal (current)"
Cohesion: 0.17
Nodes (12): 0. How this relates to the earlier design, 1. Principles, 2. Colour (dark theme — default), 3. Typography, 4. Space, shape, size, 5. Motion, 6. Components, 6a. Phones (mobile gate — every screen, MASTER_PLAN §15.1) (+4 more)

### Community 2 - "cache.rs"
Cohesion: 0.08
Nodes (24): CacheError, BadKey, Corrupt, Full, Storage, TooLarge, db_file_is_owner_only(), each_write_uses_a_fresh_nonce() (+16 more)

### Community 3 - "AGENTS.md — rules for every AI agent working on HangCord"
Cohesion: 0.15
Nodes (13): 1. Start of every session, 2. The private folder, 3. What HangCord is, 4. Anti-hallucination rules, 5. Secrets, 6. Checkpoint protocol (after every piece of finished work), 6a. How to run everything, 6b. Desktop app rules (checkpoint 1.1, `apps/desktop`) (+5 more)

### Community 4 - "worker-kit/src/index.ts"
Cohesion: 0.12
Nodes (20): 8.3 Snapshot mode — one write per database (owner's CSV technique), 5. Backup DB #2 (last resort), CHECKPOINT, CURRENT_PHASE, PROTOCOL_VERSION, errorResponse(), health(), json() (+12 more)

### Community 5 - "HangCord — Master Plan"
Cohesion: 0.05
Nodes (37): 10. Free VoIP and realtime transport providers, 11. Dynamic memory governor (≤ 1.7 GB), 12. Secrets and security, 13. Repository, checkpoints and pushing, 14. Agent and subagent workflow, 15.1 Mobile gate — every checkpoint (owner request, 2026-10-21), 15. Testing and release gates, 16.1 Checkpoint numbering (owner decision, 2026-10-21) (+29 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (39): description, devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint (+31 more)

### Community 7 - "compute.ts"
Cohesion: 0.09
Nodes (32): 2. Opening the app (cache first, then sync), ALL_BITS, canModerate(), computePermissions(), evaluate(), EVERYONE_FORBIDDEN, explainPermissions(), ExplainStep (+24 more)

### Community 8 - "HangCord — Access, Settings and Hangout Keys (spec)"
Cohesion: 0.06
Nodes (34): 10.1 Key hierarchy and where every copy lives, 10.2 The member's private vault document, 10.3 Removal "until they leave", 10.4 What the key also protects, 10.5 Rotation, 10.6 Decrypting hangout keys — exact procedure, 10. Hangout secret key, 11. Step-up confirmation (+26 more)

### Community 9 - "desktop/ui/package.json"
Cohesion: 0.06
Nodes (31): dependencies, @hangcord/cache, @hangcord/protocol, @hangcord/ui, react, react-dom, @tauri-apps/api, description (+23 more)

### Community 10 - "tauri.conf.json"
Cohesion: 0.08
Nodes (25): app, security, windows, cwd, script, cwd, script, build (+17 more)

### Community 11 - "device_key.rs"
Cohesion: 0.16
Nodes (16): ACCOUNT, an_existing_fallback_key_is_kept_across_launches(), file_key_is_private_from_creation_and_never_overwritten(), forced_file(), from_hex(), hex_round_trip_and_rejects_junk(), KEY_FILE, keychain_get() (+8 more)

### Community 12 - "ClientCache"
Cohesion: 0.15
Nodes (10): 1. Device (Ground 0), ✅ Desktop encrypted cache: `cache.sqlite3` (`apps/desktop/src-tauri/src/cache.rs`), 📐 Desktop outbox, 📐 Web companion (WebApp branch), ClientCache, mergePreferences(), CacheStore, KEYS (+2 more)

### Community 13 - "tests/ui/package.json"
Cohesion: 0.07
Nodes (27): @axe-core/playwright, @playwright/test, InitOptions, installMockIpc(), MockApiRequest, MockCommand, MockGatewayFrame, MockIpcCommand (+19 more)

### Community 14 - "api/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @hangcord/protocol, @hangcord/server, @hangcord/worker-kit, zod, devDependencies, @cloudflare/workers-types, wrangler (+15 more)

### Community 15 - "gateway/package.json"
Cohesion: 0.09
Nodes (21): dependencies, @hangcord/protocol, @hangcord/server, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types (+13 more)

### Community 16 - "storage-router/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 17 - "packages/ui/package.json"
Cohesion: 0.11
Nodes (18): description, devDependencies, react, @types/react, exports, ./components.css, ./tokens.css, react (+10 more)

### Community 18 - "gateway-events.ts"
Cohesion: 0.06
Nodes (43): CLIENT_OPS, DETAILED_OPS, DetailedFrame, Envelope, GatewayOp, HangoutUpdate, Heartbeat, HeartbeatAck (+35 more)

### Community 19 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 20 - "desktop/package.json"
Cohesion: 0.13
Nodes (14): description, devDependencies, @tauri-apps/cli, name, private, scripts, build:app, dev (+6 more)

### Community 21 - "run.mjs"
Cohesion: 0.16
Nodes (9): dataHome, deadline, driver, env, results, session(), sleep(), waitFor() (+1 more)

### Community 22 - "protocol/package.json"
Cohesion: 0.11
Nodes (18): dependencies, zod, description, devDependencies, @apidevtools/swagger-parser, yaml, exports, ./openapi.yaml (+10 more)

### Community 23 - "emergency-restore/package.json"
Cohesion: 0.14
Nodes (13): description, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, wrangler, name, private (+5 more)

### Community 24 - "app.ts"
Cohesion: 0.12
Nodes (20): Change, Guard, insert(), Op, pick(), update(), write(), CORS_HEADER_SET (+12 more)

### Community 25 - "cache/package.json"
Cohesion: 0.15
Nodes (12): dependencies, @hangcord/protocol, description, exports, @hangcord/protocol, name, private, scripts (+4 more)

### Community 26 - "worker-kit/package.json"
Cohesion: 0.15
Nodes (12): dependencies, @hangcord/protocol, description, exports, @hangcord/protocol, name, private, scripts (+4 more)

### Community 27 - "policy/package.json"
Cohesion: 0.17
Nodes (11): smol-toml, description, devDependencies, smol-toml, name, private, scripts, test (+3 more)

### Community 28 - "server/src/session.ts"
Cohesion: 0.20
Nodes (19): b64url(), decoder, enc, formatRefreshToken(), hmacKey(), parseRefreshToken(), randomToken(), SESSION_TTL_MS (+11 more)

### Community 30 - "rooms.ts"
Cohesion: 0.15
Nodes (17): BIT, has(), KNOWN_BITS, parseBits(), PERMISSIONS, ROOM_SCOPED_BITS, key(), liveSlug() (+9 more)

### Community 31 - "Database schemas"
Cohesion: 0.18
Nodes (10): ✅ `0001_init.sql` + `0002_verified_user_facts.sql` (checkpoint 2), ✅ `0003_messages.sql` (published in checkpoint 2.1; not deployed), 2. Cloudflare D1: the main database, 3. Firestore (main project), 4. Firestore backup (separate project, Firestore only, no sign-in), 7. R2 and object tiers, 8. Not stored anywhere (on purpose), Database schemas (+2 more)

### Community 32 - "HangCord desktop app (checkpoint 1.1)"
Cohesion: 0.18
Nodes (10): Checkpoint 2.2 verification (2026-10-24), Configure sign-in, Desktop end-to-end test, HangCord desktop app, Linux, macOS (owner, on the Mac), Manual checklist (every checkpoint, each OS), Run and build (+2 more)

### Community 33 - "LiveClient"
Cohesion: 0.20
Nodes (6): useLive(), codeOf(), failure(), LiveClient, GatewayEvent, fixture()

### Community 34 - "packages/ui/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 35 - "schemas.ts"
Cohesion: 0.14
Nodes (13): bitfield, CreateHangoutRequest, DesktopAuthConfig, ErrorBody, GoogleExchangeRequest, GuidelinesChoice, Health, MAX_MESSAGE_CHARS (+5 more)

### Community 36 - "cache.test.ts"
Cohesion: 0.12
Nodes (23): MAX_HANGOUT_SNAPSHOTS, Platform, applyHangoutUpdate(), ApplyResult, etagForHangout(), planReadyForHangout(), ReadyAction, reconcileReady() (+15 more)

### Community 37 - "api/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 38 - "emergency-restore/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 39 - "gateway/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 40 - "storage-router/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 41 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 42 - "cache/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, extends, include, ../../tsconfig.base.json

### Community 43 - "protocol/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 44 - "worker-kit/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, extends, include, ../../tsconfig.base.json

### Community 45 - "desktop/ui/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../../tsconfig.base.json

### Community 46 - "policy/tsconfig.json"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 47 - "App.tsx"
Cohesion: 0.14
Nodes (23): AddError, AddRoomDialog(), App(), ERROR_TEXT, Layer, mb(), PREF_LIGHTWEIGHT, useGovernor() (+15 more)

### Community 54 - "tests/ui/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 55 - "hangout-do.ts"
Cohesion: 0.11
Nodes (26): aad(), dec, deriveAes(), enc, fingerprint(), fromB64(), importKek(), KEK_VERSION (+18 more)

### Community 56 - "native.rs"
Cohesion: 0.08
Nodes (19): account_cache_is_preserved_only_for_same_keychain_account(), ambiguous_rotation_drops_old_credential_across_restart(), cancellation_rejects_late_signin_result_without_persisting(), concurrent_expired_requests_rotate_once_and_persist_before_return(), Config, failed_persistence_never_releases_rotated_token(), GATEWAY_EVENT, logout_offline_clears_local_state_and_late_gateway_install_is_rejected() (+11 more)

### Community 57 - "Workflow design"
Cohesion: 0.22
Nodes (8): 1. App ↔ API ↔ storage (big picture), 3. Signing in (checkpoint 2.2; Firebase configuration stays in Cloudflare), 4. Sending a message (checkpoint 2.1, published and locally verified), 5. Storage when a free quota runs out (MASTER_PLAN §8.3), 6. Git, branches and releases, 7. How an agent works (every task), 8. Where each rule is enforced, Workflow design

### Community 58 - "UserDO"
Cohesion: 0.29
Nodes (3): 6. Durable Object storage (Cloudflare-only sensitive state), sha256(), UserDO

### Community 59 - "Preferences: what the owner wants"
Cohesion: 0.29
Nodes (6): Design, Infrastructure and data, Preferences: what the owner wants, Process, Product, Working with the owner

### Community 60 - "What has to be done next"
Cohesion: 0.29
Nodes (6): 0. Before any new work, 1. Owner tasks (agents can explain each one, but not do it), 2. Authorized checkpoint 2 implementation, 3. Engineering debt (do it alongside the checkpoints), 4. Later phases (MASTER_PLAN §16), What has to be done next

### Community 61 - "api.int.test.ts"
Cohesion: 0.16
Nodes (12): 6.1 Authentication (Firebase Authentication), Session, api(), b64(), config, googleIdToken(), here, idToken() (+4 more)

### Community 62 - "api/src/index.ts"
Cohesion: 0.16
Nodes (10): REFRESH_TTL_MS, corsHeaders(), Env, REQUIRED_SECRETS, withNativeCors(), app, RefreshRecord, app (+2 more)

### Community 63 - "data.ts"
Cohesion: 0.20
Nodes (14): PermHangout, PermMember, PermRoom, Override, Room, RoomType, HangoutRow, HangoutState (+6 more)

### Community 64 - "What changes were made"
Cohesion: 0.14
Nodes (13): 10. Checkpoint 2.2 native verification and Cloudflare setup (2026-10-24), 11. Checkpoint 2.2 OAuth setup and final checks (2026-10-25), 12. Google callback issuer fix and live acceptance (2026-10-25), 13. Checkpoint 2.2 publication and Windows CI fixture correction (2026-10-25), 1. Planning and design (2026-10-21), 3. Checkpoint 1.1: the real desktop application (`cp-001.1`), 4. Tooling (2026-10-22), 5. GitHub, branches and the first release (2026-10-22) (+5 more)

### Community 65 - "NativeBridge"
Cohesion: 0.14
Nodes (12): auth_cancel(), auth_google(), auth_password(), auth_status(), AuthStatus, CacheVersions, gateway_connect(), gateway_disconnect() (+4 more)

### Community 66 - "lib.rs"
Cohesion: 0.20
Nodes (16): KeyStorage, FileFallback, OsKeychain, Status, app_info(), AppInfo, AppState, cache_delete() (+8 more)

### Community 67 - "contract.test.ts"
Cohesion: 0.13
Nodes (11): DETAILED_SCHEMAS, docsDir, here, METHODS, shape(), spec, specPath, specShapes (+3 more)

### Community 68 - "policy.test.ts"
Cohesion: 0.22
Nodes (7): configs, files, read(), root, secretNames, walk(), workers

### Community 69 - "live.ts"
Cohesion: 0.09
Nodes (16): DisplayMessage, initial(), LiveState, summary(), ApiReply, DesktopPort, GovernorStatus, Invoke (+8 more)

### Community 70 - "realtime.int.test.ts"
Cohesion: 0.12
Nodes (19): MessagesPage, API_CONFIG, b64(), client(), d1(), here, idToken(), jwk (+11 more)

### Community 71 - "NativeResult"
Cohesion: 0.24
Nodes (10): api_path(), api_request(), ApiResponse, Arc<MemoryCredentials>, auth_logout(), AuthState, CredentialStore, logout_with_live_access_revokes_after_local_clear() (+2 more)

### Community 72 - "server/package.json"
Cohesion: 0.12
Nodes (15): dependencies, @hangcord/protocol, description, devDependencies, @cloudflare/workers-types, exports, @cloudflare/workers-types, @hangcord/protocol (+7 more)

### Community 73 - "tauri"
Cohesion: 0.21
Nodes (3): NativeDesktopPort, tauri(), TauriCacheStore

### Community 74 - "HangCord — Secrets and Sensitive Data Register"
Cohesion: 0.18
Nodes (11): 1. The rule in one sentence, 2. Two kinds of sensitive things, 3. Fixed secrets (Workers Secrets), 4. Changing sensitive data (Durable Objects), 4a. CSV backups (MASTER_PLAN §8.5), 5. Things HangCord never stores anywhere, 6. What the client is allowed to hold, 7. Logging and errors (+3 more)

### Community 75 - "fail"
Cohesion: 0.23
Nodes (9): fail(), gateway_send(), GatewayEvent, Closed, Frame, KeychainStore, NativeError, outgoing() (+1 more)

### Community 76 - "README.md"
Cohesion: 0.27
Nodes (3): Download and branches, HangCord, Quick start

### Community 77 - "Profile"
Cohesion: 0.28
Nodes (8): effective_budget(), Profile, Balanced, profile_for_total(), Lite, Max, Rich, Smooth

### Community 78 - "Handoff — start here"
Cohesion: 0.22
Nodes (8): Handoff — start here, How to work: the loop, every time, Non-negotiables (break one and the work is rejected), The six files in this folder, What HangCord is, When you're blocked, Where everything lives, Where things stand (2026-10-25)

### Community 79 - "What changes were made"
Cohesion: 0.19
Nodes (10): 2. Checkpoint 1: foundation (`cp-001`), contrast(), luminance(), Avatar(), LABEL, PresenceBadge(), breakpoint, color (+2 more)

### Community 80 - "server/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 81 - "HangCord UI/UX"
Cohesion: 0.40
Nodes (5): Building from these screens, Current design: Calm Minimal (approved 2026-10-21), Earlier design (v1, Lantern orange / Manrope), HangCord UI/UX, Screens

### Community 82 - "MemoryCacheStore"
Cohesion: 0.20
Nodes (5): CacheStoreError, isValidCacheKey(), MAX_KEY_LEN, MAX_VALUE_BYTES, MemoryCacheStore

### Community 83 - "oauth.rs"
Cohesion: 0.11
Nodes (6): authorization_url(), callback(), challenge(), google_issuer_callback_is_accepted_by_listener(), listen(), open_browser()

### Community 85 - "desktop.ts"
Cohesion: 0.25
Nodes (16): decodeJson(), exchangeGoogleCode(), firebaseGoogleSignIn(), firebasePasswordSignIn(), firebaseUrl(), GOOGLE_ISSUERS, isRecord(), loadGoogleKeys() (+8 more)

### Community 86 - "firebase.ts"
Cohesion: 0.26
Nodes (11): 6. API and realtime contract, fromB64url(), decodeJson(), FirebaseClaims, googleKeySource(), refresh(), importRsaJwk(), record() (+3 more)

### Community 88 - "backend.mjs"
Cohesion: 0.23
Nodes (10): API, BITS, frame(), GATEWAY, json(), PORT, readFrames(), room() (+2 more)

## Knowledge Gaps
- **65 isolated node(s):** `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop`, `BadKey`, `TooLarge` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 749 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `contract.test.ts`, `cache.test.ts`, `live.ts`, `package.json`, `compute.ts`, `worker-kit/src/index.ts`, `policy.test.ts`, `realtime.int.test.ts`, `gateway-events.ts`, `hangout-do.ts`, `api/src/index.ts`, `server/src/session.ts`, `api.int.test.ts`, `rooms.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `fail()` (e.g. with `callback()` and `open_browser()`) actually correct?**
  _`fail()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `governor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.0873440285204991 - nodes in this community are weakly interconnected._
- **Why does `computePermissions()` connect `compute.ts` to `What changes were made`, `AGENTS.md — rules for every AI agent working on HangCord`, `HangCord — Master Plan`, `HangCord — Access, Settings and Hangout Keys (spec)`, `gateway-events.ts`, `data.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `RoomDO` (e.g. with `6. API and realtime contract` and `6. Durable Object storage (Cloudflare-only sensitive state)`) actually correct?**
  _`RoomDO` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `cache.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08244680851063829 - nodes in this community are weakly interconnected._