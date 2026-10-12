import "server-only";

// One tiny query interface over two drivers:
// - Neon (serverless Postgres over HTTP) in production, via DATABASE_URL
// - PGlite (Postgres compiled to WebAssembly, in memory) for local dev and tests

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const MIGRATIONS = [
  `create table if not exists households (
     id text primary key,
     name text not null,
     invite_code text unique not null,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists users (
     id text primary key,
     username text unique not null,
     display_name text not null,
     password_hash text not null,
     household_id text not null references households(id),
     failed_logins int not null default 0,
     locked_until timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists sessions (
     token_hash text primary key,
     user_id text not null references users(id) on delete cascade,
     expires_at timestamptz not null,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists items (
     household_id text not null references households(id) on delete cascade,
     kind text not null,
     key text not null,
     data jsonb,
     deleted boolean not null default false,
     updated_at bigint not null,
     updated_by text,
     primary key (household_id, kind, key)
   )`,
  `create index if not exists sessions_user on sessions(user_id)`,
];

const g = globalThis as unknown as { __adukalaDb?: Promise<Db> };

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    return { query: async (text, params = []) => (await sql.query(text, params)) as never };
  }
  // Never fall back to a throwaway in-memory database on the live site.
  if (process.env.VERCEL && !process.env.ALLOW_PGLITE) throw new Error("NO_DATABASE");
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(process.env.PGLITE_DIR || undefined);
  return { query: async (text, params = []) => (await pg.query(text, params)).rows as never };
}

export function getDb(): Promise<Db> {
  g.__adukalaDb ??= (async () => {
    const db = await connect();
    for (const m of MIGRATIONS) await db.query(m);
    return db;
  })().catch((e) => {
    g.__adukalaDb = undefined;
    throw e;
  });
  return g.__adukalaDb;
}

/** Tests only: start from an empty database. */
export async function resetDbForTests() {
  const db = await getDb();
  for (const t of ["items", "sessions", "users", "households"]) await db.query(`delete from ${t}`);
}
