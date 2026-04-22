export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// pdf-parse v2 types
type PdfParseResult = { pages: { text: string; num: number }[] };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (data: Uint8Array) => {
    load(): Promise<void>;
    getText(): Promise<PdfParseResult>;
  };
};

async function extractText(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse(new Uint8Array(buffer));
  await parser.load();
  const result = await parser.getText();
  return result.pages.map((p) => p.text).join("\n");
}

const SYSTEM_PROMPT = `You are a Structural Scanner and Narrative Architect. You have two jobs: (1) find every chapter, and (2) distill each one into a three-act psychological experience — Scene → Discovery → Truth.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object is a Knowledge Node with these exact keys:
"id", "bookTitle", "chapter", "supportingContext", "goldenThread", "narrativeSprints", "tags", "masteryStatus", "level"

════════════════════════════════════════
LAW 1 — EXHAUSTIVE SCAN (NON-NEGOTIABLE)
════════════════════════════════════════
You are FORBIDDEN from skipping chapters. If the text contains a header, a numbered section, or a titled chapter — it must become a node.
Do not consolidate. Do not merge. Do not summarize multiple chapters into one.
One chapter header = one node. Every header you see in this text must appear in your output.
If you are unsure whether something is a chapter, include it. Omission is the only error.

════════════════════════════════════════
LAW 2 — ID + CHAPTER PROTOCOL (MANDATORY)
════════════════════════════════════════
The "chapter" field MUST follow this EXACT format: [Number]: [Short Title]
  CORRECT: "4: Capture"   "0: Introduction"   "12: The Final Gambit"
  FORBIDDEN: "Chapter 4"   "Section IV"   "Chapter Four: Capture"   "Capture"
Special rules:
  Introduction / Preface / Prologue / Foreword → "0: Introduction"
  Conclusion / Epilogue / Afterword             → "99: Conclusion"

The "id" field MUST be formatted as [book-slug]-[chapter-number].
  book-slug        = bookTitle lowercased, spaces → hyphens, non-alphanumeric removed
  chapter-number   = the leading integer from the chapter field
  EXAMPLE: bookTitle "Building a Second Brain", chapter "4: Capture" → id "building-a-second-brain-4"
  EXAMPLE: bookTitle "Zero to One", chapter "0: Introduction"       → id "zero-to-one-0"
NEVER use random strings. NEVER put chapter title words in the id. Only [book-slug]-[N].

════════════════════════════════════════
LAW 3 — "supportingContext" (THE SCENE — 2 SENTENCES ONLY)
════════════════════════════════════════
Write EXACTLY 2 sentences. No more. No less.
Job: Describe the static state — the setting, the person, the moment — BEFORE the story begins.
Show the world at rest. Leave a gap the reader must cross.
BANNED WORDS IN THIS FIELD: 'Chapter', 'Section', 'Summarize', 'Summary', 'unlike', 'whereas', 'but', 'yet', 'however', 'while', 'though', 'although', 'despite', 'difference', 'contrast', 'divide', 'prosperous', 'poor', 'rich', 'wealthy', 'success', 'failure', 'dangerous', 'safe', 'better', 'worse', 'explains', 'reveals', 'shows', 'proves'.

--- FEW-SHOT EXAMPLES ---

BAD: "The city of Nogales is split by a fence — one side rich, one side poor."
WHY IT FAILS: Reveals the contrast. 'Rich' and 'poor' kill all curiosity.

GOOD: "A fence runs through Nogales, dividing families who share the same ancestors, the same climate, and the same soil. No one from either side chose where they were born."
WHY IT WORKS: Same place, same people — reader thinks: what's different? They must read to find out.

BAD: "In 2004, Blockbuster ignored streaming and went bankrupt while Netflix thrived."
WHY IT FAILS: Reveals the entire arc in one sentence.

GOOD: "In 2004, Blockbuster operated 9,000 stores, employed 60,000 people, and carried a $6 billion valuation. Reed Hastings had requested a meeting with their CEO three years earlier."
WHY IT WORKS: Two facts. The second one opens a door. The reader has to walk through it.

--- END EXAMPLES ---

════════════════════════════════════════
LAW 4 — "narrativeSprints" (THE DISCOVERY)
════════════════════════════════════════
An array of EXACTLY 3 to 4 strings. Each string: 4 to 5 vivid sentences.
NO bullet points. NO numbered lists inside strings. Flowing prose only.

- Sprint 1: Open with one concrete, specific scene or detail from the text. A place, a person, a number. Make it tactile and immediate.
- Sprint 2: Introduce the core mechanism using the author's ACTUAL vocabulary. Name the idea with their exact term. ('inclusive institutions', 'creative destruction', 'PARA', 'progressive summarization', 'zero to one').
- Sprint 3–4: Develop with specific evidence — names, numbers, anecdotes directly from the book. Each sentence reveals something new. Build to the edge of the truth without stating it.

VOICE: Mirror the author's storytelling register. Contrarian and philosophical for Thiel. Tactical and empowering for Forte. Clinical and curious for Gladwell. No hedging. No filler phrases like 'it is important to note', 'this suggests that', 'one could argue'.

════════════════════════════════════════
LAW 5 — "goldenThread" (THE TRUTH)
════════════════════════════════════════
EXACTLY 1 sentence. This is the ONLY place outcomes, causes, or judgments are permitted.
It must land like the answer the reader has been chasing since the opening scene.

════════════════════════════════════════
REMAINING FIELDS
════════════════════════════════════════
"level"        — integer: 0 (Intro/Preface/Prologue), 1 (core narrative chapters), 2 (deep-dive/technical/appendix)
"tags"         — 2 to 4 keyword strings
"masteryStatus"— always "Red"

════════════════════════════════════════
FINAL CHECK — run before outputting
════════════════════════════════════════
1. Count every chapter header you saw. Does your output have a node for each one? Add any missing.
2. supportingContext: exactly 2 sentences? Contains any banned word? Fix it.
3. Does every "chapter" follow "[N]: [Title]"? No "Chapter" prefix. Fix any that don't.
4. Does every "id" follow "[book-slug]-[N]"? Fix any that don't.
5. Do the sprints use the author's specific vocabulary and concrete evidence? If not, rewrite.
6. Does goldenThread resolve the scene's curiosity gap? If not, sharpen it.
7. Does every node have a valid "level" of 0, 1, or 2? Assign if missing.

Return nothing but the JSON array.`;

