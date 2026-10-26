// Desktop e2e (MASTER_PLAN §15): drives the BUILT app through tauri-driver + WebKitWebDriver (Linux;
// Windows uses msedgedriver; macOS has no WebDriver for Tauri — use the manual checklist).
// Proves native sign-in, HTTP and WebSocket through the built app, room/message creation,
// governor, single instance, restart from encrypted cache, and sign-out.
//
// Usage: xvfb-run -a dbus-run-session -- node tests/desktop/run.mjs <binary built with --features test-hooks>
// Needs: tauri-driver on PATH (cargo install tauri-driver --version 2.1.0 --locked), WebKitWebDriver,
// a display (xvfb-run) and a D-Bus session (single-instance uses it on Linux).
// Compile with HANGCORD_API_BASE_URL=http://127.0.0.1:39431 and
// HANGCORD_GATEWAY_BASE_URL=ws://127.0.0.1:39431. CI provides an unlocked Secret Service keyring.
// Test hooks force only the cache file key; session credentials still use the OS keychain.
import { spawn, spawnSync } from "node:child_process";
import { totalmem } from "node:os";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { startBackend } from "./backend.mjs";

const app = process.argv[2];
assert.ok(app && existsSync(app), "pass the built HangCord binary");
const dataHome = mkdtempSync(join(tmpdir(), "hc-desktop-"));
const env = { ...process.env, XDG_DATA_HOME: dataHome, HANGCORD_KEY_STORAGE: "file" };
const W = "http://127.0.0.1:4444";
const EL = "element-6066-11e4-a52f-4a5bc2a0c4b6";

