# Graph Report - hangcord  (2026-10-22)

## Corpus Check
- 107 files · ~81,723 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .toml 14, (none) 11, .xml 2)

## Summary
- 1053 nodes · 1586 edges · 67 communities (57 shown, 10 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c2bf87dc`
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
- app.ts
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
- cache.test.ts
- livekit/README.md
- hangcord-desktop
- hangcord-code-map
- tests/ui/tsconfig.json
- vitest
- contrast.ts
- compute.ts
- protocol/package.json
- auth/session.ts
- tokens.ts
- 10.6 Decrypting hangout keys — exact procedure
- api.int.test.ts
- firebase.ts
- platform.ts
- sample.ts
- HangCord

## God Nodes (most connected - your core abstractions)
1. `HangCord — Master Plan` - 20 edges
2. `CacheError` - 19 edges
3. `HangCord — Access, Settings and Hangout Keys (spec)` - 18 edges
4. `ClientCache` - 17 edges
5. `App()` - 16 edges
6. `scripts` - 16 edges
7. `vitest` - 16 edges
8. `compilerOptions` - 16 edges
9. `UserDO` - 16 edges
10. `EncryptedStore` - 15 edges

## Surprising Connections (you probably didn't know these)
- `5. Secrets` --references--> `UserDO`  [INFERRED]
  AGENTS.md → workers/api/src/user-do.ts
- `4. Changing sensitive data (Durable Objects)` --references--> `UserDO`  [INFERRED]
  docs/SECRETS_AND_SENSITIVE_DATA.md → workers/api/src/user-do.ts
- `3. What HangCord is` --references--> `computePermissions()`  [INFERRED]
  AGENTS.md → packages/protocol/src/compute.ts
- `16. Tests that must exist` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts
- `D. Getting the plain HSK for `(hangoutId, epoch)` — source order` --references--> `computePermissions()`  [INFERRED]
  docs/ACCESS_AND_SETTINGS.md → packages/protocol/src/compute.ts

## Import Cycles
- None detected.

## Communities (67 total, 10 thin omitted)

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
Cohesion: 0.17
Nodes (12): 1. Start of every session, 2. The private folder, 4. Anti-hallucination rules, 5. Secrets, 6. Checkpoint protocol (after every piece of finished work), 6a. How to run everything, 6b. Desktop app rules (checkpoint 1.1, `apps/desktop`), 6c. Code map (Graphify, `graphify/`) (+4 more)

### Community 4 - "worker-kit/src/index.ts"
Cohesion: 0.14
Nodes (16): CHECKPOINT, CURRENT_PHASE, PROTOCOL_VERSION, errorResponse(), health(), json(), missingSecrets(), ServiceName (+8 more)

### Community 5 - "HangCord — Master Plan"
Cohesion: 0.05
Nodes (40): 10. Free VoIP and realtime transport providers, 11. Dynamic memory governor (≤ 1.7 GB), 12. Secrets and security, 13. Repository, checkpoints and pushing, 14. Agent and subagent workflow, 15.1 Mobile gate — every checkpoint (owner request, 2026-10-21), 15. Testing and release gates, 16.1 Checkpoint numbering (owner decision, 2026-10-21) (+32 more)

### Community 6 - "package.json"
Cohesion: 0.05
Nodes (39): description, devDependencies, eslint, @eslint/js, globals, @types/node, typescript, typescript-eslint (+31 more)

### Community 8 - "HangCord — Access, Settings and Hangout Keys (spec)"
Cohesion: 0.09
Nodes (18): 11. Step-up confirmation, 12. Audit log, 13. Data model and Firestore rules, 14. API additions, 15. Threat model (and the control for each), 1. Principles, 2. Who's who, 3. Permission flags (+10 more)

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
Cohesion: 0.20
Nodes (16): AddError, AddRoomDialog(), App(), ERROR_TEXT, Layer, Loaded, mb(), PREF_LIGHTWEIGHT (+8 more)

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

### Community 17 - "ui/package.json"
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
Cohesion: 0.17
Nodes (12): key(), liveSlug(), MAX_ROOMS_PER_CATEGORY, MAX_ROOMS_PER_HANGOUT, NEW_ROOM_ERROR_STATUS, NewRoomError, openedBits(), planNewRoom() (+4 more)

### Community 31 - "protocol/test/gateway.test.ts"
Cohesion: 0.19
Nodes (6): GatewayOp, CreateRoomRequest, here, css, here, listed

### Community 32 - "HangCord desktop app (checkpoint 1.1)"
Cohesion: 0.22
Nodes (8): Desktop end-to-end test, HangCord desktop app (checkpoint 1.1), Linux, macOS (owner, on the Mac), Manual checklist (every checkpoint, each OS), Run and build, What's in the Rust core, Windows (CI or a Windows PC)

### Community 33 - "app.ts"
Cohesion: 0.08
Nodes (27): CreateHangoutRequest, ErrorBody, GuidelinesChoice, HangoutSummary, Health, Id, PreferencesPatch, RefreshRequest (+19 more)

### Community 34 - "ui/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 35 - "policy.test.ts"
Cohesion: 0.22
Nodes (7): configs, files, read(), root, secretNames, walk(), workers

### Community 36 - "permissions.test.ts"
Cohesion: 0.27
Nodes (9): BIT, has(), KNOWN_BITS, parseBits(), PermissionName, PERMISSIONS, ROOM_SCOPED_BITS, bitfield (+1 more)

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
Nodes (36): useCachedHangout(), ClientCache, MAX_HANGOUT_SNAPSHOTS, Platform, applyHangoutUpdate(), ApplyResult, etagForHangout(), planReadyForHangout() (+28 more)

### Community 54 - "tests/ui/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, types, extends, include, ../../tsconfig.base.json

### Community 57 - "compute.ts"
Cohesion: 0.09
Nodes (33): 3. What HangCord is, 16. Tests that must exist, D. Getting the plain HSK for `(hangoutId, epoch)` — source order, ALL_BITS, computePermissions(), EVERYONE_FORBIDDEN, FLAG_PENDING, NEEDS_SEND (+25 more)

### Community 58 - "protocol/package.json"
Cohesion: 0.11
Nodes (18): dependencies, zod, description, devDependencies, @apidevtools/swagger-parser, yaml, exports, ./openapi.yaml (+10 more)

### Community 59 - "auth/session.ts"
Cohesion: 0.19
Nodes (14): 8.3 Snapshot mode — one write per database (owner's CSV technique), makeApp(), b64url(), enc, fromB64url(), hmacKey(), parseRefreshToken(), randomToken() (+6 more)

### Community 60 - "tokens.ts"
Cohesion: 0.18
Nodes (8): Avatar(), LABEL, PresenceBadge(), breakpoint, color, Presence, size, react-dom

### Community 61 - "10.6 Decrypting hangout keys — exact procedure"
Cohesion: 0.14
Nodes (14): 10.1 Key hierarchy and where every copy lives, 10.2 The member's private vault document, 10.3 Removal "until they leave", 10.4 What the key also protects, 10.5 Rotation, 10.6 Decrypting hangout keys — exact procedure, 10. Hangout secret key, A. Fixed formats (+6 more)

### Community 62 - "api.int.test.ts"
Cohesion: 0.18
Nodes (10): Session, api(), b64(), config, here, idToken(), jwk, persist (+2 more)

### Community 63 - "firebase.ts"
Cohesion: 0.22
Nodes (11): Env, REQUIRED_SECRETS, b64urlToBytes(), decodeJson(), FirebaseClaims, googleKeySource(), importRsaJwk(), VerifyError (+3 more)

### Community 64 - "platform.ts"
Cohesion: 0.24
Nodes (6): GovernorStatus, Invoke, tauri(), TauriCacheStore, watchGovernor(), @tauri-apps/api

### Community 65 - "sample.ts"
Cohesion: 0.33
Nodes (5): SAMPLE_HANGOUT, SAMPLE_HANGOUTS, SAMPLE_MEMBERS, SAMPLE_MESSAGES, SAMPLE_PREFS

### Community 66 - "HangCord"
Cohesion: 0.67
Nodes (3): Download and branches, HangCord, Quick start

## Knowledge Gaps
- **58 isolated node(s):** `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop`, `BadKey`, `TooLarge` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 584 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `vitest` to `policy.test.ts`, `permissions.test.ts`, `worker-kit/src/index.ts`, `package.json`, `cache.test.ts`, `gateway-events.ts`, `contract.test.ts`, `api.int.test.ts`, `compute.ts`, `auth/session.ts`, `rooms.ts`, `protocol/test/gateway.test.ts`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `graphify-mcp`, `@tauri-apps/cli`, `hangcord-desktop` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `governor.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.05443371378402107 - nodes in this community are weakly interconnected._
- **Why does `UserDO` connect `HangCord — Access, Settings and Hangout Keys (spec)` to `app.ts`, `AGENTS.md — rules for every AI agent working on HangCord`, `HangCord — Master Plan`, `HangCord — Secrets and Sensitive Data Register`, `auth/session.ts`, `firebase.ts`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `cache.rs` be split into smaller, more focused modules?**
  _Cohesion score 0.08244680851063829 - nodes in this community are weakly interconnected._
- **Why does `computePermissions()` connect `compute.ts` to `HangCord — Master Plan`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `worker-kit/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14492753623188406 - nodes in this community are weakly interconnected._