# HangCord desktop app (checkpoint 1.1)

The real application: a Tauri 2 app for **Windows, macOS and Linux**. Its screens live in `ui/` (React + Vite, built into the app by Tauri; the browser companion is on the `WebApp` branch); the Rust core (`src-tauri/`) owns storage, memory policy and, in later phases, media, crypto and networking (MASTER_PLAN §4).

## What's in the Rust core
| Module | Does | Plan |
|---|---|---|
| `governor.rs` | Memory budget from the machine's RAM (300 MB → 1.7 GB hard cap), `min(profile, 25% of available, 1.7 GB)`, floor 250 MB; samples the whole process tree (core + WebView helpers) every 5 s; Green / Yellow / Red; Lightweight mode forces Lite | §11 |
| `cache.rs` | Encrypted local SQLite cache behind `packages/cache` (preferences + hangout snapshots). AES-256-GCM per value, fresh nonce per write, key name bound as AAD; tampered or wrong-key rows are dropped and re-fetched; strict key format and 2 MB value cap | §7.1 |
| `device_key.rs` | Per-device cache key in the OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service). Falls back to a 0600 key file only when no keychain exists — acceptable because the cache never holds secrets | §7.1 |
| `lib.rs` | Typed IPC commands (only these 8 exist, each granted explicitly in `capabilities/default.json`), single instance, remembered window size/position, strict CSP, governor event `governor://status` | §4, §12 |

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

## Desktop end-to-end test
Build with the test hooks first (`npx tauri build --no-bundle --features test-hooks --ci` from the repo root — this build may force the file key and must never be shipped), then `xvfb-run -a dbus-run-session -- node tests/desktop/run.mjs apps/desktop/src-tauri/target/release/hangcord-desktop`. Needs `cargo install tauri-driver --version 2.1.0 --locked` and `WebKitWebDriver` (`apt install webkit2gtk-driver`). It launches the real app, checks the live memory readout, adds a room with **+**, restarts the app, and confirms the room came back from the encrypted cache with no plaintext on disk. macOS has no WebDriver for Tauri — use the manual checklist below.

## Manual checklist (every checkpoint, each OS)
- [ ] App opens; a second launch focuses the existing window instead of opening another.
- [ ] Window size/position are remembered after quitting.
- [ ] Top bar shows "Memory … / … · profile"; Lightweight mode drops the budget to Lite.
- [ ] Add a room with **+**, quit, reopen: it's there instantly, no spinner.
- [ ] Resize down to 360 px wide: the phone layout appears, nothing scrolls sideways.
