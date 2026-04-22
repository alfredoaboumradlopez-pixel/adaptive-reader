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

// ─────────────────────────────────────────────────────────────
// PHASE 1 — TOC DISCOVERY ("The Truth Table")
// ─────────────────────────────────────────────────────────────

type TocEntry = { number: number; title: string };

const TOC_PROMPT = `You are a structural analyst. Your ONLY job is to build the Truth Table — the master list of Level 1 chapters for this book.

Return a JSON array of top-level chapters only:
[{"number": 1, "title": "The Challenge of the Future"}, {"number": 4, "title": "Capture"}, ...]

RULES:
- Include ONLY top-level, numbered chapters — not sub-sections, call-out boxes, or sub-headers.
- Preface / Introduction / Prologue / Foreword → {"number": 0, "title": "Introduction"}
- Conclusion / Epilogue / Afterword            → {"number": 99, "title": "Conclusion"}
- EXCLUDE: Index, Bibliography, Acknowledgments, Credits, About the Author,
  Praise for..., Further Reading, Also by the Author, Copyright, Permissions.
- If no Table of Contents is visible, infer chapter structure from any numbered headings.
- Be GENEROUS: include every chapter you can identify. Missing a chapter is worse than including one.
- Return ONLY the raw JSON array. No markdown. No explanation.`;

async function discoverTOC(ai: GoogleGenAI, tocChunk: string): Promise<TocEntry[]> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${TOC_PROMPT}\n\nTEXT:\n${tocChunk}`,
      config: { temperature: 0.1 },
    });
    let raw = (result.text ?? "").trim();
    raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as TocEntry[]).filter(
      (e) => typeof e.number === "number" && typeof e.title === "string",
    );
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 — CONTENT EXTRACTION (Truth Table–guided)
// ─────────────────────────────────────────────────────────────

function buildContentPrompt(truthTable: TocEntry[]): string {
  const hasTOC = truthTable.length > 0;

  const truthTableBlock = hasTOC
    ? `════════════════════════════════════════
TRUTH TABLE — YOUR NAVIGATION MAP
════════════════════════════════════════
This is the complete list of Level 1 chapters for this book. Use it as your compass.

${truthTable.map((c) => `  ${c.number}: ${c.title}`).join("\n")}

YOUR EXTRACTION RULES:
1. Extract a node for EVERY chapter from the Truth Table that appears in the text chunk below.
   Do not skip any chapter. If you see it, extract it.
2. If a chapter starts in this chunk but its content continues beyond the chunk boundary,
   extract what you have. The next chunk will provide the remainder.
3. Sub-sections, sub-headers, and call-out boxes within a chapter are FUEL for that chapter's
   Sprints — they do NOT become independent nodes.
   Example: Chapter 4 with sub-sections A, B, C → Sprint 1 covers A, Sprint 2 covers B, Sprint 3 covers C.
4. You MAY create a node for a chapter NOT on the Truth Table ONLY if it is clearly a numbered
   top-level chapter the TOC missed. When in doubt, include it.`
    : `════════════════════════════════════════
STRUCTURAL GUIDANCE (no TOC found — apply carefully)
════════════════════════════════════════
Extract ALL top-level numbered chapters you find in this text.
Sub-sections and sub-headers are FUEL for their parent chapter's Sprints — not independent nodes.
One chapter header = one node. Never skip a chapter.`;

  return `You are a Structural Scanner and Narrative Architect. For each Level 1 chapter you find, distill it into a three-act psychological experience: Scene → Discovery → Truth.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object is a Knowledge Node with these exact keys:
"id", "bookTitle", "chapter", "supportingContext", "goldenThread", "narrativeSprints", "tags", "masteryStatus", "level"

${truthTableBlock}

════════════════════════════════════════
FORMATTING LAWS (all mandatory)
════════════════════════════════════════

— ID + CHAPTER PROTOCOL —
"chapter" field MUST be: [Number]: [Short Title]
  CORRECT: "4: Capture"   "0: Introduction"   "12: The Final Gambit"
  FORBIDDEN: "Chapter 4"   "Section IV"   "Chapter Four: Capture"   "Capture"
  Introduction / Preface / Prologue → "0: Introduction"
  Conclusion / Epilogue / Afterword → "99: Conclusion"

"id" field MUST be: [book-slug]-[chapter-number]
  book-slug = bookTitle lowercased, spaces→hyphens, non-alphanumeric removed
  EXAMPLE: "Building a Second Brain" ch "4: Capture" → id "building-a-second-brain-4"

— THE SCENE ("supportingContext") — EXACTLY 2 SENTENCES —
Describe the static world BEFORE the story begins. No outcomes. No contrast. No spoilers.
BANNED: 'Chapter', 'Section', 'Summarize', 'unlike', 'whereas', 'but', 'yet', 'however',
'while', 'though', 'although', 'despite', 'difference', 'contrast', 'divide', 'poor',
'rich', 'wealthy', 'success', 'failure', 'dangerous', 'safe', 'better', 'worse',
'explains', 'reveals', 'shows', 'proves'.

