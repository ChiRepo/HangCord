// Every secret a Worker requires in code must be listed in .dev.vars.example (and so in the
// secrets register). Catches agents inventing secrets (docs/SECRETS_AND_SENSITIVE_DATA.md).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const listed = new Set(
  readFileSync(".dev.vars.example", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter(Boolean),
);
let bad = 0;
for (const w of readdirSync("workers")) {
  const p = join("workers", w, "src", "index.ts");
  if (!existsSync(p)) continue;
  const m = readFileSync(p, "utf8").match(/REQUIRED_SECRETS\s*=\s*\[([^\]]*)\]/);
  if (!m) continue;
  for (const name of [...m[1].matchAll(/"([A-Z0-9_]+)"/g)].map((x) => x[1])) {
    if (!listed.has(name)) {
      console.error(`workers/${w}: secret ${name} is not in .dev.vars.example / the secrets register`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.warn("secret names: all required secrets are registered");
