# Graph Report - HangCord-repo  (2026-10-23)

## Corpus Check
- 115 files · ~94,857 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .toml 14, (none) 11, .xml 2)

## Summary
- 1145 nodes · 1749 edges · 69 communities (61 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 44 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ce43b8bf`
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
- App.tsx
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
- auth/session.ts
- exports/README.md
- rooms.test.ts
- Database schemas
- HangCord desktop app (checkpoint 1.1)
- schemas.ts
- packages/ui/tsconfig.json
- data.ts
- permissions.test.ts
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
- cache.test.ts
- livekit/README.md
- hangcord-desktop
- hangcord-code-map
- tests/ui/tsconfig.json
- 10.6 Decrypting hangout keys — exact procedure
- contrast.ts
- Workflow design
- UserDO
- Preferences: what the owner wants
- What has to be done next
- api.int.test.ts
- vitest
- firebase.ts
- protocol/test/gateway.test.ts
- api/src/index.ts
- computePermissions
- contract.test.ts
- policy.test.ts

## God Nodes (most connected - your core abstractions)
1. `UserDO` - 22 edges
2. `HangCord — Master Plan` - 20 edges
3. `CacheError` - 19 edges
4. `HangCord — Access, Settings and Hangout Keys (spec)` - 18 edges
5. `vitest` - 17 edges
6. `ClientCache` - 17 edges
7. `App()` - 16 edges
8. `scripts` - 16 edges
9. `compilerOptions` - 16 edges
10. `EncryptedStore` - 15 edges

## Surprising Connections (you probably didn't know these)
- `D. Getting the plain HSK for `(hangoutId, epoch)` — source order` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts
- `4. Changing sensitive data (Durable Objects)` --references--> `UserDO`  [INFERRED]
  docs/SECRETS_AND_SENSITIVE_DATA.md → workers/api/src/user-do.ts
- `📐 Web companion (WebApp branch)` --references--> `CacheStore`  [INFERRED]
  Handoff documentation/database schemas.md → packages/cache/src/store.ts
- `3. What HangCord is` --references--> `computePermissions()`  [INFERRED]
  AGENTS.md → packages/protocol/src/compute.ts
- `16. Tests that must exist` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts

## Import Cycles
- None detected.

## Communities (69 total, 8 thin omitted)

### Community 0 - "governor.rs"
Cohesion: 0.05
Nodes (43): KeyStorage, FileFallback, OsKeychain, BUDGET_EVERY, effective_budget(), FLOOR, GIB, Governor (+35 more)

### Community 1 - "HangCord Design System — Calm Minimal (current)"
Cohesion: 0.05
Nodes (39): 1. The rule in one sentence, 2. Two kinds of sensitive things, 3. Fixed secrets (Workers Secrets), 4. Changing sensitive data (Durable Objects), 4a. CSV backups (MASTER_PLAN §8.5), 5. Things HangCord never stores anywhere, 6. What the client is allowed to hold, 7. Logging and errors (+31 more)

### Community 2 - "cache.rs"
Cohesion: 0.08
Nodes (24): CacheError, BadKey, Corrupt, Full, Storage, TooLarge, db_file_is_owner_only(), each_write_uses_a_fresh_nonce() (+16 more)

### Community 3 - "AGENTS.md — rules for every AI agent working on HangCord"
Cohesion: 0.18
Nodes (11): 1. Start of every session, 2. The private folder, 4. Anti-hallucination rules, 6. Checkpoint protocol (after every piece of finished work), 6a. How to run everything, 6b. Desktop app rules (checkpoint 1.1, `apps/desktop`), 6c. Code map (Graphify, `graphify/`), 7. Lead agent and subagents (+3 more)

### Community 4 - "worker-kit/src/index.ts"
Cohesion: 0.19
Nodes (13): 8.3 Snapshot mode — one write per database (owner's CSV technique), 5. Backup DB #2 (last resort), CHECKPOINT, CURRENT_PHASE, PROTOCOL_VERSION, errorResponse(), health(), json() (+5 more)

### Community 5 - "HangCord — Master Plan"
Cohesion: 0.06
Nodes (36): 10. Free VoIP and realtime transport providers, 11. Dynamic memory governor (≤ 1.7 GB), 12. Secrets and security, 13. Repository, checkpoints and pushing, 14. Agent and subagent workflow, 15.1 Mobile gate — every checkpoint (owner request, 2026-10-21), 15. Testing and release gates, 16.1 Checkpoint numbering (owner decision, 2026-10-21) (+28 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (39): description, devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint (+31 more)

### Community 7 - "compute.ts"
Cohesion: 0.11
Nodes (25): ALL_BITS, evaluate(), EVERYONE_FORBIDDEN, explainPermissions(), ExplainStep, FLAG_BYPASS_VERIFICATION, FLAG_PENDING, FLAG_QUARANTINED (+17 more)

### Community 8 - "HangCord — Access, Settings and Hangout Keys (spec)"
Cohesion: 0.12
Nodes (16): 12. Audit log, 14. API additions, 15. Threat model (and the control for each), 1. Principles, 2. Who's who, 3. Permission flags, 4.1 Permission inputs and fail-closed evaluation (checkpoint 2), 4. Computing permissions (+8 more)

### Community 9 - "desktop/ui/package.json"
Cohesion: 0.06
Nodes (30): dependencies, @hangcord/cache, @hangcord/protocol, @hangcord/ui, react, react-dom, @tauri-apps/api, description (+22 more)

### Community 10 - "tauri.conf.json"
Cohesion: 0.08
Nodes (25): app, security, windows, cwd, script, cwd, script, build (+17 more)

### Community 11 - "device_key.rs"
Cohesion: 0.16
Nodes (16): ACCOUNT, an_existing_fallback_key_is_kept_across_launches(), file_key_is_private_from_creation_and_never_overwritten(), forced_file(), from_hex(), hex_round_trip_and_rejects_junk(), KEY_FILE, keychain_get() (+8 more)

### Community 12 - "App.tsx"
Cohesion: 0.07
Nodes (35): AddError, AddRoomDialog(), App(), ERROR_TEXT, Layer, Loaded, mb(), PREF_LIGHTWEIGHT (+27 more)

### Community 13 - "tests/ui/package.json"
Cohesion: 0.11
Nodes (15): @axe-core/playwright, @playwright/test, devDependencies, @axe-core/playwright, @playwright/test, name, private, scripts (+7 more)

### Community 14 - "api/package.json"
Cohesion: 0.09
Nodes (21): dependencies, @hangcord/protocol, @hangcord/worker-kit, zod, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types (+13 more)

### Community 15 - "gateway/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 16 - "storage-router/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 17 - "packages/ui/package.json"
Cohesion: 0.11
Nodes (18): description, devDependencies, react, @types/react, exports, ./components.css, ./tokens.css, react (+10 more)

### Community 18 - "gateway-events.ts"
Cohesion: 0.09
Nodes (23): CLIENT_OPS, DETAILED_OPS, DetailedFrame, Envelope, HangoutUpdate, Heartbeat, HeartbeatAck, Hello (+15 more)

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
Nodes (15): body(), Ctx, Deps, Handler, routes, UserRow, KeySource, SessionClaims (+7 more)

### Community 25 - "cache/package.json"
Cohesion: 0.15
Nodes (12): dependencies, @hangcord/protocol, description, exports, @hangcord/protocol, name, private, scripts (+4 more)

### Community 26 - "worker-kit/package.json"
Cohesion: 0.15
Nodes (12): dependencies, @hangcord/protocol, description, exports, @hangcord/protocol, name, private, scripts (+4 more)

### Community 27 - "policy/package.json"
Cohesion: 0.17
Nodes (11): smol-toml, description, devDependencies, smol-toml, name, private, scripts, test (+3 more)

### Community 28 - "auth/session.ts"
Cohesion: 0.22
Nodes (18): issueSession(), b64url(), decoder, enc, formatRefreshToken(), hmacKey(), parseRefreshToken(), randomToken() (+10 more)

### Community 30 - "rooms.test.ts"
Cohesion: 0.14
Nodes (13): 1. Planning and design (2026-10-21), 2. Checkpoint 1: foundation (`cp-001`), 3. Checkpoint 1.1: the real desktop application (`cp-001.1`), 4. Tooling (2026-10-22), 5. GitHub, branches and the first release (2026-10-22), 6. Checkpoint 2 and 2.1: built, then reverted (2026-10-22), 7. Checkpoint 2 server-core candidate (2026-10-23, local only), What changes were made (+5 more)

### Community 31 - "Database schemas"
Cohesion: 0.15
Nodes (11): 🔧 `0001_init.sql` + `0002_verified_user_facts.sql` (checkpoint 2), 2. Cloudflare D1: the main database, 3. Firestore (main project), 4. Firestore backup (separate project, Firestore only, no sign-in), 6. Durable Object storage (Cloudflare-only sensitive state), 7. R2 and object tiers, 8. Not stored anywhere (on purpose), Database schemas (+3 more)

### Community 32 - "HangCord desktop app (checkpoint 1.1)"
Cohesion: 0.22
Nodes (8): Desktop end-to-end test, HangCord desktop app (checkpoint 1.1), Linux, macOS (owner, on the Mac), Manual checklist (every checkpoint, each OS), Run and build, What's in the Rust core, Windows (CI or a Windows PC)

### Community 33 - "schemas.ts"
Cohesion: 0.11
Nodes (20): parseBits(), key(), MAX_ROOMS_PER_CATEGORY, MAX_ROOMS_PER_HANGOUT, NEW_ROOM_ERROR_STATUS, NewRoomError, openedBits(), bitfield (+12 more)

### Community 34 - "packages/ui/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 35 - "data.ts"
Cohesion: 0.16
Nodes (17): PermHangout, PermMember, PermRoom, Override, Room, RoomType, bitsFor(), buildSnapshot() (+9 more)

### Community 36 - "permissions.test.ts"
Cohesion: 0.39
Nodes (6): BIT, has(), KNOWN_BITS, PERMISSIONS, ROOM_SCOPED_BITS, here

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

### Community 47 - "cache.test.ts"
Cohesion: 0.06
Nodes (40): useCachedHangout(), 1. Device (Ground 0), ✅ Desktop encrypted cache: `cache.sqlite3` (`apps/desktop/src-tauri/src/cache.rs`), 📐 Desktop outbox, 📐 Web companion (WebApp branch), ClientCache, MAX_HANGOUT_SNAPSHOTS, Platform (+32 more)

### Community 54 - "tests/ui/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 55 - "10.6 Decrypting hangout keys — exact procedure"
Cohesion: 0.13
Nodes (15): 10.1 Key hierarchy and where every copy lives, 10.2 The member's private vault document, 10.3 Removal "until they leave", 10.4 What the key also protects, 10.5 Rotation, 10.6 Decrypting hangout keys — exact procedure, 10. Hangout secret key, A. Fixed formats (+7 more)

### Community 57 - "Workflow design"
Cohesion: 0.22
Nodes (8): 1. App ↔ API ↔ storage (big picture), 3. Signing in (checkpoint 2.2; confirm the Firebase-config choice with the owner), 4. Sending a message (checkpoint 2.1), 5. Storage when a free quota runs out (MASTER_PLAN §8.3), 6. Git, branches and releases, 7. How an agent works (every task), 8. Where each rule is enforced, Workflow design

### Community 58 - "UserDO"
Cohesion: 0.25
Nodes (5): 5. Secrets, 11. Step-up confirmation, 13. Data model and Firestore rules, sha256(), UserDO

### Community 59 - "Preferences: what the owner wants"
Cohesion: 0.29
Nodes (6): Design, Infrastructure and data, Preferences: what the owner wants, Process, Product, Working with the owner

### Community 60 - "What has to be done next"
Cohesion: 0.29
Nodes (6): 0. Before any new work, 1. Owner tasks (agents can explain each one, but not do it), 2. Authorized checkpoint 2 implementation, 3. Engineering debt (do it alongside the checkpoints), 4. Later phases (MASTER_PLAN §16), What has to be done next

### Community 61 - "api.int.test.ts"
Cohesion: 0.18
Nodes (10): Session, api(), b64(), config, here, idToken(), jwk, persist (+2 more)

### Community 62 - "vitest"
Cohesion: 0.19
Nodes (6): vitest, Env, REQUIRED_SECRETS, scheduled(), JobName, jobsDue()

### Community 63 - "firebase.ts"
Cohesion: 0.23
Nodes (12): 6.1 Authentication (Firebase Authentication), 6. API and realtime contract, decodeJson(), FirebaseClaims, googleKeySource(), refresh(), importRsaJwk(), record() (+4 more)

### Community 64 - "protocol/test/gateway.test.ts"
Cohesion: 0.19
Nodes (6): GatewayOp, CreateRoomRequest, here, css, here, listed

### Community 65 - "api/src/index.ts"
Cohesion: 0.24
Nodes (7): Env, makeApp(), REQUIRED_SECRETS, REFRESH_TTL_MS, app, RefreshRecord, TestEnv

### Community 66 - "computePermissions"
Cohesion: 0.20
Nodes (10): 3. What HangCord is, 16. Tests that must exist, 2.2 Vocabulary map (use these words everywhere in UI, code and docs), 2. Opening the app (cache first, then sync), canModerate(), computePermissions(), calc(), context() (+2 more)

### Community 67 - "contract.test.ts"
Cohesion: 0.22
Nodes (8): DETAILED_SCHEMAS, docsDir, here, METHODS, shape(), spec, specPath, specShapes

### Community 68 - "policy.test.ts"
Cohesion: 0.22
Nodes (7): configs, files, read(), root, secretNames, walk(), workers

## Knowledge Gaps
- **58 isolated node(s):** `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop`, `BadKey`, `TooLarge` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 633 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `protocol/test/gateway.test.ts`, `contract.test.ts`, `permissions.test.ts`, `worker-kit/src/index.ts`, `package.json`, `compute.ts`, `policy.test.ts`, `cache.test.ts`, `gateway-events.ts`, `auth/session.ts`, `api.int.test.ts`, `rooms.test.ts`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `UserDO` (e.g. with `5. Secrets` and `11. Step-up confirmation`) actually correct?**
  _`UserDO` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `governor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05443371378402107 - nodes in this community are weakly interconnected._
- **Why does `UserDO` connect `UserDO` to `HangCord Design System — Calm Minimal (current)`, `api/src/index.ts`, `HangCord — Master Plan`, `app.ts`, `rooms.test.ts`, `Database schemas`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Should `HangCord Design System — Calm Minimal (current)` be split into smaller, more focused modules?**
  _Cohesion score 0.045328399629972246 - nodes in this community are weakly interconnected._
- **Why does `computePermissions()` connect `computePermissions` to `data.ts`, `HangCord — Master Plan`, `compute.ts`, `10.6 Decrypting hangout keys — exact procedure`, `rooms.test.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._