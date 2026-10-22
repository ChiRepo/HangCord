# Graph Report - hangcord  (2026-10-22)

## Corpus Check
- 101 files · ~81,325 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: .toml 13, (none) 11, .xml 2)

## Summary
- 997 nodes · 1385 edges · 61 communities (53 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f036237d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- governor.rs
- HangCord Design System — Calm Minimal (current)
- cache.rs
- AGENTS.md — rules for every AI agent working on HangCord
- app.ts
- HangCord — Master Plan
- package.json
- README.md
- HangCord — Access, Settings and Hangout Keys (spec)
- desktop/ui/package.json
- tauri.conf.json
- device_key.rs
- App.tsx
- tests/ui/package.json
- api/package.json
- gateway/package.json
- storage-router/package.json
- ui/package.json
- gateway-events.ts
- compilerOptions
- desktop/package.json
- contract.test.ts
- protocol/package.json
- emergency-restore/package.json
- HangCord — Secrets and Sensitive Data Register
- cache/package.json
- worker-kit/package.json
- policy/package.json
- HangCord UI/UX
- exports/README.md
- rooms.test.ts
- Database schemas
- HangCord desktop app (checkpoint 1.1)
- schemas.ts
- ui/tsconfig.json
- tokens.ts
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
- ClientCache
- livekit/README.md
- hangcord-desktop
- hangcord-code-map
- tests/ui/tsconfig.json
- platform.ts
- contrast.ts
- Workflow design
- Handoff — start here
- Preferences: what the owner wants
- What has to be done next

## God Nodes (most connected - your core abstractions)
1. `HangCord — Master Plan` - 20 edges
2. `CacheError` - 19 edges
3. `HangCord — Access, Settings and Hangout Keys (spec)` - 18 edges
4. `ClientCache` - 17 edges
5. `App()` - 16 edges
6. `scripts` - 16 edges
7. `compilerOptions` - 16 edges
8. `EncryptedStore` - 15 edges
9. `AppState` - 14 edges
10. `vitest` - 13 edges

## Surprising Connections (you probably didn't know these)
- `📐 Web companion (WebApp branch)` --references--> `CacheStore`  [INFERRED]
  Handoff documentation/database schemas.md → packages/cache/src/store.ts
- `2. Checkpoint 1: foundation (`cp-001`)` --references--> `planNewRoom()`  [INFERRED]
  Handoff documentation/what changes were made.md → packages/protocol/src/rooms.ts
- `6. Checkpoint 2 and 2.1: built, then reverted (2026-10-22)` --references--> `planNewRoom()`  [INFERRED]
  Handoff documentation/what changes were made.md → packages/protocol/src/rooms.ts
- `✅ Desktop encrypted cache: `cache.sqlite3` (`apps/desktop/src-tauri/src/cache.rs`)` --references--> `Preferences`  [INFERRED]
  Handoff documentation/database schemas.md → packages/protocol/src/schemas.ts
- `✅ Desktop encrypted cache: `cache.sqlite3` (`apps/desktop/src-tauri/src/cache.rs`)` --references--> `HangoutSnapshot`  [INFERRED]
  Handoff documentation/database schemas.md → packages/protocol/src/schemas.ts

## Import Cycles
- None detected.

## Communities (61 total, 8 thin omitted)

### Community 0 - "governor.rs"
Cohesion: 0.05
Nodes (45): KeyStorage, FileFallback, OsKeychain, BUDGET_EVERY, effective_budget(), FLOOR, GIB, Governor (+37 more)

### Community 1 - "HangCord Design System — Calm Minimal (current)"
Cohesion: 0.17
Nodes (12): 0. How this relates to the earlier design, 1. Principles, 2. Colour (dark theme — default), 3. Typography, 4. Space, shape, size, 5. Motion, 6. Components, 6a. Phones (mobile gate — every screen, MASTER_PLAN §15.1) (+4 more)

### Community 2 - "cache.rs"
Cohesion: 0.09
Nodes (22): CacheError, BadKey, Corrupt, Full, Storage, TooLarge, db_file_is_owner_only(), each_write_uses_a_fresh_nonce() (+14 more)

### Community 3 - "AGENTS.md — rules for every AI agent working on HangCord"
Cohesion: 0.15
Nodes (13): 1. Start of every session, 2. The private folder, 3. What HangCord is, 4. Anti-hallucination rules, 5. Secrets, 6. Checkpoint protocol (after every piece of finished work), 6a. How to run everything, 6b. Desktop app rules (checkpoint 1.1, `apps/desktop`) (+5 more)

### Community 4 - "app.ts"
Cohesion: 0.11
Nodes (20): 8.3 Snapshot mode — one write per database (owner's CSV technique), 5. Backup DB #2 (last resort), CHECKPOINT, CURRENT_PHASE, PROTOCOL_VERSION, errorResponse(), health(), json() (+12 more)

### Community 5 - "HangCord — Master Plan"
Cohesion: 0.05
Nodes (39): 10. Free VoIP and realtime transport providers, 11. Dynamic memory governor (≤ 1.7 GB), 12. Secrets and security, 13. Repository, checkpoints and pushing, 14. Agent and subagent workflow, 15.1 Mobile gate — every checkpoint (owner request, 2026-10-21), 15. Testing and release gates, 16.1 Checkpoint numbering (owner decision, 2026-10-21) (+31 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (39): description, devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint (+31 more)

### Community 7 - "README.md"
Cohesion: 0.27
Nodes (3): Download and branches, HangCord, Quick start

### Community 8 - "HangCord — Access, Settings and Hangout Keys (spec)"
Cohesion: 0.06
Nodes (33): 10.1 Key hierarchy and where every copy lives, 10.2 The member's private vault document, 10.3 Removal "until they leave", 10.4 What the key also protects, 10.5 Rotation, 10.6 Decrypting hangout keys — exact procedure, 10. Hangout secret key, 11. Step-up confirmation (+25 more)

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
Cohesion: 0.15
Nodes (20): AddError, AddRoomDialog(), App(), ERROR_TEXT, Layer, Loaded, mb(), PREF_LIGHTWEIGHT (+12 more)

### Community 13 - "tests/ui/package.json"
Cohesion: 0.11
Nodes (15): @axe-core/playwright, @playwright/test, devDependencies, @axe-core/playwright, @playwright/test, name, private, scripts (+7 more)

### Community 14 - "api/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 15 - "gateway/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 16 - "storage-router/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 17 - "ui/package.json"
Cohesion: 0.11
Nodes (18): description, devDependencies, react, @types/react, exports, ./components.css, ./tokens.css, react (+10 more)

### Community 18 - "gateway-events.ts"
Cohesion: 0.09
Nodes (26): CLIENT_OPS, DETAILED_OPS, DetailedFrame, Envelope, GatewayOp, HangoutUpdate, Heartbeat, HeartbeatAck (+18 more)

### Community 19 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 20 - "desktop/package.json"
Cohesion: 0.13
Nodes (14): description, devDependencies, @tauri-apps/cli, name, private, scripts, build:app, dev (+6 more)

### Community 21 - "contract.test.ts"
Cohesion: 0.05
Nodes (31): CreateRoomRequest, DETAILED_SCHEMAS, docsDir, here, METHODS, shape(), spec, specPath (+23 more)

### Community 22 - "protocol/package.json"
Cohesion: 0.11
Nodes (17): dependencies, zod, description, devDependencies, @apidevtools/swagger-parser, yaml, exports, ./openapi.yaml (+9 more)

### Community 23 - "emergency-restore/package.json"
Cohesion: 0.14
Nodes (13): description, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, wrangler, name, private (+5 more)

### Community 24 - "HangCord — Secrets and Sensitive Data Register"
Cohesion: 0.20
Nodes (10): 1. The rule in one sentence, 2. Two kinds of sensitive things, 3. Fixed secrets (Workers Secrets), 4. Changing sensitive data (Durable Objects), 4a. CSV backups (MASTER_PLAN §8.5), 5. Things HangCord never stores anywhere, 6. What the client is allowed to hold, 7. Logging and errors (+2 more)

### Community 25 - "cache/package.json"
Cohesion: 0.15
Nodes (12): dependencies, @hangcord/protocol, description, exports, @hangcord/protocol, name, private, scripts (+4 more)

### Community 26 - "worker-kit/package.json"
Cohesion: 0.15
Nodes (12): dependencies, @hangcord/protocol, description, exports, @hangcord/protocol, name, private, scripts (+4 more)

### Community 27 - "policy/package.json"
Cohesion: 0.17
Nodes (11): smol-toml, description, devDependencies, smol-toml, name, private, scripts, test (+3 more)

### Community 28 - "HangCord UI/UX"
Cohesion: 0.40
Nodes (5): Building from these screens, Current design: Calm Minimal (approved 2026-10-21), Earlier design (v1, Lantern orange / Manrope), HangCord UI/UX, Screens

### Community 30 - "rooms.test.ts"
Cohesion: 0.15
Nodes (11): 1. Planning and design (2026-10-21), 3. Checkpoint 1.1: the real desktop application (`cp-001.1`), 4. Tooling (2026-10-22), 5. GitHub, branches and the first release (2026-10-22), 6. Checkpoint 2 and 2.1: built, then reverted (2026-10-22), What changes were made, liveSlug(), planNewRoom() (+3 more)

### Community 31 - "Database schemas"
Cohesion: 0.12
Nodes (15): 🧪 `0001_init.sql` (checkpoint 2), 🧪 `0002_messages.sql` (checkpoint 2.1), 1. Device (Ground 0), 2. Cloudflare D1: the main database, 3. Firestore (main project), 4. Firestore backup (separate project, Firestore only, no sign-in), 6. Durable Object storage (Cloudflare-only sensitive state), 7. R2 and object tiers (+7 more)

### Community 32 - "HangCord desktop app (checkpoint 1.1)"
Cohesion: 0.22
Nodes (8): Desktop end-to-end test, HangCord desktop app (checkpoint 1.1), Linux, macOS (owner, on the Mac), Manual checklist (every checkpoint, each OS), Run and build, What's in the Rust core, Windows (CI or a Windows PC)

### Community 33 - "schemas.ts"
Cohesion: 0.14
Nodes (18): parseBits(), key(), MAX_ROOMS_PER_CATEGORY, MAX_ROOMS_PER_HANGOUT, NEW_ROOM_ERROR_STATUS, NewRoomError, openedBits(), bitfield (+10 more)

### Community 34 - "ui/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 35 - "tokens.ts"
Cohesion: 0.18
Nodes (8): 2. Checkpoint 1: foundation (`cp-001`), Avatar(), LABEL, PresenceBadge(), breakpoint, Presence, size, react-dom

### Community 36 - "permissions.test.ts"
Cohesion: 0.31
Nodes (7): BIT, has(), KNOWN_BITS, PermissionName, PERMISSIONS, ROOM_SCOPED_BITS, here

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

### Community 47 - "ClientCache"
Cohesion: 0.06
Nodes (36): useCachedHangout(), ClientCache, MAX_HANGOUT_SNAPSHOTS, Platform, applyHangoutUpdate(), ApplyResult, etagForHangout(), planReadyForHangout() (+28 more)

### Community 54 - "tests/ui/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 55 - "platform.ts"
Cohesion: 0.24
Nodes (6): GovernorStatus, Invoke, tauri(), TauriCacheStore, watchGovernor(), @tauri-apps/api

### Community 57 - "Workflow design"
Cohesion: 0.20
Nodes (9): 1. App ↔ API ↔ storage (big picture), 2. Opening the app (cache first, then sync), 3. Signing in (checkpoint 2.2; confirm the Firebase-config choice with the owner), 4. Sending a message (checkpoint 2.1), 5. Storage when a free quota runs out (MASTER_PLAN §8.3), 6. Git, branches and releases, 7. How an agent works (every task), 8. Where each rule is enforced (+1 more)

### Community 58 - "Handoff — start here"
Cohesion: 0.22
Nodes (8): Handoff — start here, How to work: the loop, every time, Non-negotiables (break one and the work is rejected), The six files in this folder, What HangCord is, When you're blocked, Where everything lives, Where things stand (2026-10-22)

### Community 59 - "Preferences: what the owner wants"
Cohesion: 0.29
Nodes (6): Design, Infrastructure and data, Preferences: what the owner wants, Process, Product, Working with the owner

### Community 60 - "What has to be done next"
Cohesion: 0.29
Nodes (6): 0. Before any new work, 1. Owner tasks (agents can explain each one, but not do it), 2. Checkpoint 2: ask the owner how to build it, then build it, 3. Engineering debt (do it alongside the checkpoints), 4. Later phases (MASTER_PLAN §16), What has to be done next

## Knowledge Gaps
- **56 isolated node(s):** `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop`, `BadKey`, `TooLarge` (+51 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 602 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `HangCord — Master Plan` connect `HangCord — Master Plan` to `README.md`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop` to the rest of the system?**
  _56 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `governor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05150905432595573 - nodes in this community are weakly interconnected._
- **Why does `2.2 Vocabulary map (use these words everywhere in UI, code and docs)` connect `HangCord — Master Plan` to `ClientCache`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Should `cache.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.0898989898989899 - nodes in this community are weakly interconnected._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10804597701149425 - nodes in this community are weakly interconnected._
- **Should `HangCord — Master Plan` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._