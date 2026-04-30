export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

// ─────────────────────────────────────────────────────────────
// PDF EXTRACTION
// ─────────────────────────────────────────────────────────────

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
// TYPES
// ─────────────────────────────────────────────────────────────

type TocEntry = { num: number; title: string };

export type StreamEvent =
  | { type: "toc"; masterChapters: TocEntry[]; authorPersona: string; powerWords: string[]; totalChapters: number }
  | { type: "chapter"; node: Record<string, unknown>; chapterNum: number }
  | { type: "skip"; chapterNum: number; reason: string }
  | { type: "done"; total: number }
  | { type: "error"; message: string };

// ─────────────────────────────────────────────────────────────
// PHASE 1 — DISCOVERY PASS (Blueprint)
// ─────────────────────────────────────────────────────────────

const DISCOVERY_PROMPT = `You are a book architect. Your ONLY job is to build the Blueprint for this book.

Analyze the text and return a raw JSON object (no markdown, no explanation) with exactly three fields:

{
  "masterChapters": [{"num": 1, "title": "The Challenge of the Future"}, ...],
  "authorPersona": "One sentence: the author's rhetorical style and sentence structure.",
  "powerWords": ["word1", "word2", "word3", "word4", "word5"]
}

masterChapters rules:
- Include ONLY top-level, numbered chapters. Never include sub-sections or sub-headers.
- Preface / Introduction / Prologue / Foreword → {"num": 0, "title": "Introduction"}
- Conclusion / Epilogue / Afterword            → {"num": 99, "title": "Conclusion"}
- EXCLUDE entirely: Index, Bibliography, Acknowledgments, Credits, About the Author,
  Praise for..., Further Reading, Also by the Author, Copyright, Permissions.
- Be generous — missing a chapter is worse than including one extra.

authorPersona: One sentence describing sentence structure and rhetorical style.
  Examples:
  - "Peter Thiel argues in contrarian, paradoxical aphorisms with a philosophical edge."
  - "Tiago Forte writes in tactical, systems-oriented prose with an empowering, instructional tone."
  - "Malcolm Gladwell uses curious, anecdote-driven storytelling with a clinical narrative voice."

powerWords: Exactly 5 of the author's recurring metaphors, coined terms, or signature vocabulary.
  Examples for Thiel: ["zero to one", "secrets", "definite optimism", "creative monopoly", "last mover"]
  Examples for Forte: ["PARA", "progressive summarization", "CODE", "intermediate packets", "second brain"]

Return ONLY the raw JSON object.`;

async function runDiscovery(
  ai: GoogleGenAI,
  firstChunk: string,
): Promise<{ masterChapters: TocEntry[]; authorPersona: string; powerWords: string[] }> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${DISCOVERY_PROMPT}\n\nTEXT:\n${firstChunk}`,
      config: { temperature: 0.1 },
    });
    let raw = (result.text ?? "").trim();
    raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(raw) as {
      masterChapters: TocEntry[];
      authorPersona: string;
      powerWords: string[];
    };
    const masterChapters = (parsed.masterChapters ?? []).filter(
      (e) => typeof e.num === "number" && typeof e.title === "string",
    );
    return {
      masterChapters,
      authorPersona: parsed.authorPersona ?? "",
      powerWords: Array.isArray(parsed.powerWords) ? (parsed.powerWords as string[]) : [],
    };
  } catch {
    return { masterChapters: [], authorPersona: "", powerWords: [] };
  }
}

// ─────────────────────────────────────────────────────────────
// CHAPTER TEXT LOCATION (hunt by title + number patterns)
// ─────────────────────────────────────────────────────────────

function findChapterStart(fullText: string, chapter: TocEntry): number {
  const lower = fullText.toLowerCase();
  const titleLower = chapter.title.toLowerCase();

  // Skip the first 8k to avoid TOC matches (TOC is always near the front)
  const skipToc = Math.min(8_000, Math.floor(fullText.length * 0.05));

  // Strategy 1: Exact title match after TOC area
  let idx = lower.indexOf(titleLower, skipToc);
  if (idx !== -1) return idx;

  // Strategy 2: Exact title match from start (short books)
  idx = lower.indexOf(titleLower);
  if (idx !== -1) return idx;

  // Strategy 3: Chapter-number patterns
  for (const pat of [
    `chapter ${chapter.num}\n`,
    `chapter ${chapter.num} `,
    `chapter ${chapter.num}:`,
    `\n${chapter.num}\n`,
    `\n${chapter.num} `,
    `\n${chapter.num}. `,
    `\n${chapter.num}: `,
  ]) {
    idx = lower.indexOf(pat, skipToc);
    if (idx !== -1) return idx;
  }

  return -1;
}

const WINDOW_OVERLAP = 10_000;

function findChapterWindow(
  fullText: string,
  chapter: TocEntry,
  nextChapter: TocEntry | null,
): string {
  const startIdx = findChapterStart(fullText, chapter);
  if (startIdx === -1) return "";

  // Start with a 1k lookback overlap so chapter headings aren't cut off
  const windowStart = Math.max(0, startIdx - 1_000);

  // Default window: 50k chars past the chapter start
  let endIdx = startIdx + 50_000;

  if (nextChapter) {
    const nextStart = findChapterStart(fullText, nextChapter);
    if (nextStart !== -1 && nextStart > startIdx + 200) {
      // Include a 10k overlap into the next chapter to capture trailing content
      endIdx = Math.min(endIdx, nextStart + WINDOW_OVERLAP);
    }
  }

  return fullText.slice(windowStart, Math.min(endIdx, fullText.length));
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 — PER-CHAPTER EXTRACTION
// ─────────────────────────────────────────────────────────────

function buildChapterPrompt(chapter: TocEntry, authorPersona: string, powerWords: string[]): string {
  const pwLine = powerWords.length > 0 ? `Power Words (use these in your sprints): ${powerWords.map((w) => `"${w}"`).join(", ")}` : "";
  return `You are extracting exactly ONE chapter from a book.

