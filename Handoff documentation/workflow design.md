# Workflow design

How the app, the API and the work itself flow. These diagrams summarise `docs/MASTER_PLAN.md` §5 (the full system map lives there and is the source of truth). If code and a diagram disagree, fix the diagram or the code **first**, in the same change. Don't build from memory.

Legend: **solid** = exists in `main` today · **dashed** = designed, being built in checkpoint 2 and later.

## 1. App ↔ API ↔ storage (big picture)
```mermaid
flowchart LR
  subgraph Desktop["HangCord desktop app (Tauri 2) — main branch"]
    UI["Screens (React, apps/desktop/ui)"]
    Core["Rust core"]
    Gov["Memory governor ≤ 1.7 GB"]
    Cache[("Encrypted SQLite cache<br/>prefs + hangout snapshots")]
    Key[["OS keychain: device key"]]
    UI <-->|"typed IPC (8 commands) + governor://status"| Core
    Core --- Gov
    Core --- Cache
    Core --- Key
  end
  Web["Web companion — WebApp branch"]

  subgraph CF["Cloudflare (all secrets here)"]
    API["API Worker /v1"]
    GW["Gateway Worker (WSS)"]
    UDO["UserDO"]
    HDO["HangoutDO / RoomDO"]
    VDO["VerificationDO"]
    SR["StorageRouter"]
    SEC[["Workers secrets + config"]]
  end
  D1[("D1 — main database")]
  FS[("Firestore — key vaults + spill snapshots")]
  BK[("Firestore backup → Backup DB #2")]
  R2[("R2 — CSV journal, encrypted backups, media")]
  FB["Firebase Auth"]

  Core -.->|HTTPS| API
  Core -.->|WSS| GW
  Web -.-> API
  Web -.-> GW
  API -.-> UDO
  API -.-> VDO
  GW -.-> HDO
  API -.-> D1
  HDO -.-> D1
  SR -.-> D1
  SR -.-> FS
  SR -.->|"only if D1 + Firestore fail"| BK
  SR -.-> R2
  API -.->|"verify ID tokens"| FB
  SEC -.-> API
  SEC -.-> GW
  SEC -.-> SR
```

## 2. Opening the app (cache first, then sync)
```mermaid
sequenceDiagram
  participant U as User
  participant UI as Screens
  participant C as Rust core
  participant S as Encrypted cache
  participant G as Gateway
  U->>UI: opens HangCord
  UI->>C: cache_get("prefs"), cache_get("hangout:…")
  C->>S: read + decrypt (AAD = key)
  S-->>UI: last copy → paint instantly, no spinner
  Note over UI,G: from here on, checkpoint 2.1+
  UI-->>G: IDENTIFY {token, cache: {prefsVersion, hangouts: {id: version}}}
  G-->>UI: READY — "unchanged" | patches | full snapshot | removed
  UI->>C: cache_put(new copies)
  G-->>UI: live HANGOUT_UPDATE / ROOM_CREATE / PREFERENCES_UPDATE
```
**Rule:** the cache only makes things fast. Every action is checked again on the server with `computePermissions()`.

## 3. Signing in (checkpoint 2.2; Firebase configuration stays in Cloudflare)
```mermaid
sequenceDiagram
  participant A as Desktop app
  participant B as System browser
  participant W as API Worker
  participant F as Firebase Auth / Google
  alt Continue with Google
    A->>B: open Google sign-in (PKCE, loopback 127.0.0.1:<port>)
    B-->>A: auth code (loopback)
    A->>W: POST /auth/google/exchange {code, verifier}
    W->>F: exchange (client secret stays in Workers secrets)
  else Email + password
    A->>W: credentials (TLS; Firebase configuration stays in the Worker)
    W->>F: Identity Toolkit REST (key from Workers config)
  end
  F-->>W: Firebase ID token
  W->>W: verify RS256 against Google's keys; email/password must be verified
  W-->>A: HangCord session (15 min) + single-use refresh token
  A->>A: keep both in the OS keychain
```

## 4. Sending a message (checkpoint 2.1, locally verified)
Desktop integration and its optimistic outbox belong to checkpoint 2.2. This server path is working in local integration tests:

