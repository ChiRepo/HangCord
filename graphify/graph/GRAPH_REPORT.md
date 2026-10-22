# Graph Report - hangcord  (2026-10-22)

## Corpus Check
- 117 files · ~86,524 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .toml 15, (none) 11, .xml 2)

## Summary
- 1147 nodes · 1811 edges · 72 communities (63 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b65d0d2e`
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
- run.mjs
- contract.test.ts
- emergency-restore/package.json
- HangCord — Secrets and Sensitive Data Register
- cache/package.json
- worker-kit/package.json
- policy/package.json
- HangCord UI/UX
- exports/README.md
- rooms.ts
- protocol/test/gateway.test.ts
- HangCord desktop app (checkpoint 1.1)
- schemas.ts
- ui/tsconfig.json
- policy.test.ts
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
- vitest
- contrast.ts
- compute.ts
- protocol/package.json
- hangout-do.ts
- tokens.ts
- 10.6 Decrypting hangout keys — exact procedure
- helpers.ts
- server/package.json
- platform.ts
- cache.test.ts
- MemoryCacheStore
- UserDO
- client-cache.ts
- CacheStore
- cache/src/patch.ts
- server/tsconfig.json

## God Nodes (most connected - your core abstractions)
1. `HangoutDO` - 23 edges
2. `HangCord — Master Plan` - 20 edges
3. `CacheError` - 19 edges
4. `vitest` - 19 edges
5. `HangCord — Access, Settings and Hangout Keys (spec)` - 18 edges
6. `ClientCache` - 17 edges
7. `App()` - 16 edges
8. `scripts` - 16 edges
9. `compilerOptions` - 16 edges
10. `UserDO` - 16 edges

## Surprising Connections (you probably didn't know these)
- `3. What HangCord is` --references--> `computePermissions()`  [INFERRED]
  AGENTS.md → packages/protocol/src/compute.ts
- `16. Tests that must exist` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts
- `D. Getting the plain HSK for `(hangoutId, epoch)` — source order` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts
- `16.1 Checkpoint numbering (owner decision, 2026-10-21)` --references--> `computePermissions()`  [INFERRED]
  docs/MASTER_PLAN.md → packages/protocol/src/compute.ts
- `7.1 Caching: user preferences and hangouts (owner request, 2026-10-21)` --references--> `computePermissions()`  [INFERRED]
  docs/MASTER_PLAN.md → packages/protocol/src/compute.ts

## Import Cycles
- None detected.

## Communities (72 total, 9 thin omitted)

### Community 0 - "governor.rs"
Cohesion: 0.05
Nodes (43): KeyStorage, FileFallback, OsKeychain, BUDGET_EVERY, effective_budget(), FLOOR, GIB, Governor (+35 more)

### Community 1 - "HangCord Design System — Calm Minimal (current)"
Cohesion: 0.17
Nodes (12): 0. How this relates to the earlier design, 1. Principles, 2. Colour (dark theme — default), 3. Typography, 4. Space, shape, size, 5. Motion, 6. Components, 6a. Phones (mobile gate — every screen, MASTER_PLAN §15.1) (+4 more)

### Community 2 - "cache.rs"
Cohesion: 0.08
Nodes (24): CacheError, BadKey, Corrupt, Full, Storage, TooLarge, db_file_is_owner_only(), each_write_uses_a_fresh_nonce() (+16 more)

### Community 3 - "AGENTS.md — rules for every AI agent working on HangCord"
Cohesion: 0.18
Nodes (11): 1. Start of every session, 2. The private folder, 4. Anti-hallucination rules, 6. Checkpoint protocol (after every piece of finished work), 6a. How to run everything, 6b. Desktop app rules (checkpoint 1.1, `apps/desktop`), 6c. Code map (Graphify, `graphify/`), 7. Lead agent and subagents (+3 more)

### Community 4 - "app.ts"
Cohesion: 0.06
Nodes (51): CHECKPOINT, CURRENT_PHASE, PROTOCOL_VERSION, b64url(), enc, fromB64url(), hmacKey(), parseRefreshToken() (+43 more)

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
Cohesion: 0.13
Nodes (15): 12. Audit log, 14. API additions, 15. Threat model (and the control for each), 1. Principles, 2. Who's who, 3. Permission flags, 4. Computing permissions, 5. Hierarchy (+7 more)

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
Cohesion: 0.16
Nodes (19): AddError, AddRoomDialog(), App(), ERROR_TEXT, Layer, Loaded, mb(), PREF_LIGHTWEIGHT (+11 more)

### Community 13 - "tests/ui/package.json"
Cohesion: 0.11
Nodes (15): @axe-core/playwright, @playwright/test, devDependencies, @axe-core/playwright, @playwright/test, name, private, scripts (+7 more)

### Community 14 - "api/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @hangcord/protocol, @hangcord/server, @hangcord/worker-kit, zod, devDependencies, @cloudflare/workers-types, wrangler (+15 more)

### Community 15 - "gateway/package.json"
Cohesion: 0.08
Nodes (23): dependencies, @hangcord/protocol, @hangcord/server, @hangcord/worker-kit, zod, devDependencies, @cloudflare/workers-types, wrangler (+15 more)

### Community 16 - "storage-router/package.json"
Cohesion: 0.10
Nodes (19): dependencies, @hangcord/protocol, @hangcord/worker-kit, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, @hangcord/protocol (+11 more)

### Community 17 - "ui/package.json"
Cohesion: 0.11
Nodes (18): description, devDependencies, react, @types/react, exports, ./components.css, ./tokens.css, react (+10 more)

### Community 18 - "gateway-events.ts"
Cohesion: 0.10
Nodes (18): DETAILED_OPS, DetailedFrame, Envelope, HangoutUpdate, Heartbeat, HeartbeatAck, Hello, Identify (+10 more)

### Community 19 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 20 - "desktop/package.json"
Cohesion: 0.13
Nodes (14): description, devDependencies, @tauri-apps/cli, name, private, scripts, build:app, dev (+6 more)

### Community 21 - "run.mjs"
Cohesion: 0.16
Nodes (9): dataHome, deadline, driver, env, results, session(), sleep(), waitFor() (+1 more)

### Community 22 - "contract.test.ts"
Cohesion: 0.22
Nodes (8): DETAILED_SCHEMAS, docsDir, here, METHODS, shape(), spec, specPath, specShapes

### Community 23 - "emergency-restore/package.json"
Cohesion: 0.14
Nodes (13): description, devDependencies, @cloudflare/workers-types, wrangler, @cloudflare/workers-types, wrangler, name, private (+5 more)

### Community 24 - "HangCord — Secrets and Sensitive Data Register"
Cohesion: 0.18
Nodes (11): 1. The rule in one sentence, 2. Two kinds of sensitive things, 3. Fixed secrets (Workers Secrets), 4. Changing sensitive data (Durable Objects), 4a. CSV backups (MASTER_PLAN §8.5), 5. Things HangCord never stores anywhere, 6. What the client is allowed to hold, 7. Logging and errors (+3 more)

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

### Community 30 - "rooms.ts"
Cohesion: 0.25
Nodes (10): key(), liveSlug(), MAX_ROOMS_PER_CATEGORY, MAX_ROOMS_PER_HANGOUT, NEW_ROOM_ERROR_STATUS, NewRoomError, openedBits(), planNewRoom() (+2 more)

### Community 31 - "protocol/test/gateway.test.ts"
Cohesion: 0.19
Nodes (6): GatewayOp, CreateRoomRequest, here, css, here, listed

### Community 32 - "HangCord desktop app (checkpoint 1.1)"
Cohesion: 0.22
Nodes (8): Desktop end-to-end test, HangCord desktop app (checkpoint 1.1), Linux, macOS (owner, on the Mac), Manual checklist (every checkpoint, each OS), Run and build, What's in the Rust core, Windows (CI or a Windows PC)

### Community 33 - "schemas.ts"
Cohesion: 0.15
Nodes (13): parseBits(), bitfield, CreateHangoutRequest, ErrorBody, GuidelinesChoice, HangoutSummary, Health, Id (+5 more)

### Community 34 - "ui/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 35 - "policy.test.ts"
Cohesion: 0.22
Nodes (7): configs, files, read(), root, secretNames, walk(), workers

### Community 36 - "permissions.test.ts"
Cohesion: 0.19
Nodes (9): BIT, has(), KNOWN_BITS, PermissionName, PERMISSIONS, ROOM_SCOPED_BITS, here, base (+1 more)

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
Cohesion: 0.33
Nodes (4): useCachedHangout(), ClientCache, mergePreferences(), Preferences

### Community 54 - "tests/ui/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 57 - "compute.ts"
Cohesion: 0.09
Nodes (30): 3. What HangCord is, 16. Tests that must exist, D. Getting the plain HSK for `(hangoutId, epoch)` — source order, ALL_BITS, computePermissions(), EVERYONE_FORBIDDEN, FLAG_PENDING, NEEDS_SEND (+22 more)

### Community 58 - "protocol/package.json"
Cohesion: 0.11
Nodes (18): dependencies, zod, description, devDependencies, @apidevtools/swagger-parser, yaml, exports, ./openapi.yaml (+10 more)

### Community 59 - "hangout-do.ts"
Cohesion: 0.07
Nodes (44): CLIENT_OPS, MessageCreateRequest, parseFrame(), MAX_MESSAGE_CHARS, Message, SendMessageRequest, aadKey(), aadMsg() (+36 more)

### Community 60 - "tokens.ts"
Cohesion: 0.18
Nodes (8): Avatar(), LABEL, PresenceBadge(), breakpoint, color, Presence, size, react-dom

### Community 61 - "10.6 Decrypting hangout keys — exact procedure"
Cohesion: 0.14
Nodes (14): 10.1 Key hierarchy and where every copy lives, 10.2 The member's private vault document, 10.3 Removal "until they leave", 10.4 What the key also protects, 10.5 Rotation, 10.6 Decrypting hangout keys — exact procedure, 10. Hangout secret key, A. Fixed formats (+6 more)

### Community 62 - "helpers.ts"
Cohesion: 0.11
Nodes (23): MessagesPage, Session, d1(), persist, signIn(), API_CONFIG, b64(), client() (+15 more)

### Community 63 - "server/package.json"
Cohesion: 0.12
Nodes (15): dependencies, @hangcord/protocol, description, devDependencies, @cloudflare/workers-types, exports, @cloudflare/workers-types, @hangcord/protocol (+7 more)

### Community 64 - "platform.ts"
Cohesion: 0.24
Nodes (6): GovernorStatus, Invoke, tauri(), TauriCacheStore, watchGovernor(), @tauri-apps/api

### Community 65 - "cache.test.ts"
Cohesion: 0.19
Nodes (12): etagForHangout(), planReadyForHangout(), CHOICES, deletePref(), EMPTY_PREFS, getPref(), newRoomGuidelinesDefault(), pendingKeys() (+4 more)

### Community 66 - "MemoryCacheStore"
Cohesion: 0.18
Nodes (5): CacheStoreError, isValidCacheKey(), MAX_KEY_LEN, MAX_VALUE_BYTES, MemoryCacheStore

### Community 67 - "UserDO"
Cohesion: 0.18
Nodes (6): 5. Secrets, 11. Step-up confirmation, 13. Data model and Firestore rules, 7.1 Caching: user preferences and hangouts (owner request, 2026-10-21), 7. Storage architecture: "Ground-to-Sky, free edition", UserDO

### Community 68 - "client-cache.ts"
Cohesion: 0.27
Nodes (8): MAX_HANGOUT_SNAPSHOTS, Platform, applyHangoutUpdate(), ApplyResult, ReadyAction, reconcileReady(), HangoutSync, HangoutSnapshot

### Community 69 - "CacheStore"
Cohesion: 0.28
Nodes (3): CacheStore, KEYS, CacheVersions

### Community 70 - "cache/src/patch.ts"
Cohesion: 0.48
Nodes (5): applyOne(), applyPatch(), FORBIDDEN, PatchError, walk()

### Community 71 - "server/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

## Knowledge Gaps
- **64 isolated node(s):** `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop`, `BadKey`, `TooLarge` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 619 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `cache.test.ts`, `policy.test.ts`, `permissions.test.ts`, `app.ts`, `package.json`, `contract.test.ts`, `compute.ts`, `hangout-do.ts`, `helpers.ts`, `protocol/test/gateway.test.ts`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `HangoutDO` (e.g. with `5. Secrets` and `10.6 Decrypting hangout keys — exact procedure`) actually correct?**
  _`HangoutDO` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop` to the rest of the system?**
  _64 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `governor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05443371378402107 - nodes in this community are weakly interconnected._
- **Why does `Preferences` connect `ClientCache` to `cache.test.ts`, `schemas.ts`, `client-cache.ts`, `app.ts`, `App.tsx`, `gateway-events.ts`, `hangout-do.ts`, `helpers.ts`, `protocol/test/gateway.test.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `cache.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08244680851063829 - nodes in this community are weakly interconnected._
- **Why does `HangCord — Access, Settings and Hangout Keys (spec)` connect `HangCord — Access, Settings and Hangout Keys (spec)` to `compute.ts`, `UserDO`, `10.6 Decrypting hangout keys — exact procedure`, `README.md`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._