const backend = await startBackend();
const driver = spawn("tauri-driver", [], { env, stdio: ["ignore", "inherit", "inherit"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Never hang: hard deadline for the whole run, and a timeout on every WebDriver call.
const deadline = setTimeout(() => {
  console.error("FAIL: desktop e2e exceeded 180 s");
  driver.kill("SIGKILL");
  process.exit(1);
}, 180_000);

async function wd(method, path, body) {
  const res = await fetch(W + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.value ?? json)}`);
  return json.value;
}

async function waitFor(label, fn, ms = 20_000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}${last ? `: ${last.message}` : ""}`);
}

async function session() {
  const started = Date.now();
  const s = await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": { application: app } } } });
  const id = s.sessionId;
  const js = (script, args = []) => wd("POST", `/session/${id}/execute/sync`, { script, args });
  /** Call a Rust command through the app's own IPC (the same path the UI uses). */
  const ipc = (cmd, args = {}) => wd("POST", `/session/${id}/execute/async`, {
    script: "const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then(done, (e) => done({ ipcError: e?.code ?? String(e) }));",
    args: [cmd, args],
  });
  // W3C key, with the legacy key as a fallback (WebKitWebDriver versions differ).
  const find = async (css) => { const v = await wd("POST", `/session/${id}/element`, { using: "css selector", value: css }); return v[EL] ?? v.ELEMENT ?? Object.values(v)[0]; };
  const click = async (css) => wd("POST", `/session/${id}/element/${await find(css)}/click`, {});
  const type = async (css, text) => wd("POST", `/session/${id}/element/${await find(css)}/value`, { text });
  await waitFor("sign-in or app shell", () => js("return !!document.querySelector('.signin, .app')"));
  const paintMs = Date.now() - started;
  return { id, js, ipc, find, click, type, paintMs, end: () => wd("DELETE", `/session/${id}`) };
}

const results = [];
const ok = (name, extra = "") => {
  results.push(name);
  console.warn(`  ✓ ${name}${extra ? ` (${extra})` : ""}`);
};

try {
  await waitFor("tauri-driver", () => fetch(W + "/status").then((r) => r.ok), 15_000);

  // ---- Run 1: first launch -------------------------------------------------------------
  const a = await session();
  assert.equal(await a.js("return !!document.querySelector('.signin')"), true);
  ok("first launch requires sign-in");
  const beforeAuth = await a.ipc("auth_status");
  assert.equal(beforeAuth.configured, true);
  assert.equal(beforeAuth.user, null);
  const refused = await a.ipc("api_request", { method: "GET", path: "/v1/hangouts" });
  assert.equal(refused.ipcError, "reauth_required");
  ok("native API rejects unauthenticated requests");
  await a.type('.signin input[type="email"]', "desktop@example.test");
  await a.type('.signin input[type="password"]', "fixture-password");
  await a.click('.signin button[type="submit"]');
  await waitFor("first hangout form", () => a.js("return !!document.querySelector('.empty-hangout input')"));
  assert.equal((await a.ipc("auth_status")).user.id, "desktop_test_user");
  assert.ok(backend.state.requests.some((r) => r.path === "/v1/auth/password"));
  ok("password sign-in uses native HTTP and stores the session in the keychain");
  await a.type('.empty-hangout input', "Desktop Hangout");
  await a.click('.empty-hangout button[type="submit"]');
  await waitFor("hangout shell", () => a.js("return !!document.querySelector('.app')"));
  assert.equal(await a.js("return document.querySelector('.app').dataset.platform"), "desktop");
  ok("launches as the desktop app", `first paint ${a.paintMs} ms incl. process start`);
  assert.ok(backend.state.requests.some((r) => r.path === "/v1/hangouts" && r.method === "POST"));
  assert.ok(backend.state.requests.some((r) => r.path === "/v1/hangouts" && r.authorization === "Bearer desktop-fixture-session-token-1234567890"));
  ok("creates a hangout through native authenticated HTTP");
  const info = await a.ipc("app_info");
  assert.equal(info.keyStorage, "file-fallback", "test build should use the forced file key");
  ok("cache key storage reported", info.keyStorage);
  const gov = await a.ipc("governor_status");
  const GIB = 1024 ** 3, MIB = 1024 ** 2;
  const t = gov.totalBytes;
  const profile = t <= 4 * GIB ? "lite" : t <= 8 * GIB ? "balanced" : t <= 16 * GIB ? "smooth" : t <= 32 * GIB ? "rich" : "max";
  const perProfile = { lite: 300, balanced: 500, smooth: 800, rich: 1200, max: 1700 }[profile] * MIB;
  const expected = Math.min(Math.max(Math.min(perProfile, Math.floor(gov.availableBytes / 4)), 250 * MIB), 1700 * MIB);
  assert.equal(gov.profile, profile, "profile must follow total RAM (MASTER_PLAN §11)");
  assert.ok(Math.abs(gov.budgetBytes - expected) <= 64 * MIB, `budget ${gov.budgetBytes} vs expected ~${expected}`);
  assert.ok(Math.abs(t - totalmem()) < 512 * MIB, "governor sees the machine's real RAM");
  assert.ok(gov.processCount >= 2, `process tree should include WebView helpers (got ${gov.processCount})`);
  ok("governor budget matches the RAM table", `${profile}, ${Math.round(gov.budgetBytes / MIB)} MB, ${gov.processCount} processes, ${gov.zone}`);
  const mem = await waitFor("memory readout", () => a.js("return document.querySelector('.mem')?.textContent ?? null"));
  assert.match(mem, /^Memory \d+ MB \/ \d+ MB · (lite|balanced|smooth|rich|max)$/);
  ok("governor reports live memory", mem);
  await a.click('button[role="switch"]');
  await waitFor("lite profile", () => a.js("return document.querySelector('.mem').textContent.endsWith('· lite')"));
  assert.equal(await a.js("return document.querySelector('button[role=switch]').getAttribute('aria-checked')"), "true");
  ok("Lightweight mode switches the governor to the Lite profile");
  await a.click('button[role="switch"]');
  await waitFor("gateway READY", () => a.js("return document.querySelector('.connection')?.textContent === 'Connected'"));
  assert.ok(backend.state.identifies.some((x) => x.roomId === "fixture_general"));
  ok("native WebSocket identifies and receives READY");
  await a.click('button[aria-label="Add a room or lounge to Hangout"]');
  await a.type('.dialog input[placeholder="new-room"]', "Desktop Room");
  await a.click('.dialog button[type="submit"]');
  await waitFor("new room heading", () => a.js("return [...document.querySelectorAll('h1')].some(h => h.textContent === 'desktop-room')"));
  assert.equal(await a.js("return [...document.querySelectorAll('.tag')].some(t => t.textContent === 'Own guidelines')"), false);
  ok("+ creates a room that follows category guidelines (no 'Own guidelines' tag)");
  await waitFor("new room connected", () => a.js("return document.querySelector('.connection')?.textContent === 'Connected'"));
  await a.type('#composer', "Desktop message from the native socket");
  await a.click('button[aria-label="Send"]');
  await waitFor("committed message", () => a.js("return [...document.querySelectorAll('.msg')].some(m => m.textContent.includes('Desktop message from the native socket') && !m.textContent.includes('Sending…'))"));
  assert.equal(backend.state.messages.at(-1)?.content, "Desktop message from the native socket");
  assert.ok(backend.state.identifies.some((x) => x.roomId === "fixture_desktop_room"));
  ok("message sends through native WebSocket and receives an acknowledgment");
  // Second launch while running must hand off to the existing window and exit (single instance).
  const second = spawnSync(app, [], { env, timeout: 15_000 });
  assert.equal(second.status, 0, `second launch should exit 0 (status ${second.status}, signal ${second.signal})`);
  assert.equal(await a.js("return document.querySelectorAll('.app').length"), 1);
  ok("a second launch focuses the running app instead of opening another");
  await a.click('button[role="switch"]');
  await waitFor("lite profile again", () => a.js("return document.querySelector('.mem').textContent.endsWith('· lite')"));
  await waitFor("room and Lightweight preference persisted before restart", async () => {
    const snapshot = JSON.parse(await a.ipc("cache_get", { key: "hangout:fixture_hangout" }) ?? "null");
    const prefs = JSON.parse(await a.ipc("cache_get", { key: "prefs" }) ?? "null");
    return snapshot?.rooms.some((room) => room.name === "desktop-room") && prefs?.values["performance.lightweight"]?.value === true;
  });
  backend.state.holdSnapshot = true;
  await a.end();

  // ---- Run 2: full restart --------------------------------------------------------------
  const b = await session();
  await waitFor("cached app shell with restored room", () => b.js("return document.querySelector('.app')?.dataset.source === 'cache' && [...document.querySelectorAll('.room span')].some(s => s.textContent === 'desktop-room')"));
  ok("restart paints from the encrypted local cache", `${b.paintMs} ms incl. process start`);
  ok("the room created before the restart is still there");
  await waitFor("lightweight restored", () => b.js("return document.querySelector('button[role=switch]')?.getAttribute('aria-checked') === 'true'"));
  ok("Lightweight mode is remembered across restarts");
  assert.equal((await b.ipc("auth_status")).user.id, "desktop_test_user");
  ok("native session survives restart in the OS keychain");
  backend.releaseSnapshots();
  await waitFor("network refresh after cache paint", () => b.js("return document.querySelector('.app')?.dataset.source === 'network'"));

  // Inspect the live cache before sign-out wipes it.
  const dir = join(dataHome, "app.hangcord.desktop");
  const files = readdirSync(dir);
  assert.ok(files.includes("cache.sqlite3"), `cache file missing in ${files}`);
  const raw = files.filter((f) => f.startsWith("cache.sqlite3")).map((f) => readFileSync(join(dir, f)).toString("latin1")).join("");
  for (const plain of ["desktop-room", "Desktop Hangout", "Desktop message from the native socket", "desktop-fixture-session-token"]) assert.ok(!raw.includes(plain), `plaintext "${plain}" on disk`);
  ok("cache on disk is encrypted (no plaintext names or session token)");
  const { statSync } = await import("node:fs");
  const mode = (p) => statSync(p).mode & 0o777;
  assert.equal(mode(dir), 0o700, "data folder must be owner-only");
  // WebKit keeps its own folders here too; the 0700 parent already shields them.
  const ours = files.filter((f) => f.startsWith("cache."));
  for (const f of ours) assert.equal(mode(join(dir, f)) & 0o077, 0, `${f} readable by others`);
  ok("data folder (0700) and HangCord's cache files are owner-only", ours.join(", "));

  await b.click('.beta button.btn--ghost');
  await waitFor("signed-out screen", () => b.js("return !!document.querySelector('.signin')"));
  await waitFor("native session cleared", async () => (await b.ipc("auth_status")).user === null);
  await waitFor("server logout request", () => backend.state.requests.some((r) => r.path === "/v1/auth/logout"));
  ok("sign-out revokes the session and clears native credentials");
  await b.end();

  console.warn(`\n${results.length} desktop checks passed`);
} catch (e) {
  console.error(`\nFAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  driver.kill();
  await backend.close();
}