Target chapter: ${chapter.num}: ${chapter.title}
Author's voice: ${authorPersona || "Mirror the author's style — use their exact vocabulary, no generic AI summaries."}
${pwLine}

Return a SINGLE raw JSON object (not an array) — no markdown, no preamble:
{
  "id": "[book-slug]-${chapter.num}",
  "bookTitle": "[the book's exact title as printed in the text]",
  "chapter": "${chapter.num}: ${chapter.title}",
  "supportingContext": "[EXACTLY 2 sentences — scene-setting only, see rules below]",
  "goldenThread": "[EXACTLY 1 sentence — the chapter's singular aha insight]",
  "narrativeSprints": ["[sprint 1]", "[sprint 2]", "[sprint 3]", "[optional sprint 4]"],
  "tags": ["keyword1", "keyword2"],
  "masteryStatus": "Red",
  "level": 1
}

━━━━━━━━━━━━━━━━━━━━━━
PRIMER — "supportingContext" — EXACTLY 2 SENTENCES
━━━━━━━━━━━━━━━━━━━━━━
Set the scene BEFORE the story begins. Static world, no outcomes, no spoilers.
Sentence 1: A concrete fact, person, place, or moment from the chapter.
Sentence 2: A detail that opens a gap — the reader must cross it to find the answer.

FORBIDDEN in supportingContext: any word implying outcome or contrast.
Banned: 'Chapter', 'Section', 'Summarize', 'unlike', 'whereas', 'but', 'yet',
'however', 'while', 'though', 'although', 'despite', 'difference', 'contrast',
'divide', 'poor', 'rich', 'wealthy', 'success', 'failure', 'dangerous', 'safe',
'better', 'worse', 'explains', 'reveals', 'shows', 'proves', 'conclusion'.

GOOD EXAMPLE:
"In 2004, Blockbuster operated 9,000 stores and carried a $6 billion valuation.
Reed Hastings had requested a meeting with their CEO three years earlier."

BAD EXAMPLE:
"Blockbuster ignored streaming and went bankrupt while Netflix thrived."

━━━━━━━━━━━━━━━━━━━━━━
SPRINTS — "narrativeSprints" — EXACTLY 3 TO 4 STRINGS
━━━━━━━━━━━━━━━━━━━━━━
Each string: 4 to 5 sentences of flowing prose. NO bullet points. NO numbered lists.
Sub-sections within this chapter are the fuel for different Sprints — they do NOT become separate nodes.
If this chapter has sub-sections A, B, C → Sprint 1 covers A, Sprint 2 covers B, Sprint 3 covers C.

Sprint 1: Open with one concrete, tactile scene — a place, a person, a number from this chapter.
Sprint 2: Name the core mechanism using the author's EXACT vocabulary — prioritize the Power Words listed above.
Sprint 3: Develop with specific evidence — names, numbers, anecdotes from the chapter text.
Sprint 4 (optional): Build to the edge of the truth without stating it.