const CHUNK_SIZE = 60_000;
const MAX_CHUNKS = 5;

async function scanChunk(
  ai: GoogleGenAI,
  chunk: string,
  part: number,
  total: number,
): Promise<Record<string, unknown>[]> {
  const contents =
    `${SYSTEM_PROMPT}\n\n` +
    `IMPORTANT: This is Part ${part} of ${total} of the full book text. ` +
    `Your ONLY job is to extract ALL chapters and sections visible in this text. ` +
    `Do NOT skip any chapter. Do NOT merge chapters. One header = one node. ` +
    `Focus exclusively on the chapters and sections present in the text below.\n\n` +
    `BOOK TEXT — Part ${part}/${total}:\n${chunk}`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents,
    config: { temperature: 0.2 },
  });

  let raw = (result.text ?? "").trim();
  raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  const nodes = JSON.parse(raw);
  if (!Array.isArray(nodes)) return [];

  // Server-side ID override — canonical [book-slug]-[chapter-number] regardless of Gemini output
  return (nodes as Record<string, unknown>[]).map((n) => {
    const bookTitle = typeof n.bookTitle === "string" ? n.bookTitle : "unknown";
    const chapter = typeof n.chapter === "string" ? n.chapter : "";

    const bookSlug = bookTitle
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const chapterNumMatch = chapter.replace(/^chapter\s+/i, "").match(/^(\d+)/);
    const chapterNum = chapterNumMatch
      ? chapterNumMatch[1]
      : String(
          [...chapter].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0).toString(36),
        );

    return { ...n, id: `${bookSlug}-${chapterNum}` };
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const fullText = await extractText(buffer);

    const chunks: string[] = [];
    for (let i = 0; i < fullText.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
      const chunk = fullText.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 500) chunks.push(chunk);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const results = await Promise.all(
      chunks.map((chunk, i) => scanChunk(ai, chunk, i + 1, chunks.length)),
    );

    const nodes = results.flat();
    if (nodes.length === 0) {
      throw new Error("Gemini returned no nodes across all chunks");
    }

    return NextResponse.json({ nodes, chunks: chunks.length });
  } catch (error) {
    console.error("[/api/ingest]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
