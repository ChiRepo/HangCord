# Handoff — start here

> **To GPT-6 Astra, or whichever model picks this up next:** welcome to HangCord. You're joining a project that already has a working desktop app, a clean contract, real tests and an owner who knows exactly what they want. Your job is not to reinvent any of it. Build the next slice carefully, prove it works, and leave the project a little better than you found it. Go one step at a time, test everything, never guess, and say plainly when you're stuck. Careful, verified work is what makes an app feel effortless to the people who use it. You can do this.

_Written 2026-10-22, after checkpoint 1.1. This folder is for any AI agent or developer continuing the work._

## The six files in this folder

| File | Read it when |
|---|---|
| **`handoff.md`** (this file) | First. What HangCord is, where things stand, how to work |
| **`what changes were made.md`** | You want the history: what was built, decided, reverted and why |
| **`what has to be done next.md`** | You're choosing the next task (owner tasks and agent tasks, in order) |
| **`preferences.md`** | Before every decision the owner might care about: style, process, product rules |
| **`database schemas.md`** | Before touching any data: device cache, D1, Firestore, Durable Objects, R2 |
| **`workflow design.md`** | Before writing code: diagrams of the app, API, data flow, git and the build loop |

## What HangCord is

A free, privacy-respecting place to hang out with friends: hangouts with text rooms and voice lounges, roles and permissions, and later encrypted DMs, live translation, watch-together, whiteboards and AI catch-up.

- **The real product is the desktop app:** Tauri 2 with a Rust core, for Windows, macOS and Linux.
- **There is also a web companion** for browsers and phones.
- **It is a full, installable application, not a webapp.** Treat it that way.
- **The server side runs on Cloudflare's free plan,** using Workers and Durable Objects, D1 and R2. Firebase handles sign-in only.
- **It is a clean-room build:** no Discord code, names, logos, colours or sounds.
- **HangCord's own words:** use Hangout, Room, Lounge, Spotlight, Board, Bulletin, Strand and Together. Never say "server" or "channel" in the UI.

## Where things stand (2026-10-22)

| Checkpoint | Tag / commit | Status |
|---|---|---|
| 1, foundation (`cp-001`) | tag `cp-001` → `f6b9ecc` | ✅ done |
| 1.1, the real desktop app (`cp-001.1`) | tag `cp-001.1` → `6a478e3`, then CI/release fixes up to `c2bf87d` | ✅ done |
| 2, server core (`cp-002`) | `b65d0d2` | ↩️ **built, then reverted at the owner's request** (`f036237`); recoverable |
| 2.1, realtime (`cp-002.1`) | `7b97ac0` | ↩️ **built, then reverted** together with cp-002; recoverable |

**`main` today equals `c2bf87d`:** checkpoint 1.1 plus the CI and release fixes.

**What is verified:**
- The desktop app builds and launches.
- The desktop end-to-end test passes 13 of 13 checks, on both the test build and the installed `.deb`. They cover the memory governor, the encrypted local cache, the + button, single instance, and restarting from the cache.
- The automatic checks on GitHub (CI) pass on `main`.
- A **draft release `v0.0.1`** has installers for macOS (`.dmg`), Windows (`.exe` / `.msi`) and Linux (`.deb` / AppImage). The owner publishes it.

**Do not redo checkpoint 2 on your own initiative.** The owner reverted it on purpose, so ask how they want it built first. The options are listed in `what has to be done next.md`.

## Where everything lives

- **GitHub:** `ChiRepo/HangCord`
  - **`main` = the real application:** the desktop app plus everything it shares.
  - **`WebApp` = the web companion:** the browser version, its hosting and phone tests. Never merge `WebApp` into `main` wholesale; port shared fixes by hand.
  - **Releases:** push the `release` branch (`git push origin main:release`), or push a `v*` tag. Either one builds installers for all three systems into a draft GitHub Release.
- **Repo map:**

```
apps/desktop/            the app: src-tauri/ (Rust core) + ui/ (React screens, built into the app)
packages/protocol/       THE contract: openapi.yaml, gateway-events.ts, zod schemas, permissions, rooms
packages/cache/          shared cache logic (prefs + hangout snapshots, versions, patches, LRU, wipe)
packages/ui/             Calm Minimal tokens + components (PresenceBadge)
packages/worker-kit/     fail-closed secret gate + JSON helpers for every Worker
workers/                 api, gateway, storage-router, emergency-restore (Cloudflare Workers)
tests/desktop/           end-to-end test of the BUILT app (tauri-driver + WebKitWebDriver)
tests/ui/                Playwright tests of the screens at desktop window sizes
tools/policy/            repo rules as tests (secrets, crons, private folders, Graphify, layout)
graphify/                code map — read graph/GRAPH_REPORT.md before searching files
docs/                    MASTER_PLAN.md, ACCESS_AND_SETTINGS.md, SECRETS_AND_SENSITIVE_DATA.md
ui-ux/calm-minimal/      the approved design system and screens
.github/workflows/       ci.yml (every push/PR) and release.yml
```

