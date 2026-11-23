import { Pool } from "pg";

/**
 * Postgres (Railway in production, a local instance in dev via DATABASE_URL).
 * One pool per server process; schema is created on first use.
 */

const globalForDb = globalThis as unknown as { __tarPool?: Pool; __tarSchema?: Promise<void> };

function pool(): Pool {
  if (!globalForDb.__tarPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__tarPool = new Pool({ connectionString: url, max: 5 });
  }
  return globalForDb.__tarPool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL,
  book_title text NOT NULL,
  chapter text NOT NULL,
  quote text,
  body text,
  area text,
  kind text NOT NULL DEFAULT 'note',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL,
  book_title text NOT NULL,
  chapter text NOT NULL,
  quote text,
  question text NOT NULL,
  answer text,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews (
  node_id text PRIMARY KEY,
  mastery text NOT NULL,
  interval_days int NOT NULL,
  due_at timestamptz NOT NULL,
  last_answer text,
  last_rating text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text NOT NULL,
  book_title text NOT NULL,
  chapter text NOT NULL,
  area text,
  situation text,
  step text NOT NULL,
  due_date date,
  outcome text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS progress (
  node_id text PRIMARY KEY,
  sprint_index int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS areas (
  name text PRIMARY KEY,
  sort int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO areas (name, sort) VALUES ('Negocio', 1), ('Equipo', 2), ('Finanzas', 3), ('Personal', 4)
ON CONFLICT (name) DO NOTHING;
`;

function ensureSchema(): Promise<void> {
  if (!globalForDb.__tarSchema) {
    globalForDb.__tarSchema = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        globalForDb.__tarSchema = undefined;
        throw e;
      });
  }
  return globalForDb.__tarSchema;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

/** Small helpers for route handlers. */
export function str(v: unknown, max = 5000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