GOOD example: "In 2004, Blockbuster operated 9,000 stores and carried a $6 billion valuation. Reed Hastings had requested a meeting with their CEO three years earlier."
BAD example:  "Blockbuster ignored streaming and went bankrupt while Netflix thrived."

— SPRINTS ("narrativeSprints") — EXACTLY 3 TO 4 STRINGS —
Each string: 4 to 5 vivid sentences of flowing prose. No bullet points.
- Sprint 1: One concrete, tactile scene — a place, a person, a number from the chapter.
- Sprint 2: The core mechanism in the author's EXACT vocabulary ('PARA', 'creative destruction', 'progressive summarization', 'zero to one').
- Sprint 3–4: Specific evidence, names, numbers, anecdotes. Build toward the truth without stating it.
VOICE: Contrarian + philosophical for Thiel. Tactical + empowering for Forte. Curious + clinical for Gladwell. No hedging. No filler.

— THE TRUTH ("goldenThread") — EXACTLY 1 SENTENCE —
The singular 'Aha!' insight of the ENTIRE chapter — not just the opening paragraph.
Must resolve the curiosity gap opened by supportingContext.
Only place where outcomes or judgments are permitted.

— REMAINING FIELDS —
"level"         — 0 (Intro/Preface), 1 (core chapters), 2 (deep-dive/technical/appendix)
"tags"          — 2 to 4 keyword strings
"masteryStatus" — always "Red"

— NOISE FILTER —
SKIP entirely: Acknowledgments, Index, Bibliography, References, About the Author,
Further Reading, Table of Contents, Copyright, Permissions.
Appendix: skip unless it contains a standalone conceptual argument with a Golden Thread.

════════════════════════════════════════
FINAL CHECK — run before outputting
════════════════════════════════════════
1. Did you extract a node for every Truth Table chapter visible in this text? Add any missing.
2. supportingContext: exactly 2 sentences, no banned words, no outcomes?
3. Every "chapter" follows "[N]: [Title]" with no "Chapter" prefix?
4. Every "id" follows "[book-slug]-[N]"?
5. Sprints use the author's vocabulary + concrete evidence? 4-5 sentences each?
6. goldenThread is the chapter's primary insight — not just the first paragraph?
7. Every node has "level" 0, 1, or 2?
8. Any admin noise (Index, Acknowledgments, etc.) in your output? Remove it.

Return nothing but the JSON array.`;
}

// ─────────────────────────────────────────────────────────────
// SERVER-SIDE ID OVERRIDE (canonical form regardless of Gemini output)
// ─────────────────────────────────────────────────────────────

function normaliseNodes(nodes: Record<string, unknown>[]): Record<string, unknown>[] {
  return nodes.map((n) => {
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
      : String([...chapter].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0).toString(36));

    return { ...n, id: `${bookSlug}-${chapterNum}` };
  });
}

// ─────────────────────────────────────────────────────────────
// CONTENT CHUNK SCAN
// ─────────────────────────────────────────────────────────────

const CHUNK_SIZE = 100_000;
const MAX_CHUNKS = 5;

async function scanChunk(
  ai: GoogleGenAI,
  chunk: string,
  part: number,
  total: number,
  truthTable: TocEntry[],
): Promise<Record<string, unknown>[]> {
  const partNote =
    `This is Part ${part} of ${total}. ` +
    `Extract every chapter from your Truth Table that appears in this section. ` +
    `If a chapter spans this boundary, extract what is here — the next chunk covers the rest.`;

  const contents = `${buildContentPrompt(truthTable)}\n\n${partNote}\n\nBOOK TEXT — Part ${part}/${total}:\n${chunk}`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents,
    config: { temperature: 0.2 },
  });

  let raw = (result.text ?? "").trim();
  raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  const nodes = JSON.parse(raw);
  if (!Array.isArray(nodes)) return [];

  return normaliseNodes(nodes as Record<string, unknown>[]);
}

// ─────────────────────────────────────────────────────────────
// POST HANDLER
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const fullText = await extractText(buffer);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Phase 1: Build the Truth Table from the first 20k chars (TOC lives near the front)
    const truthTable = await discoverTOC(ai, fullText.slice(0, 20_000));
    console.log(
      `[/api/ingest] Truth Table: ${truthTable.length} chapters`,
      truthTable.map((c) => `${c.number}: ${c.title}`),
    );

    // Phase 2: Deep scan across up to 5 × 100k chunks in parallel
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
      const chunk = fullText.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 500) chunks.push(chunk);
    }

    const results = await Promise.all(
      chunks.map((chunk, i) => scanChunk(ai, chunk, i + 1, chunks.length, truthTable)),
    );

    const nodes = results.flat();
    if (nodes.length === 0) throw new Error("Gemini returned no nodes across all chunks");

    return NextResponse.json({ nodes, chunks: chunks.length, tocCount: truthTable.length });
  } catch (error) {
    console.error("[/api/ingest]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
