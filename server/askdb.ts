/**
 * The record of Ask AI questions, kept in the Cloudflare D1 database bound as DB.
 *
 * One row per request to the model: the question itself ("question"), and each round after
 * a draft was made ("continue"). Rows of one question share a turn_id. The daily limit counts
 * question rows; Aodhan reads the whole record on /ask-log (decision 49).
 */

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS asks (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    day TEXT NOT NULL,
    email TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    screen TEXT,
    question TEXT,
    answer TEXT,
    tools TEXT,
    model TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS asks_email_day ON asks (email, day)",
  "CREATE INDEX IF NOT EXISTS asks_turn ON asks (turn_id)",
  "CREATE INDEX IF NOT EXISTS asks_at ON asks (at)",
];

export type AskRow = {
  id: string;
  at: string;
  day: string;
  email: string;
  turn_id: string;
  kind: "question" | "continue";
  screen: string | null;
  question: string | null;
  answer: string | null;
  tools: string | null;
  model: string | null;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  cost_usd: number;
  ms: number;
  status: string;
};

let ready = false;
export async function ensureSchema(db: D1Database) {
  if (ready) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  ready = true;
}

/** Today's date in Ireland, which is when the daily limit starts again. */
export function dublinDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Questions this person has asked today. Requests the model never answered do not count. */
export async function questionsToday(db: D1Database, email: string, day: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM asks WHERE email = ?1 AND day = ?2 AND kind = 'question' AND status != 'error'").bind(email, day).first<{ n: number }>();
  return r?.n ?? 0;
}

/** For a follow-up round after a draft: does the question exist for this person, and how many rounds has it had? */
export async function turnRounds(db: D1Database, turnId: string, email: string) {
  const r = await db.prepare("SELECT SUM(kind = 'question') AS q, SUM(kind = 'continue') AS c FROM asks WHERE turn_id = ?1 AND email = ?2").bind(turnId, email).first<{ q: number | null; c: number | null }>();
  return { questions: r?.q ?? 0, rounds: r?.c ?? 0 };
}

export async function startRow(db: D1Database, row: Pick<AskRow, "id" | "at" | "day" | "email" | "turn_id" | "kind" | "screen" | "question" | "model">) {
  await db
    .prepare("INSERT INTO asks (id, at, day, email, turn_id, kind, screen, question, model, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'answering')")
    .bind(row.id, row.at, row.day, row.email, row.turn_id, row.kind, row.screen, row.question, row.model)
    .run();
}

export async function finishRow(db: D1Database, id: string, f: Pick<AskRow, "answer" | "tools" | "input_tokens" | "cache_write_tokens" | "cache_read_tokens" | "output_tokens" | "cost_usd" | "ms" | "status">) {
  await db
    .prepare("UPDATE asks SET answer = ?2, tools = ?3, input_tokens = ?4, cache_write_tokens = ?5, cache_read_tokens = ?6, output_tokens = ?7, cost_usd = ?8, ms = ?9, status = ?10 WHERE id = ?1")
    .bind(id, f.answer, f.tools, f.input_tokens, f.cache_write_tokens, f.cache_read_tokens, f.output_tokens, f.cost_usd, f.ms, f.status)
    .run();
}

export async function recentRows(db: D1Database, limit = 600) {
  const r = await db.prepare("SELECT * FROM asks ORDER BY at DESC LIMIT ?1").bind(limit).all<AskRow>();
  return r.results ?? [];
}