Voice: ${authorPersona || "Use the author's specific vocabulary. No hedging. No filler phrases."}
${pwLine ? `Vocabulary mandate: The Power Words must appear naturally in the sprints.` : ""}
Forbidden: 'it is important to note', 'this suggests that', 'one could argue', 'in summary'.

━━━━━━━━━━━━━━━━━━━━━━
GOLDEN THREAD — "goldenThread" — EXACTLY 1 SENTENCE
━━━━━━━━━━━━━━━━━━━━━━
The singular 'Aha!' moment of the ENTIRE chapter — not just the opening paragraph.
Must resolve the curiosity gap opened by supportingContext.
The ONLY place where outcomes, causes, or judgments are permitted.

━━━━━━━━━━━━━━━━━━━━━━
OTHER FIELDS
━━━━━━━━━━━━━━━━━━━━━━
"id": [book-slug]-${chapter.num}
  book-slug = bookTitle lowercased, spaces→hyphens, non-alphanumeric removed
  EXAMPLE: "Building a Second Brain" → id "building-a-second-brain-${chapter.num}"

"level":
  0 if this is an Introduction, Preface, or Prologue
  1 for core narrative/conceptual chapters
  2 for deep-dive, technical, or appendix chapters

Return ONLY the raw JSON object. No markdown. No array brackets. No preamble.`;
}

async function extractChapter(
  ai: GoogleGenAI,
  chapter: TocEntry,
  chapterText: string,
  authorPersona: string,
  powerWords: string[],
): Promise<Record<string, unknown> | null> {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `${buildChapterPrompt(chapter, authorPersona, powerWords)}\n\nCHAPTER TEXT:\n${chapterText}`,
    config: { temperature: 0.2 },
  });

  let raw = (result.text ?? "").trim();
  raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Server-side ID override: always canonical [book-slug]-[chapter-number]
  const bookTitle = typeof parsed.bookTitle === "string" ? parsed.bookTitle : "unknown";
  const bookSlug = bookTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  return { ...parsed, id: `${bookSlug}-${chapter.num}`, chapter: `${chapter.num}: ${chapter.title}` };
}

// ─────────────────────────────────────────────────────────────
// POST HANDLER — STREAMING ORCHESTRATOR
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: StreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
          send({ type: "error", message: "No file provided" });
          return;
        }

        const buffer = await file.arrayBuffer();
        const fullText = await extractText(buffer);
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Phase 1: Blueprint — TOC + author persona + power words
        const { masterChapters, authorPersona, powerWords } = await runDiscovery(ai, fullText.slice(0, 50_000));
        console.log(
          `[/api/ingest] Blueprint: ${masterChapters.length} chapters | persona: "${authorPersona}" | words: [${powerWords.join(", ")}]`,
        );

        send({ type: "toc", masterChapters, authorPersona, powerWords, totalChapters: masterChapters.length });

        if (masterChapters.length === 0) {
          send({ type: "error", message: "Could not identify any chapters in this PDF." });
          return;
        }

        // Phase 2: Sequential chapter-by-chapter extraction
        for (let i = 0; i < masterChapters.length; i++) {
          const chapter = masterChapters[i];
          const nextChapter = masterChapters[i + 1] ?? null;

          const chapterText = findChapterWindow(fullText, chapter, nextChapter);

          if (!chapterText) {
            console.warn(`[/api/ingest] Chapter ${chapter.num} not found in text — skipping`);
            send({ type: "skip", chapterNum: chapter.num, reason: "not found in extracted text" });
            continue;
          }

          try {
            const node = await extractChapter(ai, chapter, chapterText, authorPersona, powerWords);
            if (node) {
              send({ type: "chapter", node, chapterNum: chapter.num });
            } else {
              send({ type: "skip", chapterNum: chapter.num, reason: "extraction returned empty" });
            }
          } catch (e) {
            console.error(`[/api/ingest] Chapter ${chapter.num} failed:`, e);
            send({ type: "skip", chapterNum: chapter.num, reason: String(e) });
          }
        }

        send({ type: "done", total: masterChapters.length });
      } catch (error) {
        console.error("[/api/ingest]", error);
        send({ type: "error", message: error instanceof Error ? error.message : "Ingestion failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
