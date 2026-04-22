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
// PHASE 1: TOC DISCOVERY
// ─────────────────────────────────────────────────────────────

type TocEntry = { number: number; title: string };

const TOC_PROMPT = `You are a structural analyst. Your ONLY job is to extract the Table of Contents from the text below.

Return a JSON array of the Level 1 chapters only — the actual numbered chapters, not sub-sections:
[{"number": 1, "title": "The Challenge of the Future"}, {"number": 4, "title": "Capture"}, ...]

RULES:
- Include ONLY top-level, numbered chapters.
- NEVER include sub-sections, sub-headers, or call-out boxes.
- Preface / Introduction / Prologue / Foreword → {"number": 0, "title": "Introduction"}
- Conclusion / Epilogue / Afterword → {"number": 99, "title": "Conclusion"}
- EXCLUDE entirely: Index, Bibliography, Acknowledgments, Credits, About the Author,
  Praise for..., Further Reading, Also by the Author, Copyright, Permissions.
- If no Table of Contents is visible, scan for numbered chapter headings and infer the list.
- Return ONLY the raw JSON array. No markdown. No explanation. No preamble.`;

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
    return []; // Fallback: no approved list → content pass uses open scan
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE 2: CONTENT EXTRACTION
// ─────────────────────────────────────────────────────────────

function buildContentPrompt(approvedChapters: TocEntry[]): string {
  const hasToc = approvedChapters.length > 0;

  const approvedBlock = hasToc
    ? `════════════════════════════════════════
APPROVED CHAPTER LIST — LAW 0 (ABSOLUTE)
════════════════════════════════════════
You MAY ONLY create nodes for the chapters on this list. This is the complete set.

${approvedChapters.map((c) => `  ${c.number}: ${c.title}`).join("\n")}

ABSOLUTE RULE: Do NOT create nodes for sub-sections, sub-headers, sidebars, or call-out boxes.
Sub-sections are FUEL for the parent chapter's Sprints — compress them into Sprint content.
If Chapter 4 has sub-sections A, B, C → they become Sprint 1, Sprint 2, Sprint 3 of Chapter 4.
They do NOT become separate nodes. Zero exceptions.`
    : `════════════════════════════════════════
STRUCTURAL FILTER (no TOC found — apply strictly)
════════════════════════════════════════
Extract only top-level, numbered chapters. Fold all sub-sections into their parent's Sprints.
Do NOT create nodes for sub-headers or non-chapter sections.`;

  return `You are a Structural Scanner and Narrative Architect. For each confirmed Level 1 chapter you find, distill it into a three-act psychological experience: Scene → Discovery → Truth.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object is a Knowledge Node with these exact keys:
"id", "bookTitle", "chapter", "supportingContext", "goldenThread", "narrativeSprints", "tags", "masteryStatus", "level"

${approvedBlock}

════════════════════════════════════════
LAW 1 — ID + CHAPTER PROTOCOL (MANDATORY)
════════════════════════════════════════
The "chapter" field MUST follow this EXACT format: [Number]: [Short Title]
  CORRECT: "4: Capture"   "0: Introduction"   "12: The Final Gambit"
  FORBIDDEN: "Chapter 4"   "Section IV"   "Chapter Four: Capture"   "Capture"
Special:
  Introduction / Preface / Prologue / Foreword → "0: Introduction"
  Conclusion / Epilogue / Afterword             → "99: Conclusion"

The "id" MUST be [book-slug]-[chapter-number].
  book-slug = bookTitle lowercased, spaces→hyphens, non-alphanumeric removed
  EXAMPLE: "Building a Second Brain", chapter "4: Capture" → id "building-a-second-brain-4"
  EXAMPLE: "Zero to One", chapter "0: Introduction" → id "zero-to-one-0"

════════════════════════════════════════
LAW 2 — "supportingContext" (THE SCENE — 2 SENTENCES)
════════════════════════════════════════
Write EXACTLY 2 sentences. Describe the static state BEFORE the story begins.
Show the world at rest. Leave a gap the reader must cross to find out what happens.
BANNED WORDS: 'Chapter', 'Section', 'Summarize', 'Summary', 'unlike', 'whereas',
'but', 'yet', 'however', 'while', 'though', 'although', 'despite', 'difference',
'contrast', 'divide', 'prosperous', 'poor', 'rich', 'wealthy', 'success', 'failure',
'dangerous', 'safe', 'better', 'worse', 'explains', 'reveals', 'shows', 'proves'.

--- EXAMPLES ---
GOOD: "In 2004, Blockbuster operated 9,000 stores, employed 60,000 people, and carried a $6 billion valuation. Reed Hastings had requested a meeting with their CEO three years earlier."
BAD:  "Blockbuster ignored streaming and went bankrupt while Netflix thrived."

════════════════════════════════════════
LAW 3 — "narrativeSprints" (THE DISCOVERY)
════════════════════════════════════════
Array of EXACTLY 3 to 4 strings. Each string: 4 to 5 vivid sentences. Flowing prose — no bullet points.

- Sprint 1: One concrete, tactile scene or detail from the chapter. A place, a person, a number.
- Sprint 2: The core mechanism in the author's EXACT vocabulary ('PARA', 'creative destruction', 'progressive summarization', 'zero to one').
- Sprint 3–4: Specific evidence — names, numbers, anecdotes. Sub-sections are compressed here. Build to the truth without stating it.

VOICE: Mirror the author's register. Contrarian + philosophical for Thiel. Tactical + empowering for Forte. Curious + clinical for Gladwell. No hedging. No filler.

════════════════════════════════════════
LAW 4 — "goldenThread" (THE TRUTH — 1 SENTENCE)
════════════════════════════════════════
The singular 'Aha!' insight of the ENTIRE chapter — not just the first paragraph.
It must resolve the curiosity gap opened by supportingContext.
This is the ONLY place outcomes or judgments are permitted.

════════════════════════════════════════
REMAINING FIELDS
════════════════════════════════════════
"level"        — 0 (Intro/Preface), 1 (core chapters), 2 (deep-dive/technical/appendix)
"tags"         — 2 to 4 keyword strings
"masteryStatus"— always "Red"

════════════════════════════════════════
LAW 5 — NOISE FILTER
════════════════════════════════════════
SKIP entirely: Acknowledgments, Index, Bibliography, References, About the Author,
Praise for..., Further Reading, Table of Contents, Copyright, Permissions.
Appendix: skip unless it contains a standalone conceptual argument.
If a section has no Golden Thread, it does not exist. Skip it.

════════════════════════════════════════
FINAL CHECK — run before outputting
════════════════════════════════════════
1. Every node's chapter on the approved list? Remove any not on the list.
2. supportingContext: exactly 2 sentences, no banned words?
3. Every "chapter" follows "[N]: [Title]" — no "Chapter" prefix?
4. Every "id" follows "[book-slug]-[N]"?
5. Sprints use author's vocabulary + concrete evidence from the chapter?
6. goldenThread is the chapter's primary insight, not just the opening paragraph?
7. Every node has "level" 0, 1, or 2?
8. Any blacklisted section sneaked in? Remove it.

Return nothing but the JSON array.`;
}

