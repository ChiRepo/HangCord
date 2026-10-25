# HangCord desktop app

The real application: a Tauri 2 app for **Windows, macOS and Linux**. Its screens live in `ui/` (React + Vite, built into the app by Tauri; the browser companion is on the `WebApp` branch); the Rust core (`src-tauri/`) owns storage, memory policy, authentication and networking; media and advanced crypto follow in later phases (MASTER_PLAN §4).

## What's in the Rust core
| Module | Does | Plan |
|---|---|---|
| `governor.rs` | Memory budget from the machine's RAM (300 MB → 1.7 GB hard cap), `min(profile, 25% of available, 1.7 GB)`, floor 250 MB; samples the whole process tree (core + WebView helpers) every 5 s; Green / Yellow / Red; Lightweight mode forces Lite | §11 |
| `cache.rs` | Encrypted local SQLite cache behind `packages/cache` (preferences + hangout snapshots). AES-256-GCM per value, fresh nonce per write, key name bound as AAD; tampered or wrong-key rows are dropped and re-fetched; strict key format and 2 MB value cap | §7.1 |
| `device_key.rs` | Per-device cache key in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). Falls back to a 0600 key file only when no keychain exists — acceptable because the cache never holds secrets | §7.1 |
| `native.rs` | Compile-time API/gateway origins, native HTTP/WebSocket, serialized session refresh in the OS keychain, safe sign-out and bounded IPC | §6.1 |
| `oauth.rs` | System-browser Google sign-in, random state, S256 PKCE, one-use loopback callback and cancellation | §6.1 |
| `lib.rs` | Typed IPC commands (each granted explicitly in `capabilities/default.json`), single instance, remembered window size/position, strict CSP, governor event `governor://status` | §4, §12 |

IPC errors are short codes only (`bad_key`, `too_large`, `full`, `storage`, `corrupt`, `bad_value`, `busy`) — never paths, SQL or key material.

## Run and build
From the repo root (Node 22.12+, Rust 1.95+):
```
npm ci
npm run dev -w @hangcord/desktop        # dev window with hot reload
npm run desktop:test               # Rust unit tests (also part of `npm test`)
npm run desktop:build              # release build + installers for THIS OS
```
Output: `apps/desktop/src-tauri/target/release/bundle/…`

### macOS (owner, on the Mac)
1. Xcode Command Line Tools: `xcode-select --install`. Rust is already installed on the Mac (`~/.rustup`); run `rustup update`.
2. `npm ci && npm run desktop:build` → `bundle/dmg/HangCord_0.0.1_aarch64.dmg` and `bundle/macos/HangCord.app`.
3. Unsigned builds show a Gatekeeper warning; right-click → Open the first time. Signing + notarisation is an open owner decision (handoff.md).

### Windows (CI or a Windows PC)
WebView2 (preinstalled on Windows 10/11) + Visual Studio Build Tools (C++). `npm run desktop:build` → `.msi` and NSIS `.exe`.

### Linux
`sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev libssl-dev libdbus-1-dev pkg-config build-essential`, then `npm run desktop:build` → `.deb` (AppImage needs network access to fetch its bundling tools).

## Configure sign-in

Set the public `HANGCORD_API_BASE_URL` (HTTPS) and `HANGCORD_GATEWAY_BASE_URL` (WSS) when compiling the app. These are origins only, without paths, credentials, query strings or fragments. No origin is guessed; unconfigured builds show that sign-in is unavailable. Loopback HTTP/WS is permitted only in debug/test-hooks builds. The deployed origins are `https://hangcord-api.jyotsnachaudhari999.workers.dev` and `wss://hangcord-gateway.jyotsnachaudhari999.workers.dev`; live Google sign-in and authenticated restart were verified on macOS on 2026-10-25. CI and release workflows supply these public origins to packaged builds; the Linux test-hooks step overrides them with the local fixture. Do not distribute the loopback test build.

The API Worker holds `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `SESSION_SIGNING_KEY` and the registered Google OAuth configuration; the desktop never contains the Firebase configuration or OAuth secret. Existing verified password accounts and Google accounts can sign in. Account creation/reset and email-code UI follow in checkpoint 2.3.

Both HangCord tokens are kept together in the OS keychain, scoped to the API origin, with no plaintext session fallback. The encrypted cache holds only account-scoped snapshots and preferences. Sign-out clears local credentials/cache even offline; offline server revocation cannot be guaranteed. Message retries use the same nonce and remain bounded in memory; pending messages do not yet survive app termination.

## Desktop end-to-end test

The Linux harness uses a disposable local HTTP/WebSocket protocol fixture and a real OS Secret Service keyring. It tests the native boundary, not Firebase/Google or deployed Workers. Compile the test build with:

```sh
HANGCORD_API_BASE_URL=http://127.0.0.1:39431 HANGCORD_GATEWAY_BASE_URL=ws://127.0.0.1:39431 npx tauri build --no-bundle --features test-hooks --ci
```

Install `tauri-driver` 2.1.0 and `WebKitWebDriver` plus `gnome-keyring`, then run inside `xvfb-run -a dbus-run-session` with an unlocked disposable keyring, as shown in `.github/workflows/ci.yml`. The test command is `node tests/desktop/run.mjs apps/desktop/src-tauri/target/release/hangcord-desktop`.

The harness covers sign-in, authenticated HTTP, live WebSocket messages, room creation, the governor, single instance, cached restart, keychain persistence, encrypted storage and sign-out. Test hooks permit loopback origins and a forced cache file key; session credentials still require the keychain. Never distribute a test-hooks build. macOS has no Tauri WebDriver support; use the manual checklist.

## Checkpoint 2.2 verification (2026-10-24)

Before the issuer fix, all 35 Rust tests passed. The issuer fix adds two tests; all five OAuth tests and 36 standard Rust tests passed. One OS-keychain test stalled and was stopped; see the handoff for its isolated verification. The isolated macOS debug test-hooks app (46.51 MiB) was manually exercised against the local HTTP/WebSocket fixture: password sign-in, hangout creation, room creation, committed message delivery, Lightweight mode, quit and restart with the same keychain session and preferences. This is native fixture evidence, not a real Firebase/Google login or a signed release. The updated Linux harness and Windows checks await CI. The UI suite passed 58 checks with eight expected viewport skips.

## Manual checklist (every checkpoint, each OS)
- [ ] App opens; a second launch focuses the existing window instead of opening another.
- [ ] Window size/position are remembered after quitting.
- [ ] Top bar shows "Memory … / … · profile"; Lightweight mode drops the budget to Lite.
- [ ] Add a room with **+**, quit, reopen: it's there instantly, no spinner.
- [ ] Resize to 1024 and 480 px: the narrow layout works with no horizontal scroll.
- [ ] Sign in with a verified password account; confirm generic invalid-credential errors.
- [ ] Google opens the system browser; cancellation and same-email password linking work.
- [ ] Two desktop clients exchange messages; a reconnect retrieves history without duplicate sends.
- [ ] Restart restores the same account from the keychain; sign-out clears the account cache even offline.
- [ ] No credentials or provider configuration appear in the webview, cache or logs.

All 37 Rust tests then passed with `--features test-hooks` and `HANGCORD_KEY_STORAGE=file`, which bypasses the OS keychain only for the cache-key test path. This does not prove the stalled keychain migration path; live sign-in and session restoration were separately verified in the normal app without test hooks.
