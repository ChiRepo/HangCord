import type { PatchOp } from "@hangcord/protocol";

const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

/** Apply patch ops immutably. Throws on unsafe or impossible paths so the caller re-fetches. */
export function applyPatch<T>(doc: T, ops: readonly PatchOp[]): T {
  let out: unknown = doc;
  for (const op of ops) out = applyOne(out, op);
  return out as T;
}

function applyOne(node: unknown, op: PatchOp): unknown {
  for (const seg of op.path) if (typeof seg === "string" && FORBIDDEN.has(seg)) throw new PatchError("unsafe_path");
  return walk(node, op, 0);
}

function walk(node: unknown, op: PatchOp, depth: number): unknown {
  const key = op.path[depth]!;
  const last = depth === op.path.length - 1;
  if (Array.isArray(node)) {
    if (typeof key !== "number") throw new PatchError("bad_path");
    const copy = node.slice();
    if (last) {
      if (op.op === "remove") {
        if (key >= copy.length) throw new PatchError("bad_path");
        copy.splice(key, 1);
      } else {
        if (key > copy.length) throw new PatchError("bad_path");
        copy[key] = op.value;
      }
      return copy;
    }
    if (key >= copy.length) throw new PatchError("bad_path");
    copy[key] = walk(copy[key], op, depth + 1);
    return copy;
  }
  if (node === null || typeof node !== "object") throw new PatchError("bad_path");
  const obj = node as Record<string, unknown>;
  const k = String(key);
  const copy: Record<string, unknown> = { ...obj };
  if (last) {
    if (op.op === "remove") delete copy[k];
    else copy[k] = op.value;
    return copy;
  }
  if (!(k in obj)) throw new PatchError("bad_path");
  copy[k] = walk(obj[k], op, depth + 1);
  return copy;
}

export class PatchError extends Error {
  constructor(readonly code: "bad_path" | "unsafe_path") {
    super(code);
  }
}
