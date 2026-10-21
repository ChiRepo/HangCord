# HangCord

[![ci](https://github.com/ChiRepo/HangCord/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ChiRepo/HangCord/actions/workflows/ci.yml) · [Download (Releases)](https://github.com/ChiRepo/HangCord/releases) · [MIT License](LICENSE)

**Better place to hang out.** A free, lightweight, privacy-respecting hangout app for desktop (Windows, macOS, Linux) with a web companion.

> HangCord is in early development. Expect slow loading at times, bugs and glitches while we build.

- Plan and architecture: [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)
- Rules for AI agents: [`AGENTS.md`](AGENTS.md)
- Access, roles and settings spec: [`docs/ACCESS_AND_SETTINGS.md`](docs/ACCESS_AND_SETTINGS.md)
- Secrets and sensitive data register: [`docs/SECRETS_AND_SENSITIVE_DATA.md`](docs/SECRETS_AND_SENSITIVE_DATA.md)
- UI/UX: current design system **Calm Minimal** — [`ui-ux/calm-minimal/DESIGN_SYSTEM.md`](ui-ux/calm-minimal/DESIGN_SYSTEM.md); all screens and tokens in [`ui-ux/`](ui-ux/README.md)
- Code map (Graphify): [`graphify/`](graphify/README.md) — start with `graphify/graph/GRAPH_REPORT.md`; refresh with `npm run graph`; AI agents query it through the local `hangcord-code-map` MCP server (`.mcp.json`)

## Download and branches
- **Desktop app (the real application):** installers for Windows (`.exe` / `.msi`), macOS (`.dmg`) and Linux (`.deb` / AppImage) on the [Releases page](https://github.com/ChiRepo/HangCord/releases). Releases are built by `.github/workflows/release.yml` from a `v*` tag.
- **`main`** — the real application: the desktop app (`apps/desktop`) and everything it shares (`packages/*`, `workers/*`, docs).
- **`WebApp`** — the web companion (browser version, hosting, phone layouts). Kept separate from `main`.

## Quick start
```
npm ci
npm run checkpoint   # lint, typecheck, unit tests, build, mobile size budget, secret-name check, e2e (desktop + phones)
npm run dev -w @hangcord/desktop    # the desktop app with hot reload (screens: apps/desktop/ui)
```
Node 22.12+ required. Workers: `npm run dev -w workers/api` (needs a git-ignored `workers/api/.dev.vars`, names in `.dev.vars.example`).

Status: **checkpoint 1 (`cp-001`) done** — foundation. **Checkpoint 1.1 (`cp-001.1`) — the real desktop application** (`apps/desktop`, Tauri 2) is **done on Linux** (installer `.deb` + AppImage, end-to-end tested); macOS is built on the owner's Mac and Windows in CI. See `docs/MASTER_PLAN.md` §16.1.

No secrets live in this repository. Fixed secrets are Cloudflare Workers Secrets; changing sensitive data (email codes, tokens, keys) lives in Cloudflare Durable Objects.