- **Owner-only folders:** `Private files (.md files store here)/` and `private and only to be accessed once…/`, which holds `rules.md`. They exist only on the owner's computer. They are git-ignored and must never be read, copied or committed unless the owner says so in the conversation (see `AGENTS.md` §1–2).

## How to work: the loop, every time

1. **Read in this order:** `AGENTS.md` → this folder → `docs/MASTER_PLAN.md` (§5 diagrams, §6 contract, §16 roadmap) → the parts of `docs/ACCESS_AND_SETTINGS.md` your task touches. If the owner gives you `rules.md`, read it **once** at the start.
2. **Get the baseline:** `npm ci`, then `npm run checkpoint`. Note what passes before you change anything.
3. **Map before you search:** read `graphify/graph/GRAPH_REPORT.md`, then use `graphify query "…"`, `graphify explain "Name"` or `graphify affected "Name"` with `GRAPHIFY_OUT=graphify/graph` set. It's faster and cheaper than opening files at random.
4. **Contract first:** any new endpoint, event or field goes into `packages/protocol` (`openapi.yaml` + zod) **before** the code that uses it. `contract.test.ts` fails if the docs and the contract drift apart.
5. **Write the test first, then the smallest slice of code.** Run it and watch it fail, then make it pass.
6. **Run everything:**
   - `npm run checkpoint` (lint, typecheck, unit tests, build, secret-name check, UI tests)
   - `npm run desktop:test` (Rust)
   - when the app changes: the desktop e2e (`apps/desktop/README.md`)
   - `npm run graph` (refresh the code map)
   - `gitleaks git . --config .gitleaks.toml`
7. **Get an independent review** from a fresh agent or a person. Fix what's real; push back with evidence on what isn't.
8. **Update the docs** that your change makes wrong, including this folder. Write the change into `what changes were made.md`.
9. **Commit only when the owner asks.** Use conventional commits, end with the attribution lines your tool requires, and tag `cp-NNN` at a checkpoint. The rule: everything already done is pushed before new work starts.
10. **Report back** in plain words: what changed, the exact commands you ran and their real output, what's left, and any risk.

## Non-negotiables (break one and the work is rejected)

- **Never invent values.** If the docs don't say, ask; never invent an endpoint, permission bit, limit or price. Check facts that change over time, like versions, free-tier limits and API behaviour, against official sources.
- **Secrets live only in Cloudflare Workers secrets,** and the owner sets them with `npx wrangler secret put NAME`.
  - Never put a secret value in code, `wrangler.toml` vars, markdown, logs, tests, KV, R2 or GitHub.
  - Never ask the owner to paste one into chat.
  - The emergency CSV private key is never generated, seen or handled by an agent.
- **Firebase configuration is kept in Cloudflare,** not in the app or the repo (owner's decision 2026-10-22). Don't commit Firebase project IDs or API keys; see `what has to be done next.md`.
- **Data rules:**
  - Access data (members, roles, overrides, keys, bans) lives only in D1 and fails **closed**.
  - Every write goes into the CSV journal first.
  - Message bodies are encrypted at rest.
  - The client cache never decides access.
- **Free tier first:**
  - No paid services.
  - At most 5 Cron Triggers per Cloudflare account (all timed jobs share one 15-minute cron).
  - Watch the 100k requests/day Workers budget.
- **Memory:** the desktop app's governor caps total memory at 1.7 GB, and every in-memory cache must respect its Green / Yellow / Red zones.
- **Design:** use Calm Minimal tokens only, with no raw colours. Presence badges are perfect circles. On the WebApp branch, every checkpoint must also pass the mobile gate.
- **Long builds:** if the owner is chatting with you, say so before starting a long build, and stop when they interrupt. They have stopped runs before, and that is their call.

## When you're blocked

Stop, write down what you tried and the real error output, and ask the owner one clear question. Don't work around authentication, don't disable a test or a policy check to make something pass, and don't guess.
