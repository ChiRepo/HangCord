// Mobile gate (MASTER_PLAN §15.1): the web shell's initial JS must be ≤ 200 KB gzipped.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = 200 * 1024;
const dir = "apps/web/dist/assets";
let total = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".js")) continue;
  const p = join(dir, f);
  if (!statSync(p).isFile()) continue;
  const gz = gzipSync(readFileSync(p)).length;
  total += gz;
  console.warn(`${f}: ${(gz / 1024).toFixed(1)} KB gzipped`);
}
console.warn(`total initial JS: ${(total / 1024).toFixed(1)} KB gzipped (budget ${BUDGET / 1024} KB)`);
if (total > BUDGET) {
  console.error("FAIL: over the mobile JS budget");
  process.exit(1);
}
