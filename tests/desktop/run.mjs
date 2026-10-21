// Desktop e2e (MASTER_PLAN §15): drives the BUILT app through tauri-driver + WebKitWebDriver (Linux;
// Windows uses msedgedriver; macOS has no WebDriver for Tauri — use the manual checklist).
// Proves: the app launches, paints, shows the live memory governor, + creates a room, and after a
// full restart that room comes back from the encrypted SQLite cache (not in plaintext on disk).
//
// Usage: xvfb-run -a dbus-run-session -- node tests/desktop/run.mjs <binary built with --features test-hooks>
// Needs: tauri-driver on PATH (cargo install tauri-driver --version 2.1.0 --locked), WebKitWebDriver,
// a display (xvfb-run) and a D-Bus session (single-instance uses it on Linux).
// The test-hooks build lets HANGCORD_KEY_STORAGE=file force the file key (no keyring daemon here);
// release installers ignore that variable. The OS-keychain path is covered by the manual checklist.
import { spawn, spawnSync } from "node:child_process";
import { totalmem } from "node:os";
import { mkdtempSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const app = process.argv[2];
assert.ok(app && existsSync(app), "pass the built HangCord binary");
const dataHome = mkdtempSync(join(tmpdir(), "hc-desktop-"));
const env = { ...process.env, XDG_DATA_HOME: dataHome, HANGCORD_KEY_STORAGE: "file" };
const W = "http://127.0.0.1:4444";
const EL = "element-6066-11e4-a52f-4a5bc2a0c4b6";

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
  const ipc = (cmd) => wd("POST", `/session/${id}/execute/async`, {
    script: "const done = arguments[arguments.length - 1]; window.__TAURI_INTERNALS__.invoke(arguments[0]).then(done, (e) => done({ ipcError: String(e) }));",
    args: [cmd],
  });
  // W3C key, with the legacy key as a fallback (WebKitWebDriver versions differ).
  const find = async (css) => { const v = await wd("POST", `/session/${id}/element`, { using: "css selector", value: css }); return v[EL] ?? v.ELEMENT ?? Object.values(v)[0]; };
  const click = async (css) => wd("POST", `/session/${id}/element/${await find(css)}/click`, {});
  const type = async (css, text) => wd("POST", `/session/${id}/element/${await find(css)}/value`, { text });
  await waitFor("app shell", () => js("return document.querySelector('.app')?.dataset.source ?? null"));
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
  assert.equal(await a.js("return document.querySelector('.app').dataset.platform"), "desktop");
  ok("launches as the desktop app", `first paint ${a.paintMs} ms incl. process start`);
  assert.equal(await a.js("return document.querySelector('.app').dataset.source"), "seed");
  ok("first launch seeds the local cache");
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
  await a.click('button[aria-label="Add a room or lounge to Study"]');
  await a.type('.dialog input[placeholder="new-room"]', "Desktop Room");
  await a.click('.dialog button[type="submit"]');
  await waitFor("new room heading", () => a.js("return [...document.querySelectorAll('h1')].some(h => h.textContent === 'desktop-room')"));
  assert.equal(await a.js("return [...document.querySelectorAll('.tag')].some(t => t.textContent === 'Own guidelines')"), false);
  ok("+ creates a room that follows Study guidelines (no 'Own guidelines' tag)");
  // Second launch while running must hand off to the existing window and exit (single instance).
  const second = spawnSync(app, [], { env, timeout: 15_000 });
  assert.equal(second.status, 0, `second launch should exit 0 (status ${second.status}, signal ${second.signal})`);
  assert.equal(await a.js("return document.querySelectorAll('.app').length"), 1);
  ok("a second launch focuses the running app instead of opening another");
  await a.click('button[role="switch"]');
  await waitFor("lite profile again", () => a.js("return document.querySelector('.mem').textContent.endsWith('· lite')"));
  await sleep(300);
  await a.end();

  // ---- Run 2: full restart --------------------------------------------------------------
  const b = await session();
  assert.equal(await b.js("return document.querySelector('.app').dataset.source"), "cache");
  ok("restart paints from the encrypted local cache", `${b.paintMs} ms incl. process start`);
  assert.equal(await b.js("return [...document.querySelectorAll('.room span')].some(s => s.textContent === 'desktop-room')"), true);
  ok("the room created before the restart is still there");
  await waitFor("lightweight restored", () => b.js("return document.querySelector('button[role=switch]')?.getAttribute('aria-checked') === 'true'"));
  ok("Lightweight mode is remembered across restarts");
  await b.end();

  // ---- On disk ---------------------------------------------------------------------------
  const dir = join(dataHome, "app.hangcord.desktop");
  const files = readdirSync(dir);
  assert.ok(files.includes("cache.sqlite3"), `cache file missing in ${files}`);
  const raw = files.filter((f) => f.startsWith("cache.sqlite3")).map((f) => readFileSync(join(dir, f)).toString("latin1")).join("");
  for (const plain of ["desktop-room", "Night Owls", "late-night-study"]) assert.ok(!raw.includes(plain), `plaintext "${plain}" on disk`);
  ok("cache on disk is encrypted (no plaintext names)");
  const { statSync } = await import("node:fs");
  const mode = (p) => statSync(p).mode & 0o777;
  assert.equal(mode(dir), 0o700, "data folder must be owner-only");
  // WebKit keeps its own folders here too; the 0700 parent already shields them.
  const ours = files.filter((f) => f.startsWith("cache."));
  for (const f of ours) assert.equal(mode(join(dir, f)) & 0o077, 0, `${f} readable by others`);
  ok("data folder (0700) and HangCord's cache files are owner-only", ours.join(", "));

  console.warn(`\n${results.length} desktop checks passed`);
} catch (e) {
  console.error(`\nFAIL: ${e.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  driver.kill();
}
