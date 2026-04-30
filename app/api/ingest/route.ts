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
  | { type: "chapter"; node: Record<string, unknown>; chapterNum: number; chapterTitle: string; completedCount: number }
  | { type: "skip"; chapterNum: number; chapterTitle: string; reason: string }
  | { type: "retry"; missingCount: number }
  | { type: "done"; total: number; extracted: number }
  | { type: "error"; message: string };

// ─────────────────────────────────────────────────────────────
// PHASE 1 — DISCOVERY PASS (Blueprint)
// SOP v11: prompt agresivo que aplana PARTE → CAPÍTULO
// ─────────────────────────────────────────────────────────────

const DISCOVERY_PROMPT = `You are a book architect. Your ONLY job is to build the Blueprint for this book.

Analyze the text and return a raw JSON object (no markdown, no explanation) with exactly three fields:

{
  "masterChapters": [{"num": 1, "title": "The Challenge of the Future"}, ...],
  "authorPersona": "One sentence: the author's rhetorical style and sentence structure.",
  "powerWords": ["word1", "word2", "word3", "word4", "word5"]
}

━━━━━━━━━━━━━━━━━━━━━━
LEAF-NODE PROTOCOL (SOP v11) — THIS OVERRIDES EVERYTHING ELSE
━━━━━━━━━━━━━━━━━━━━━━
Many books use this hierarchy: PARTS that contain CHAPTERS.

Example structure:
  PART ONE: The Foundation
    Chapter 1: Where It All Started
    Chapter 2: What Is a Second Brain?
  PART TWO: The Method
    Chapter 3: Capture
    Chapter 4: Organize

RULE 1: PARTS are containers. They have zero content of their own.
NEVER include Part, Section, Unit, Module, Theme, or Book in masterChapters. Ever.

RULE 2: Extract ONLY the leaf nodes — the actual numbered chapters with real content.
Correct output for the example: [Ch1, Ch2, Ch3, Ch4]. Parts never appear.

RULE 3: Number chapters sequentially (1, 2, 3...) across all Parts.
Do NOT reset numbering per Part.

RULE 4: Flatten completely and aggressively.
WRONG: [{"num":1,"title":"PART ONE: The Foundation"}, {"num":2,"title":"PART TWO: The Method"}]
RIGHT:  [{"num":1,"title":"Where It All Started"}, {"num":2,"title":"What Is a Second Brain?"}, {"num":3,"title":"Capture"}, {"num":4,"title":"Organize"}]

RULE 5: Missing a chapter is always worse than including one extra. Be generous.
━━━━━━━━━━━━━━━━━━━━━━

masterChapters rules:
CRITICAL: If the book uses PARTS that contain CHAPTERS, list ONLY the chapters — never the parts. Flatten completely: Part1→Ch1,Ch2 / Part2→Ch3,Ch4 becomes [Ch1,Ch2,Ch3,Ch4]. Parts are containers, never nodes.
- Include ONLY the smallest content units — chapters/lessons inside Parts, never the Parts themselves.
- Preface / Introduction / Prologue / Foreword → {"num": 0, "title": "Introduction"}
- Conclusion / Epilogue / Afterword            → {"num": 99, "title": "Conclusion"}
- EXCLUDE entirely: Index, Bibliography, Acknowledgments, Credits, About the Author,
  Praise for..., Further Reading, Also by the Author, Copyright, Permissions.
- Be generous — missing a chapter is worse than including one extra.

authorPersona: One sentence describing sentence structure and rhetorical style.
powerWords: Exactly 5 of the author's recurring metaphors, coined terms, or signature vocabulary.

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
    console.log(`[Discovery] Gemini raw:`, JSON.stringify(parsed.masterChapters));
    console.log(`[Discovery] Filtered (${masterChapters.length}):`, masterChapters.map(c => `${c.num}:${c.title}`).join(" | "));
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
// SOP v11: PART_HEADER_RE — detecta encabezados de contenedor
// Estos NO son límites de capítulo — son texto dentro del capítulo actual
// ─────────────────────────────────────────────────────────────

const PART_HEADER_RE =
  /^\s*(part|parte|section|sección|unit|módulo|module|book|tema|theme)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;

function findChapterStart(fullText: string, chapter: TocEntry): number {
  const lower = fullText.toLowerCase();
  const titleLower = chapter.title.toLowerCase();
  const skipToc = Math.min(8_000, Math.floor(fullText.length * 0.05));

  let idx = lower.indexOf(titleLower, skipToc);
  if (idx !== -1) return idx;

  idx = lower.indexOf(titleLower);
  if (idx !== -1) return idx;

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

  const windowStart = Math.max(0, startIdx - 1_000);
  let endIdx = startIdx + 50_000;

  if (nextChapter) {
    const nextStart = findChapterStart(fullText, nextChapter);
    if (nextStart !== -1 && nextStart > startIdx + 200) {
      // SOP v11: si nextStart apunta a un PART header, no lo usamos como límite
      const surroundingText = fullText.slice(Math.max(0, nextStart - 50), nextStart + 200);
      const isPartBoundary = surroundingText.split("\n").some((line) => PART_HEADER_RE.test(line));
      if (isPartBoundary) {
        endIdx = Math.min(startIdx + 60_000, fullText.length);
      } else {
        endIdx = Math.min(endIdx, nextStart + WINDOW_OVERLAP);
      }
    }
  }

  return fullText.slice(windowStart, Math.min(endIdx, fullText.length));
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 — PER-CHAPTER EXTRACTION
// ─────────────────────────────────────────────────────────────

function buildChapterPrompt(chapter: TocEntry, authorPersona: string, powerWords: string[]): string {
  const pwLine = powerWords.length > 0
    ? `Power Words (use these in your sprints): ${powerWords.map((w) => `"${w}"`).join(", ")}`
    : "";
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
PRIMER — supportingContext — EXACTLY 2 SENTENCES
━━━━━━━━━━━━━━━━━━━━━━
Set the scene BEFORE the story begins. Static world, no outcomes, no spoilers.
Sentence 1: A concrete fact, person, place, or moment from the chapter.
Sentence 2: A detail that opens a gap — the reader must cross it to find the answer.
FORBIDDEN: 'Chapter', 'Section', 'unlike', 'whereas', 'but', 'yet', 'however',
'while', 'though', 'although', 'despite', 'explains', 'reveals', 'shows', 'proves'.

━━━━━━━━━━━━━━━━━━━━━━
ONE-NODE RULE
━━━━━━━━━━━━━━━━━━━━━━
You are extracting EXACTLY ONE chapter. ONE JSON object — never an array.
Sub-headers and internal structure are FUEL for Sprints, not separate nodes.
PART HEADERS: If the text contains "PART ONE", "PART TWO", "PARTE UNO" etc.,
ignore them completely. They are container labels, not chapters.
ONE chapter → ONE JSON object. Array = failure.

━━━━━━━━━━━━━━━━━━━━━━
SPRINTS — narrativeSprints — EXACTLY 3 TO 4 STRINGS
━━━━━━━━━━━━━━━━━━━━━━
Each string: 4 to 5 sentences of flowing prose. NO bullet points. NO numbered lists.
Sprint 1: One concrete, tactile scene from this chapter.
Sprint 2: The core mechanism in the author's EXACT vocabulary.
Sprint 3: Specific evidence — names, numbers, anecdotes.
Sprint 4 (optional): Build to the edge of the truth without stating it.
Forbidden: 'it is important to note', 'this suggests that', 'in summary'.

━━━━━━━━━━━━━━━━━━━━━━
GOLDEN THREAD — goldenThread — EXACTLY 1 SENTENCE
━━━━━━━━━━━━━━━━━━━━━━
The singular aha moment of the ENTIRE chapter.
Must resolve the curiosity gap opened by supportingContext.

"id": [book-slug]-${chapter.num}
  book-slug = bookTitle lowercased, spaces→hyphens, non-alphanumeric removed
"level": 0=Introduction, 1=core chapter, 2=deep-dive/appendix

Return ONLY the raw JSON object.`;
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
  const goldenThread = typeof parsed.goldenThread === "string" ? parsed.goldenThread.trim() : "";
  if (!goldenThread) return null;

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

        // Phase 1: Discovery — SOP v11 flattened TOC
        const { masterChapters, authorPersona, powerWords } =
          await runDiscovery(ai, fullText.slice(0, 100_000));

        send({
          type: "toc",
          masterChapters,
          authorPersona,
          powerWords,
          totalChapters: masterChapters.length,
        });

        if (masterChapters.length === 0) {
          send({ type: "error", message: "Could not identify any chapters in this PDF." });
          return;
        }

        // Phase 2: Parallel extraction with retry
        const extractedNums = new Set<number>();
        let completedCount = 0;

        const extractWithRetry = async (chapter: TocEntry, idx: number): Promise<void> => {
          const nextChapter = masterChapters[idx + 1] ?? null;
          const chapterText = findChapterWindow(fullText, chapter, nextChapter);

          if (!chapterText) {
            completedCount++;
            send({ type: "skip", chapterNum: chapter.num, chapterTitle: chapter.title, reason: "not found in extracted text" });
            return;
          }

          const MAX_ATTEMPTS = 2;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              const node = await extractChapter(ai, chapter, chapterText, authorPersona, powerWords);
              if (node) {
                extractedNums.add(chapter.num);
                completedCount++;
                send({ type: "chapter", node, chapterNum: chapter.num, chapterTitle: chapter.title, completedCount });
                return;
              }
            } catch (e) {
              if (attempt === MAX_ATTEMPTS) {
                completedCount++;
                send({ type: "skip", chapterNum: chapter.num, chapterTitle: chapter.title, reason: String(e) });
              }
            }
          }
        };

        await Promise.allSettled(
          masterChapters.map((chapter, idx) => extractWithRetry(chapter, idx)),
        );

        // Recovery pass for any missing chapters
        const missingChapters = masterChapters.filter((c) => !extractedNums.has(c.num));
        if (missingChapters.length > 0) {
          send({ type: "retry", missingCount: missingChapters.length });
          await Promise.allSettled(
            missingChapters.map((chapter) =>
              extractWithRetry(chapter, masterChapters.indexOf(chapter)),
            ),
          );
        }

        send({ type: "done", total: masterChapters.length, extracted: extractedNums.size });
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
