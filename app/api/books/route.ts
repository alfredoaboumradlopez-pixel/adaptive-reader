export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

/**
 * Curated books live in /data/books/<slug>.json.
 * Each file: { bookTitle, nodes: EmpireNode[], links?: EmpireLink[] }
 * Returns all of them merged so every device sees the same library.
 */
export async function GET() {
  const dir = path.join(process.cwd(), "data", "books");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return NextResponse.json({ nodes: [], links: [], books: [] });
  }

  const nodes: unknown[] = [];
  const links: unknown[] = [];
  const books: { bookTitle: string; author: string | null }[] = [];
  for (const f of files.sort()) {
    try {
      const book = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
      if (Array.isArray(book.nodes)) nodes.push(...book.nodes);
      if (typeof book.bookTitle === "string") {
        books.push({ bookTitle: book.bookTitle, author: typeof book.author === "string" ? book.author : null });
      }
      if (Array.isArray(book.links)) links.push(...book.links);
    } catch (e) {
      console.error(`[books] failed to parse ${f}:`, e);
    }
  }
  return NextResponse.json({ nodes, links, books });
}
