// Repo-wide rules from AGENTS.md and docs/, enforced as tests so no agent can quietly break them.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "smol-toml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Secret names from .dev.vars.example (names only — values are never in the repo). */
const secretNames = read(".dev.vars.example")
  .split("\n")
  .map((l) => l.match(/^([A-Z0-9_]+)=\s*$/)?.[1])
  .filter((x): x is string => Boolean(x));

/** Every file in the repo except dependencies, build output and the two private folders. */
function walk(dir = root, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "target", ".git", "gen", "test-results", "playwright-report"].includes(name)) continue;
    if (name.startsWith("Private files") || name.startsWith("private and only")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p.slice(root.length + 1));
  }
  return out;
}
const files = walk();
const under = (prefix: string, ext: RegExp) => files.filter((f) => f.startsWith(prefix) && ext.test(f));
/** Strip line and block comments so policy checks only see code and UI text. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const workers = readdirSync(join(root, "workers")).filter((w) => existsSync(join(root, "workers", w, "wrangler.toml")));
const configs = workers.map((w) => ({ w, cfg: parse(read(`workers/${w}/wrangler.toml`)) as Record<string, unknown> }));

describe("secrets never live in config", () => {
  it("knows the secret names", () => expect(secretNames.length).toBeGreaterThan(20));
  for (const { w, cfg } of configs) {
    it(`workers/${w}: no secret name in [vars]`, () => {
      const vars = Object.keys((cfg.vars as Record<string, unknown>) ?? {});
      expect(vars.filter((v) => secretNames.includes(v))).toEqual([]);
    });
  }
  it("no .dev.vars*, .env* or key file anywhere in the tree", () => {
    const bad = files.filter((f) => /(^|\/)(\.dev\.vars(\..+)?|\.env(\..+)?|.*\.pem|.*\.key|service-account.*\.json)$/.test(f) && !f.endsWith(".dev.vars.example"));
    expect(bad).toEqual([]);
  });
  it(".gitignore ignores every .dev.vars variant", () => {
    expect(read(".gitignore")).toMatch(/^\.dev\.vars\*$/m);
  });
});

describe("Cloudflare free-plan budgets", () => {
  it("uses at most 5 Cron Triggers across the whole account", () => {
    // https://developers.cloudflare.com/workers/platform/limits/ — 5 per account on Workers Free
    const total = configs.reduce((n, { cfg }) => n + (((cfg.triggers as { crons?: string[] })?.crons ?? []).length), 0);
    expect(total).toBeLessThanOrEqual(5);
  });
  it("emergency-restore has no public route", () => {
    const cfg = configs.find((c) => c.w === "emergency-restore")!.cfg;
    expect(cfg.workers_dev).toBe(false);
    expect(cfg.preview_urls).toBe(false);
    expect(cfg.route ?? cfg.routes).toBeUndefined();
  });
});

describe("private folders stay private", () => {
  const ignoreFiles = [".gitignore", ".cursorignore", ".aiexclude", ".geminiignore", ".codeiumignore", ".aiderignore", ".copilotignore"];
  for (const f of ignoreFiles) {
    it(`${f} lists the private files folder`, () => {
      expect(read(f)).toContain("Private files (.md files store here)/");
    });
  }
  it(".gitignore also lists the rules folder", () => {
    expect(read(".gitignore")).toContain("private and only to be accessed once which is before starting work on a project");
  });
});

describe("Graphify code map (graphify/README.md)", () => {
  it(".graphifyignore lists both private folders and the secret files", () => {
    const ig = read(".graphifyignore").split("\n");
    for (const line of ["Private files (.md files store here)/", "private and only to be accessed once*/", ".dev.vars", ".env", ".env.*"]) {
      expect(ig).toContain(line);
    }
  });
  it("the code-map MCP server is local only (stdio, reads graphify/graph/graph.json, no keys)", () => {
    const cfg = JSON.parse(read(".mcp.json")) as { mcpServers: Record<string, { type?: string; command?: string; args?: string[]; url?: string; env?: unknown }> };
    const map = cfg.mcpServers["hangcord-code-map"];
    expect(map).toBeDefined();
    expect(map?.type ?? "stdio").toBe("stdio");
    expect(map?.command).toBe("graphify-mcp");
    expect(map?.args).toEqual(["graphify/graph/graph.json"]);
    expect(map?.url).toBeUndefined();
    expect(map?.env).toBeUndefined();
  });
  it("Graphify is pinned to one version", () => expect(read("graphify/requirements.txt")).toMatch(/^graphifyy==\d+\.\d+\.\d+$/m));
  it("the committed graph never points at a private or secret file", () => {
    if (!existsSync(join(root, "graphify/graph/graph.json"))) return;
    const sources = [...read("graphify/graph/graph.json").matchAll(/"source_file":\s*"([^"]*)"/g)].map((m) => m[1] ?? "");
    const bad = sources.filter((s) => !s.endsWith(".example") && /^(Private files|private and only)|(^|\/)(\.dev\.vars|\.env)(\..+)?$|\.(pem|key)$/.test(s));
    expect(bad).toEqual([]);
  });
});

describe("mobile gate basics (MASTER_PLAN §15.1)", () => {
  it("web shell has a mobile viewport with safe-area support and no zoom lock", () => {
    const html = read("apps/web/index.html");
    const vp = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? "";
    expect(vp).toContain("width=device-width");
    expect(vp).toContain("viewport-fit=cover");
    expect(vp).not.toMatch(/user-scalable=no|maximum-scale=1/);
  });
  it("no CSS anywhere uses vh (phones need dvh)", () => {
    const offenders = [...under("apps/", /\.(css|tsx)$/), ...under("packages/", /\.(css|tsx)$/)].filter((f) => /\d+vh\b/.test(code(read(f))));
    expect(offenders).toEqual([]);
  });
  it("web shell uses safe-area insets", () => expect(read("apps/web/src/app.css")).toContain("safe-area-inset-bottom"));
});

describe("design system (DESIGN_SYSTEM.md)", () => {
  it("no raw colours outside the token files", () => {
    const src = [...under("apps/web/src", /\.(css|tsx|ts)$/), ...under("packages/ui/src", /\.(css|tsx|ts)$/)].filter((f) => !/tokens\.(css|ts)$/.test(f));
    const offenders = src.filter((f) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(code(read(f))));
    expect(offenders).toEqual([]);
  });
  it("no Discord words in UI text (use Hangout / Room / Lounge — MASTER_PLAN §2.2)", () => {
    const offenders = under("apps/web/src", /\.tsx$/).flatMap((f) =>
      [...code(read(f)).matchAll(/\b(servers?|channels?|nitro|discord)\b/gi)].map((m) => `${f}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });
});