```mermaid
sequenceDiagram
  participant C as Client
  participant R as RoomDO
  participant H as HangoutDO key custodian
  participant D as D1
  C->>R: IDENTIFY then MESSAGE_CREATE {roomId, content, nonce}
  R->>R: Active session, current permissions, nonce and rate checks
  R->>H: Seal message (fresh permissions checked again)
  H-->>R: Ciphertext + epoch (no key)
  R->>R: Atomically store encrypted message, journal, outbox and sequence
  R-->>C: MESSAGE_CREATE to each currently authorized socket
  R-->>C: MESSAGE_ACK {nonce, ok:true, messageId, seq}
  R->>D: Background journal + ciphertext write
  D-->>R: Read back persisted ciphertext
  R->>R: Remove confirmed local journal and outbox entry
```
An alarm retries failed D1 writes; the local journal remains until read-back succeeds. REST fallback send and history use the same RoomDO. Successful nonce retries return the original message and sequence. This is not yet encrypted CSV sealing or tier failover.

## 5. Storage when a free quota runs out (MASTER_PLAN §8.3)
```mermaid
stateDiagram-v2
  [*] --> RowMode
  RowMode: Row mode — rows go to D1
  RowMode --> CsvBuffer: ≥ 85% of daily writes, or failing
  CsvBuffer: Only the CSV journal grows (no per-row writes)
  CsvBuffer --> Snapshot: every 15 min or 700 KB
  Snapshot: ONE gzipped CSV → ONE write to the first healthy DB (D1 ⇄ Firestore → backups)
  Snapshot --> CsvBuffer: read-back checksum OK
  CsvBuffer --> Restore: quota reset / healthy again
  Restore: expand snapshots back home, verify, delete
  Restore --> RowMode
```

## 6. Git, branches and releases
```mermaid
flowchart LR
  W["work on a branch / main"] --> T["tests + desktop e2e + gitleaks + npm run graph"]
  T --> R["independent review"]
  R --> M["main = the real application"]
  M -->|"CI: checks, secrets-scan, code-map, desktop-linux, desktop-windows"| OK{"green?"}
  OK -->|no| W
  OK -->|yes| TAG["tag cp-NNN (owner can add tags)"]
  M -->|"git push origin main:release  or  v* tag"| REL["release.yml → installers for macOS / Windows / Linux → DRAFT GitHub Release"]
  REL --> PUB["owner publishes"]
  WA["WebApp branch = web companion"] -.->|"port shared fixes by hand, never a wholesale merge"| M
```

## 7. How an agent works (every task)
```mermaid
flowchart TD
  A["Read AGENTS.md + Handoff documentation/ + MASTER_PLAN §5–6"] --> B["npm ci && npm run checkpoint (baseline)"]
  B --> C["Ask the code map: GRAPH_REPORT.md, graphify query/explain/affected"]
  C --> D["Contract first: packages/protocol (openapi.yaml + zod)"]
  D --> E["Write the test, watch it fail"]
  E --> F["Smallest slice of code"]
  F --> G["checkpoint + desktop:test + desktop e2e + gitleaks + npm run graph"]
  G -->|fail| F
  G -->|pass| H["Independent review"]
  H -->|real issue| F
  H -->|ok| I["Update docs + this folder's change log"]
  I --> J["Commit when the owner asks; push before new work"]
  J --> K["Report: what changed, commands + real output, what's left"]
  K --> A
```

## 8. Where each rule is enforced
| Rule | Enforced by |
|---|---|
| Docs ⊆ contract | `packages/protocol/test/contract.test.ts` |
| Permission bits match the docs | `packages/protocol/test/permissions.test.ts` |
| No secrets in config, private folders ignored, ≤ 5 crons, layout and design rules | `tools/policy/test/policy.test.ts` |
| No leaked secrets | gitleaks (CI `secrets-scan`, `.gitleaks.toml`) |
| Code map is fresh and private-safe | CI `code-map` (`graphify/refresh.sh --check`) + policy tests |
| The built app really works | `tests/desktop/run.mjs` (CI `desktop-linux`) |
| Screens work at desktop sizes | `tests/ui` (Playwright + axe) |
