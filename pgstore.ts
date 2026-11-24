// Armazenamento em Postgres (Supabase / Neon / Vercel Postgres), usado quando não há Redis.
// Conexão só no servidor, pela URL Postgres (nunca pela chave pública "anon").
// As tabelas ficam num schema próprio (invest_moment), fora da API pública do Supabase,
// e com RLS ligado: as chaves públicas não conseguem ler nada do painel.
import type { Sql } from "postgres";

export function findPgUrl(): string | null {
  const e = process.env;
  for (const k of ["POSTGRES_URL", "DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL_NON_POOLING", "SUPABASE_DB_URL"]) {
    if (e[k] && /^postgres(ql)?:\/\//.test(e[k]!)) return e[k]!;
  }
  for (const k of Object.keys(e)) if (k.endsWith("_POSTGRES_URL") && /^postgres(ql)?:\/\//.test(e[k] ?? "")) return e[k]!;
  return null;
}

let sqlP: Promise<Sql | null> | null = null;

const DDL = [
  `CREATE SCHEMA IF NOT EXISTS invest_moment`,
  `CREATE TABLE IF NOT EXISTS invest_moment.im_daily (day text NOT NULL, field text NOT NULL, n bigint NOT NULL DEFAULT 0, PRIMARY KEY (day, field))`,
  `CREATE TABLE IF NOT EXISTS invest_moment.im_visitors (day text NOT NULL, h text NOT NULL, PRIMARY KEY (day, h))`,
  `CREATE TABLE IF NOT EXISTS invest_moment.im_events (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invest_moment.im_subs (email text PRIMARY KEY, data jsonb NOT NULL)`,
  `ALTER TABLE invest_moment.im_daily ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE invest_moment.im_visitors ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE invest_moment.im_events ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE invest_moment.im_subs ENABLE ROW LEVEL SECURITY`,
];

async function connect(): Promise<Sql | null> {
  const raw = findPgUrl();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname) || u.searchParams.get("sslmode") === "disable";
    u.search = ""; // remove parâmetros extras (ex.: supa=, pgbouncer=) que o servidor recusaria
    const { default: postgres } = await import("postgres");
    const sql = postgres(u.toString(), {
      ssl: local ? false : "require",
      prepare: false, // compatível com o pooler do Supabase (modo transação)
      max: 2,
      idle_timeout: 20,
      connect_timeout: 5,
      onnotice: () => {},
      connection: { application_name: "invest-moment" },
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        for (const q of DDL) await sql.unsafe(q);
        break;
      } catch (err) {
        // duas instâncias criando ao mesmo tempo: tenta de novo uma vez
        if (attempt === 1) throw err;
      }
    }
    return sql;
  } catch (err) {
    console.error("postgres:", (err as Error).message);
    sqlP = null;
    return null;
  }
}

function db(): Promise<Sql | null> {
  if (!sqlP) sqlP = connect();
  return sqlP;
}

// Nunca deixa o banco travar o site: sem resposta em 4 s, segue sem ele.
export async function pg<T>(fn: (sql: Sql) => Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), 4000)));
  const run = (async () => {
    const sql = await db();
    if (!sql) return null;
    try {
      return await fn(sql);
    } catch (err) {
      console.error("postgres:", (err as Error).message);
      return null;
    }
  })();
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function pgIncr(day: string, fields: [string, number][]) {
  return pg(async (sql) => {
    const rows = fields.map(([field, n]) => ({ day, field: field.slice(0, 120), n }));
    await sql`INSERT INTO invest_moment.im_daily ${sql(rows, "day", "field", "n")}
      ON CONFLICT (day, field) DO UPDATE SET n = invest_moment.im_daily.n + EXCLUDED.n`;
    return true;
  });
}

export function pgVisitor(day: string, h: string) {
  return pg(async (sql) => {
    await sql`INSERT INTO invest_moment.im_visitors (day, h) VALUES (${day}, ${h}) ON CONFLICT DO NOTHING`;
    return true;
  });
}

export function pgEvent(data: Record<string, unknown>) {
  return pg(async (sql) => {
    await sql`INSERT INTO invest_moment.im_events (data) VALUES (${sql.json(data as never)})`;
    if (Math.random() < 0.05) {
      await sql`DELETE FROM invest_moment.im_events WHERE at < now() - interval '90 days'`;
      await sql`DELETE FROM invest_moment.im_visitors WHERE day < to_char(now() - interval '90 days', 'YYYY-MM-DD')`;
    }
    return true;
  });
}

export function pgRecentEvents(n: number) {
  return pg(async (sql) => {
    const rows = await sql<{ data: unknown }[]>`SELECT data FROM invest_moment.im_events ORDER BY id DESC LIMIT ${n}`;
    return rows.map((r) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
  });
}

export function pgDays(days: string[]) {
  return pg(async (sql) => {
    const d = await sql<{ day: string; field: string; n: string }[]>`
      SELECT day, field, n FROM invest_moment.im_daily WHERE day = ANY(${days})`;
    const v = await sql<{ day: string; c: string }[]>`
      SELECT day, count(*) AS c FROM invest_moment.im_visitors WHERE day = ANY(${days}) GROUP BY day`;
    return { daily: d.map((r) => ({ day: r.day, field: r.field, n: Number(r.n) })), visitors: v.map((r) => ({ day: r.day, c: Number(r.c) })) };
  });
}

export function pgSubPut(email: string, data: Record<string, unknown>) {
  return pg(async (sql) => {
    await sql`INSERT INTO invest_moment.im_subs (email, data) VALUES (${email}, ${sql.json(data as never)})
      ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data`;
    return true;
  });
}

export function pgSubDel(email: string) {
  return pg(async (sql) => {
    await sql`DELETE FROM invest_moment.im_subs WHERE email = ${email}`;
    return true;
  });
}

export function pgSubList() {
  return pg(async (sql) => {
    const rows = await sql<{ data: unknown }[]>`SELECT data FROM invest_moment.im_subs`;
    return rows.map((r) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
  });
}
