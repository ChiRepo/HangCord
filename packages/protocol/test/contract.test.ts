// Anti-hallucination check (AGENTS.md §4): every endpoint named in the plan docs must exist in
// openapi.yaml, the spec must be valid OpenAPI, and the zod mirrors must match the detailed schemas.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";
import SwaggerParser from "@apidevtools/swagger-parser";
import { DETAILED_SCHEMAS } from "../src/schemas";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../openapi.yaml");
const docsDir = resolve(here, "../../../docs");
const spec = parse(readFileSync(specPath, "utf8")) as {
  paths: Record<string, Record<string, { operationId?: string }>>;
  components: { schemas: Record<string, unknown> };
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Pull every `METHOD /path` pair out of a markdown section's tables. */
function endpointsIn(markdown: string, startHeading: string, endHeading: RegExp): Array<[string, string]> {
  const start = markdown.indexOf(startHeading);
  expect(start, `heading ${startHeading} not found`).toBeGreaterThan(-1);
  const rest = markdown.slice(start + startHeading.length);
  const end = rest.search(endHeading);
  const section = end === -1 ? rest : rest.slice(0, end);
  const out: Array<[string, string]> = [];
  for (const m of section.matchAll(/`((?:GET|POST|PUT|PATCH|DELETE)(?:\/(?:GET|POST|PUT|PATCH|DELETE))*) (\/[^`\s?]+)/g)) {
    const path = m[2]!.replace(/:([A-Za-z]+)/g, "{$1}");
    for (const method of m[1]!.split("/")) out.push([method.toLowerCase(), path]);
  }
  return out;
}

/** Compare paths ignoring parameter names: /rooms/{id} == /rooms/{roomId}. */
const shape = (p: string) => p.replace(/\{[^}]+\}/g, "{}");
const specShapes = new Map(Object.entries(spec.paths).map(([p, ops]) => [shape(p), ops]));

describe("openapi.yaml", () => {
  it("is valid OpenAPI 3.1", async () => {
    await expect(SwaggerParser.validate(specPath)).resolves.toBeTruthy();
  });

  it("has unique operationIds and a phase on every operation", () => {
    const ids = new Set<string>();
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const m of METHODS) {
        const op = ops[m] as ({ operationId?: string; "x-hangcord-phase"?: number } | undefined);
        if (!op) continue;
        expect(op.operationId, `${m} ${path}`).toBeTruthy();
        expect(ids.has(op.operationId!), `duplicate ${op.operationId}`).toBe(false);
        ids.add(op.operationId!);
        expect(typeof op["x-hangcord-phase"], `${m} ${path} phase`).toBe("number");
      }
    }
  });

  it("defines every detailed schema mirrored in zod", () => {
    for (const name of DETAILED_SCHEMAS) expect(spec.components.schemas[name], name).toBeDefined();
  });

  const docs: Array<[string, string, RegExp]> = [
    ["MASTER_PLAN.md", "## 6. API and realtime contract", /\n\*\*Gateway \(WSS\)\*\*/],
    ["ACCESS_AND_SETTINGS.md", "## 14. API additions", /\nGateway events:/],
  ];
  for (const [file, heading, end] of docs) {
    it(`contains every endpoint listed in docs/${file}`, () => {
      const p = resolve(docsDir, file);
      if (!existsSync(p)) throw new Error(`docs/${file} missing — run tests from the full repo`);
      const listed = endpointsIn(readFileSync(p, "utf8"), heading, end);
      expect(listed.length).toBeGreaterThan(10);
      const missing = listed.filter(([m, path]) => !specShapes.get(shape(path))?.[m]);
      expect(missing, `missing in openapi.yaml: ${missing.map((x) => x.join(" ")).join(", ")}`).toEqual([]);
    });
  }
});
