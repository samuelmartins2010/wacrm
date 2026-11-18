// Test-only in-memory stand-in for the supabase-js query builder used by
// the automations engine. Rows live in `tables`; filters, ordering,
// inserts, updates, upserts and deletes act on them, so a test can run a
// whole automation (wait → cron resume → branch) and inspect the result.
// Not imported by production code.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface MemDbOptions {
  /** table → column sets that must be unique among rows passing `where`. */
  unique?: Record<string, { cols: string[]; where?: Filter }[]>;
  /** rpc name → handler. */
  rpc?: Record<string, (args: Record<string, unknown>, db: MemDb) => unknown>;
}

export interface MemDb {
  tables: Record<string, Row[]>;
  from(table: string): unknown;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

let seq = 0;
export const newId = () => `id-${++seq}`;

export function memDb(seed: Record<string, Row[]> = {}, opts: MemDbOptions = {}): MemDb {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const rowsOf = (t: string) => (tables[t] ??= []);

  const violates = (table: string, candidate: Row, ignore?: Row) =>
    (opts.unique?.[table] ?? []).some(({ cols, where }) => {
      if (where && !where(candidate)) return false;
      return rowsOf(table).some(
        (r) => r !== ignore && (!where || where(r)) && cols.every((c) => r[c] === candidate[c]),
      );
    });
  const dupErr = { code: "23505", message: "duplicate key value violates unique constraint" };

  const db: MemDb = {
    tables,
    async rpc(name, args) {
      const fn = opts.rpc?.[name];
      if (!fn) return { data: null, error: null };
      return { data: await fn(args, db), error: null };
    },
    from(table: string) {
      let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
      let payload: Row | Row[] | null = null;
      let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
      let countMode = false;
      let headOnly = false;
      const filters: Filter[] = [];
      const orderBy: { col: string; asc: boolean }[] = [];
      let limitN: number | null = null;

      const matching = () => {
        let rows = rowsOf(table).filter((r) => filters.every((f) => f(r)));
        for (const o of [...orderBy].reverse()) {
          rows = [...rows].sort((a, b) => {
            const av = a[o.col] as string | number;
            const bv = b[o.col] as string | number;
            return (av < bv ? -1 : av > bv ? 1 : 0) * (o.asc ? 1 : -1);
          });
        }
        if (limitN !== null) rows = rows.slice(0, limitN);
        return rows;
      };

      const exec = (): { data: unknown; error: unknown; count?: number } => {
        if (op === "select") {
          const rows = matching();
          if (countMode) return { data: headOnly ? null : rows, error: null, count: rows.length };
          return { data: rows, error: null };
        }
        if (op === "insert") {
          const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
          const out: Row[] = [];
          for (const p of list) {
            const row = { id: newId(), created_at: new Date().toISOString(), ...p };
            if (violates(table, row)) return { data: null, error: dupErr };
            rowsOf(table).push(row);
            out.push(row);
          }
          return { data: out, error: null };
        }
        if (op === "upsert") {
          const p = payload as Row;
          const cols = (upsertOpts.onConflict ?? "id").split(",");
          const existing = rowsOf(table).find((r) => cols.every((c) => r[c] === p[c]));
          if (existing) {
            if (!upsertOpts.ignoreDuplicates) Object.assign(existing, p);
            return { data: upsertOpts.ignoreDuplicates ? [] : [existing], error: null };
          }
          const row = { id: newId(), created_at: new Date().toISOString(), ...p };
          rowsOf(table).push(row);
          return { data: [row], error: null };
        }
        if (op === "update") {
          const rows = matching();
          for (const r of rows) {
            const next = { ...r, ...(payload as Row) };
            if (violates(table, next, r)) return { data: null, error: dupErr };
          }
          for (const r of rows) Object.assign(r, payload as Row);
          return { data: rows, error: null };
        }
        // delete
        const rows = matching();
        tables[table] = rowsOf(table).filter((r) => !rows.includes(r));
        return { data: rows, error: null };
      };

      const one = (r: { data: unknown; error: unknown }, strict: boolean) => {
        if (r.error) return r;
        const list = (Array.isArray(r.data) ? r.data : r.data == null ? [] : [r.data]) as Row[];
        if (strict && list.length !== 1) {
          return { data: null, error: { code: "PGRST116", message: "expected one row" } };
        }
        return { data: list[0] ?? null, error: null };
      };

      const b: Record<string, unknown> = {
        select: (_cols?: string, o?: { count?: string; head?: boolean }) => {
          if (o?.count) countMode = true;
          if (o?.head) headOnly = true;
          return b;
        },
        insert: (p: Row | Row[]) => ((op = "insert"), (payload = p), b),
        update: (p: Row) => ((op = "update"), (payload = p), b),
        delete: () => ((op = "delete"), b),
        upsert: (p: Row, o?: typeof upsertOpts) => ((op = "upsert"), (payload = p), (upsertOpts = o ?? {}), b),
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
        neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b),
        is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), b),
        in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b),
        gte: (k: string, v: number | string) => (filters.push((r) => (r[k] as number | string) >= v), b),
        gt: (k: string, v: number | string) => (filters.push((r) => (r[k] as number | string) > v), b),
        lte: (k: string, v: number | string) => (filters.push((r) => (r[k] as number | string) <= v), b),
        lt: (k: string, v: number | string) => (filters.push((r) => (r[k] as number | string) < v), b),
        order: (col: string, o?: { ascending?: boolean }) => (orderBy.push({ col, asc: o?.ascending !== false }), b),
        limit: (n: number) => ((limitN = n), b),
        single: () => Promise.resolve(one(exec(), true)),
        maybeSingle: () => Promise.resolve(one(exec(), false)),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
      };
      return b;
    },
  };
  return db;
}
