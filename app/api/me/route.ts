export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { query, str } from "@/lib/db";

/**
 * Everything the reader writes: notes, questions, reviews (self-assessment),
 * real-life actions, reading progress and life areas.
 * GET returns it all; POST applies one action and returns the fresh state.
 */

async function snapshot() {
  const [notes, questions, reviews, actions, progress, areas] = await Promise.all([
    query("SELECT id, node_id, book_title, chapter, quote, body, area, kind, created_at FROM notes ORDER BY created_at DESC"),
    query("SELECT id, node_id, book_title, chapter, quote, question, answer, answered_at, created_at FROM questions ORDER BY created_at DESC"),
    query("SELECT node_id, mastery, interval_days, due_at, last_answer, last_rating, updated_at FROM reviews"),
    query("SELECT id, node_id, book_title, chapter, area, situation, step, to_char(due_date, 'YYYY-MM-DD') AS due_date, outcome, created_at FROM actions ORDER BY COALESCE(due_date, created_at::date) ASC"),
    query("SELECT node_id, sprint_index, updated_at FROM progress ORDER BY updated_at DESC"),
    query("SELECT name FROM areas ORDER BY sort, name"),
  ]);
  return { notes, questions, reviews, actions, progress, areas: areas.map((a) => a.name) };
}

export async function GET() {
  try {
    return NextResponse.json(await snapshot());
  } catch (e) {
    console.error("[api/me] GET", e);
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }
}

const RATING = {
  no: { mastery: "Red", interval: 1 },
  meh: { mastery: "Yellow", interval: 3 },
  yes: { mastery: "Green", interval: 7 },
} as const;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const action = str(body.action, 40);
  const nodeId = str(body.nodeId, 200);
  const bookTitle = str(body.bookTitle, 300);
  const chapter = str(body.chapter, 300);
  const needNode = () => {
    if (!nodeId || !bookTitle || !chapter) throw new Error("missing node");
  };

  try {
    switch (action) {
      case "note.add": {
        needNode();
        const kind = body.kind === "highlight" ? "highlight" : "note";
        const quote = str(body.quote);
        const text = str(body.body);
        if (!quote && !text) throw new Error("empty note");
        await query(
          "INSERT INTO notes (node_id, book_title, chapter, quote, body, area, kind) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [nodeId, bookTitle, chapter, quote, text, str(body.area, 60), kind],
        );
        break;
      }
      case "note.delete":
        await query("DELETE FROM notes WHERE id = $1", [str(body.id, 60)]);
        break;
      case "question.add": {
        needNode();
        const q = str(body.question);
        if (!q) throw new Error("empty question");
        await query(
          "INSERT INTO questions (node_id, book_title, chapter, quote, question) VALUES ($1,$2,$3,$4,$5)",
          [nodeId, bookTitle, chapter, str(body.quote), q],
        );
        break;
      }
      case "question.delete":
        await query("DELETE FROM questions WHERE id = $1", [str(body.id, 60)]);
        break;
      case "review.rate": {
        if (!nodeId) throw new Error("missing node");
        const key = body.rating as keyof typeof RATING;
        const r = RATING[key];
        if (!r) throw new Error("bad rating");
        // "Lo sabía" twice in a row doubles the wait (7 → 14 → 28 days).
        const prev = await query<{ interval_days: number; last_rating: string }>(
          "SELECT interval_days, last_rating FROM reviews WHERE node_id = $1",
          [nodeId],
        );
        const interval =
          key === "yes" && prev[0]?.last_rating === "yes" ? Math.min(prev[0].interval_days * 2, 90) : r.interval;
        await query(
          `INSERT INTO reviews (node_id, mastery, interval_days, due_at, last_answer, last_rating, updated_at)
           VALUES ($1,$2,$3::int, now() + make_interval(days => $3::int), $4, $5, now())
           ON CONFLICT (node_id) DO UPDATE SET mastery = EXCLUDED.mastery, interval_days = EXCLUDED.interval_days,
             due_at = EXCLUDED.due_at, last_answer = EXCLUDED.last_answer, last_rating = EXCLUDED.last_rating, updated_at = now()`,
          [nodeId, r.mastery, interval, str(body.answer), key],
        );
        break;
      }
      case "action.add": {
        needNode();
        const step = str(body.step, 1000);
        if (!step) throw new Error("empty step");
        const due = str(body.dueDate, 10);
        await query(
          "INSERT INTO actions (node_id, book_title, chapter, area, situation, step, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [nodeId, bookTitle, chapter, str(body.area, 60), str(body.situation), step, due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null],
        );
        break;
      }
      case "action.outcome": {
        const outcome = ["pending", "worked", "didnt"].includes(body.outcome as string) ? body.outcome : null;
        if (!outcome) throw new Error("bad outcome");
        await query("UPDATE actions SET outcome = $2 WHERE id = $1", [str(body.id, 60), outcome]);
        break;
      }
      case "action.delete":
        await query("DELETE FROM actions WHERE id = $1", [str(body.id, 60)]);
        break;
      case "progress.set": {
        if (!nodeId) throw new Error("missing node");
        const idx = Number.isInteger(body.sprintIndex) ? Math.max(0, Math.min(50, body.sprintIndex as number)) : 0;
        await query(
          `INSERT INTO progress (node_id, sprint_index, updated_at) VALUES ($1,$2, now())
           ON CONFLICT (node_id) DO UPDATE SET sprint_index = EXCLUDED.sprint_index, updated_at = now()`,
          [nodeId, idx],
        );
        break;
      }
      case "area.add": {
        const name = str(body.name, 40);
        if (!name) throw new Error("empty area");
        await query("INSERT INTO areas (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
        break;
      }
      default:
        return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }
    return NextResponse.json(await snapshot());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/me] POST", action, msg);
    const isInput = /missing|empty|bad/.test(msg);
    return NextResponse.json({ error: isInput ? msg : "db_error" }, { status: isInput ? 400 : 500 });
  }
}
