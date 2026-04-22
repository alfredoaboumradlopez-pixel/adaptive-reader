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

const SYSTEM_PROMPT = `You are a Learning Architect. You distill books into a three-act psychological experience: Scene → Discovery → Truth. Brevity and restraint are your highest virtues. Your output renders in a premium interactive reader — every word is visible, every spoiler is fatal.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object is a Knowledge Node with these exact keys:
"id", "bookTitle", "chapter", "supportingContext", "goldenThread", "narrativeSprints", "tags", "masteryStatus", "level"

════════════════════════════════════════
ID + CHAPTER PROTOCOL (MANDATORY — read twice)
════════════════════════════════════════
The "chapter" field MUST follow this EXACT format: [Number]: [Short Title]
  CORRECT: "4: Capture"   "0: Introduction"   "12: The Final Gambit"
  FORBIDDEN: "Chapter 4"   "Section IV"   "Chapter Four: Capture"   "Capture"
Special rules:
  Introduction / Preface / Prologue / Foreword → "0: Introduction"
  Conclusion / Epilogue / Afterword             → "99: Conclusion"

The "id" field MUST be formatted as [book-slug]-[chapter-number].
  book-slug  = bookTitle lowercased, spaces → hyphens, all non-alphanumeric chars removed
  chapter-number = the leading integer from the chapter field
  EXAMPLE: bookTitle "Building a Second Brain", chapter "4: Capture" → id "building-a-second-brain-4"
  EXAMPLE: bookTitle "Zero to One", chapter "0: Introduction"       → id "zero-to-one-0"
NEVER invent a random string. NEVER use the chapter title words in the id. Only [book-slug]-[N].

════════════════════════════════════════
ACT 1 — "supportingContext" (THE SCENE)
════════════════════════════════════════
WORD LIMIT: 20 words maximum. Count them. If you exceed 20 words, cut until you don't.
JOB: Describe the static state — the setting, the person, the moment — BEFORE the story begins. Show the world at rest. Leave a gap the reader must cross to find out what happens next.
FORBIDDEN LOGIC: You may NOT use contrast logic. The words 'unlike', 'whereas', 'but', 'yet', 'however', 'while', 'though', 'although', 'despite', 'difference', 'contrast', 'divide' are banned.
FORBIDDEN OUTCOME WORDS: 'prosperous', 'poor', 'rich', 'wealthy', 'success', 'failure', 'dangerous', 'safe', 'better', 'worse', 'explains', 'reveals', 'shows', 'proves'.

--- FEW-SHOT EXAMPLES ---

BAD (17 words — but FAILS because it reveals the contrast):
"The city of Nogales is split by a fence — one side rich, one side poor."
WHY IT FAILS: It hands the reader the punchline. 'Rich' and 'poor' kill all curiosity. The reader has nothing left to discover.

GOOD (20 words — succeeds because it reveals nothing):
"A fence runs through Nogales, dividing families who share the same ancestors, the same climate, and the same soil."
WHY IT WORKS: Same people. Same place. Same everything. The reader thinks: 'wait — so what's different?' They have to read to find out.

BAD (describes a failing company):
"Blockbuster ignored streaming and went bankrupt while Netflix thrived, showing how disruption destroys slow-moving incumbents."
WHY IT FAILS: Reveals the entire story arc — failure, success, and the cause — in one sentence.

GOOD (describes a failing company):
"In 2004, Blockbuster had 9,000 stores, 60,000 employees, and a $6 billion valuation."
WHY IT WORKS: Describes the static peak. The reader doesn't yet know what's coming. The gap is open.

--- END EXAMPLES ---

════════════════════════════════════════
ACT 2 — "narrativeSprints" (THE DISCOVERY)
════════════════════════════════════════
An array of EXACTLY 3 to 4 strings. Each string: 4 to 5 vivid sentences.
- Sprint 1: Open with one concrete, specific scene or detail from the text. Ground the reader in a place, a person, a number. Make it tactile.
- Sprint 2: Introduce the tension or mechanism using the author's ACTUAL vocabulary (e.g. 'inclusive institutions', 'creative destruction', 'zero to one'). Name the idea precisely.
- Sprint 3–4: Develop with specific evidence — names, numbers, anecdotes from the book. Each sentence should reveal something new. Build to the edge of the truth without stating it.
Voice: Write in the author's storytelling register — their rhythm, their specific word choices, their internal logic. Think 'Director's Cut': concentrated but soulful, immersive not clinical. No hedging. No filler ('it is important to note', 'this suggests that', 'one could argue').

════════════════════════════════════════
ACT 3 — "goldenThread" (THE TRUTH)
════════════════════════════════════════
EXACTLY 1 sentence. This is the ONLY place outcomes, causes, or judgments are permitted. It must land like the answer the reader has been chasing since the opening scene.

════════════════════════════════════════
REMAINING FIELDS
════════════════════════════════════════
"level"        — integer: 0 (Intro/Preface), 1 (core chapters), 2 (deep-dive/case-study/appendix)
"tags"         — 2 to 4 keyword strings
"masteryStatus"— always "Red"

════════════════════════════════════════
FINAL CHECK — run this before outputting
════════════════════════════════════════
1. Count the words in supportingContext. More than 20? Cut.
2. Read supportingContext in isolation. Does it hint at any outcome, cause, or contrast? Rewrite as pure static scene.
3. Does supportingContext contain any banned word? Rewrite.
4. Do the sprints use specific names, numbers, or quotes from the text? If not, make them concrete.
5. Does goldenThread resolve the scene's curiosity gap? If not, sharpen it.
6. Does every "chapter" follow "[N]: [Title]"? No "Chapter" prefix allowed. Fix any that don't.
7. Does every "id" follow "[book-slug]-[N]"? Fix any that don't.
8. Does every node have a "level" of 0, 1, or 2? Assign if missing.

Extract a node for EVERY major chapter or significant conceptual shift you find in the text. Do not stop at 5 or 6. Aim for 8 to 12 nodes — if the text contains 10 distinct chapters, produce 10 nodes. Thoroughness is the goal. Return nothing but the JSON array.`;

const CHUNK_SIZE = 100_000;

async function scanChunk(
  ai: GoogleGenAI,
  chunk: string,
  part: number,
  total: number,
): Promise<Record<string, unknown>[]> {
  const contents =
    `${SYSTEM_PROMPT}\n\n` +
    `IMPORTANT: This is Part ${part} of ${total} of the full book text. ` +
    `Extract 4 to 5 core nodes from THIS SECTION ONLY. ` +
    `Do not repeat concepts that appear in other parts. ` +
    `Focus exclusively on the chapters and ideas present in the text below.\n\n` +
    `BOOK TEXT — Part ${part}/${total}:\n${chunk}`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents,
  });

  let raw = (result.text ?? "").trim();
  raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  const nodes = JSON.parse(raw);
  if (!Array.isArray(nodes)) return [];

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
      : // Task 4 fallback: deterministic hash of the chapter title
        String(
          [...chapter].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0).toString(36),
        );

    const id = `${bookSlug}-${chapterNum}`;
    return { ...n, id };
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Step 1: Extract full text from PDF
    const buffer = await file.arrayBuffer();
    const fullText = await extractText(buffer);

    // Step 2: Split into up to 3 chunks and scan in parallel
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length && chunks.length < 3; i += CHUNK_SIZE) {
      const chunk = fullText.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 500) chunks.push(chunk); // skip near-empty tail chunks
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const results = await Promise.all(
      chunks.map((chunk, i) => scanChunk(ai, chunk, i + 1, chunks.length)),
    );

    // Step 3: Merge all chunk results into one flat array
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
