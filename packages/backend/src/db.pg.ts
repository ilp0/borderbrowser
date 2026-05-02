/**
 * Vanilla-Postgres adapter for self-hosted Node deployments.
 *
 * Exposes the same tagged-template `Db` shape that `db.ts` uses, but backed by
 * `pg` (a normal Postgres client) instead of Neon's HTTP driver. This lets the
 * Docker compose stack run against a local `postgres:16` container.
 *
 * Only the tagged-template call path is implemented — the codebase doesn't use
 * `sql.transaction(...)` or the string-based call form. If those are added
 * later, extend this shim.
 */

import pg from "pg";
import type { Db } from "./db.ts";

// One process, one pool. `db()` is called with the same DATABASE_URL on every
// request — the routes receive it via c.env.DATABASE_URL, which is constant
// for the lifetime of the process.
let pool: pg.Pool | null = null;

function getPool(connectionString: string): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString, max: 10 });
  return pool;
}

/**
 * Convert a Neon-style tagged-template call into a parameterized pg query.
 * Neon embeds raw values in the template; pg uses `$1, $2, …` placeholders.
 */
export function pgFactory(connectionString: string): Db {
  const p = getPool(connectionString);
  const fn = (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === "string") {
      // Plain-string call form: `sql("SELECT 1", [params])`. Not used today,
      // but supported so a future caller doesn't silently break.
      const params = (values[0] as unknown[] | undefined) ?? [];
      return p.query(strings, params).then((r) => r.rows);
    }
    let text = "";
    for (let i = 0; i < strings.length; i++) {
      text += strings[i];
      if (i < values.length) text += `$${i + 1}`;
    }
    return p.query(text, values).then((r) => r.rows);
  };
  // The Neon `Db` type has extra members (`transaction`, etc.) we don't
  // implement. Cast through `unknown` — the routes only ever use the
  // tagged-template path.
  return fn as unknown as Db;
}
