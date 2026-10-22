// StorageRouter v0 inside the API (MASTER_PLAN §8.2, §8.5): every write to D1 goes through `write()`,
// which puts the journal row and the data change in ONE D1 batch (atomic). If the batch fails, neither
// happened. The storage-router Worker seals `journal` rows into encrypted CSV chunks (cp-002.x).
// Access data lives only in D1 and fails closed (ACCESS_AND_SETTINGS §13).

export type Op = "insert" | "update" | "delete";

export interface Change {
  table: string;
  op: Op;
  /** Primary key columns. */
  pk: Record<string, unknown>;
  /** Full new row for insert/update (journal copy); ignored for delete. */
  cols?: Record<string, unknown>;
  /** The SQL that applies the change. */
  sql: string;
  args: unknown[];
}

export async function write(db: D1Database, changes: Change[], now = Date.now()): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const c of changes) {
    stmts.push(
      db.prepare("INSERT INTO journal (at, db, tbl, op, pk, cols) VALUES (?, 'd1', ?, ?, ?, ?)")
        .bind(now, c.table, c.op, JSON.stringify(c.pk), JSON.stringify(c.cols ?? {})),
    );
    stmts.push(db.prepare(c.sql).bind(...c.args));
  }
  await db.batch(stmts);
}

/** INSERT helper that keeps the journal copy and the SQL in sync. */
export function insert(table: string, pkCols: string[], row: Record<string, unknown>, { upsert = false } = {}): Change {
  const cols = Object.keys(row);
  const sql = `INSERT ${upsert ? "OR REPLACE " : ""}INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  return { table, op: upsert ? "update" : "insert", pk: pick(row, pkCols), cols: row, sql, args: cols.map((c) => row[c] ?? null) };
}

export function update(table: string, pk: Record<string, unknown>, set: Record<string, unknown>, extraWhere?: { sql: string; args: unknown[] }): Change {
  const sets = Object.keys(set);
  const where = Object.keys(pk).map((k) => `${k} = ?`).join(" AND ") + (extraWhere ? ` AND ${extraWhere.sql}` : "");
  return {
    table, op: "update", pk, cols: set,
    sql: `UPDATE ${table} SET ${sets.map((k) => `${k} = ?`).join(", ")} WHERE ${where}`,
    args: [...sets.map((k) => set[k] ?? null), ...Object.values(pk), ...(extraWhere?.args ?? [])],
  };
}

const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));