// ─────────────────────────────────────────────────────────────
// SERVER-SIDE ID OVERRIDE
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

const CHUNK_SIZE = 60_000;
const MAX_CHUNKS = 5;

async function scanChunk(
  ai: GoogleGenAI,
  chunk: string,
  part: number,
  total: number,
  approvedChapters: TocEntry[],
): Promise<Record<string, unknown>[]> {
  const approvedNote =
    approvedChapters.length > 0
      ? `You have an APPROVED CHAPTER LIST embedded in your instructions above. ` +
        `Only create nodes for chapters on that list. Fold sub-sections into Sprints.`
      : `Extract only top-level numbered chapters. Fold sub-sections into their parent's Sprints.`;

  const contents =
    `${buildContentPrompt(approvedChapters)}\n\n` +
    `PART ${part} of ${total}: ${approvedNote}\n\n` +
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

    // Phase 1: TOC discovery from the first 20k chars (TOC is always near the front)
    const approvedChapters = await discoverTOC(ai, fullText.slice(0, 20_000));
    console.log(
      `[/api/ingest] TOC found: ${approvedChapters.length} chapters`,
      approvedChapters.map((c) => `${c.number}: ${c.title}`),
    );

    // Phase 2: Content extraction across up to 5 chunks in parallel
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
      const chunk = fullText.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 500) chunks.push(chunk);
    }

    const results = await Promise.all(
      chunks.map((chunk, i) => scanChunk(ai, chunk, i + 1, chunks.length, approvedChapters)),
    );

    const nodes = results.flat();
    if (nodes.length === 0) throw new Error("Gemini returned no nodes across all chunks");

    return NextResponse.json({ nodes, chunks: chunks.length, tocCount: approvedChapters.length });
  } catch (error) {
    console.error("[/api/ingest]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
