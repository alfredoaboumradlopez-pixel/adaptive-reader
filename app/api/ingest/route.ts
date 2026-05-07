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
// DISCOVERY — 3-LAYER UNIVERSAL PIPELINE
// Layer 1: PDF native outline (deterministic, 0 AI calls)
// Layer 2: TOC regex parser  (deterministic, 0 AI calls)
// Layer 3: Gemini full discovery (fallback)
// ─────────────────────────────────────────────────────────────

const DISCOVERY_PROMPT = `You are a book architect. Your ONLY job is to build the Blueprint for this book.

Analyze the text and return a raw JSON object (no markdown, no explanation) with exactly three fields:

{
  "masterChapters": [{"num": 1, "title": "The Challenge of the Future"}, ...],
  "authorPersona": "One sentence: the author's rhetorical style and sentence structure.",
  "powerWords": ["word1", "word2", "word3", "word4", "word5"]
}

━━━━━━━━━━━━━━━━━━━━━━
LEAF-NODE PROTOCOL — THIS OVERRIDES EVERYTHING ELSE
━━━━━━━━━━━━━━━━━━━━━━
PARTS are containers. Extract ONLY the leaf chapters inside each Part — never the Parts themselves.
WRONG: [{"num":1,"title":"PART ONE: Foundation"},{"num":2,"title":"PART TWO: Method"}]
RIGHT:  [{"num":1,"title":"Where It All Started"},{"num":2,"title":"What Is a Second Brain?"},{"num":3,"title":"Capture"},{"num":4,"title":"Organize"}]
- Preface / Introduction / Prologue / Foreword → {"num": 0, "title": "Introduction"}
- Conclusion / Epilogue / Afterword            → {"num": 99, "title": "Conclusion"}
- EXCLUDE: Index, Bibliography, Acknowledgments, About the Author, Copyright, Permissions.
- Be generous — missing a chapter is worse than including one extra.
━━━━━━━━━━━━━━━━━━━━━━

authorPersona: One sentence describing sentence structure and rhetorical style.
powerWords: Exactly 5 of the author's recurring metaphors, coined terms, or signature vocabulary.

Return ONLY the raw JSON object.`;

// ── Shared post-processing ───────────────────────────────────

const PART_FILTER = (e: TocEntry): boolean => {
  const lower = e.title.toLowerCase().trim();
  return !/^(part|parte|section|sección|unit|módulo|module|book|tema)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)/i.test(lower);
};

const NORMALIZE_ENTRY = (e: TocEntry): TocEntry => {
  const lower = e.title.toLowerCase().trim();
  if (/^(introduction|preface|prologue|foreword|prefacio|introducción)/.test(lower)) return { ...e, num: 0 };
  if (/^(conclusion|epilogue|afterword|epilogo|conclusión)/.test(lower)) return { ...e, num: 99 };
  return e;
};

// ── Layer 1: PDF Native Outline ──────────────────────────────

async function extractNativeOutline(buffer: ArrayBuffer): Promise<TocEntry[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require("pdf2json");
    const parser = new PDFParser();

    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parser.on("pdfParser_dataReady", (d: any) => resolve(d));
      parser.on("pdfParser_dataError", reject);
      parser.parseBuffer(Buffer.from(buffer));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bookmarks: any[] = (data as any)?.formImage?.Bookmarks ?? [];
    if (!bookmarks.length) return [];

    const chapters: TocEntry[] = [];
    let num = 1;
    for (const bm of bookmarks) {
      const title = decodeURIComponent((bm.title as string) ?? "").trim();
      if (title) chapters.push({ num: num++, title });
    }

    return chapters.filter(PART_FILTER).map(NORMALIZE_ENTRY);
  } catch {
    return [];
  }
}

// ── Layer 2: TOC Regex Parser ────────────────────────────────

function extractTocFromText(fullText: string): TocEntry[] {
  const tocPatterns = [/\bcontents\b/i, /\btable of contents\b/i, /\bíndice\b/i, /\bcontenido\b/i];
  let tocStart = -1;
  for (const pat of tocPatterns) {
    const match = fullText.search(pat);
    if (match !== -1 && (tocStart === -1 || match < tocStart)) tocStart = match;
  }
  if (tocStart === -1) return [];

  const tocRegion = fullText.slice(tocStart, tocStart + 8_000);
  const entries: TocEntry[] = [];

  for (const line of tocRegion.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) continue;

    // "Chapter N: Title" or "Chapter N  Title"
    const chapterMatch = trimmed.match(/^chapter\s+(\d+)[:\s]+(.+?)(?:\s*\.{2,}\s*\d+)?$/i);
    if (chapterMatch) {
      entries.push({ num: parseInt(chapterMatch[1]), title: chapterMatch[2].trim() });
      continue;
    }

    // "1. Title" or "1  Title" (1-2 digit prefix)
    const numberedMatch = trimmed.match(/^(\d{1,2})[.\s]\s+([A-Z].{3,60})(?:\s*\.{2,}\s*\d+)?$/);
    if (numberedMatch) {
      const title = numberedMatch[2].trim();
      if (!/^(part|parte|section)/i.test(title)) {
        entries.push({ num: parseInt(numberedMatch[1]), title });
      }
      continue;
    }

    // Standalone "Introduction" / "Conclusion" lines
    if (/^(introduction|preface|prologue|conclusion|epilogue)\b/i.test(trimmed) && trimmed.length < 50) {
      entries.push({ num: 0, title: trimmed.replace(/\s*\.{2,}\s*\d+$/, "").trim() });
    }
  }

  if (entries.length < 3) return [];

  return entries
    .filter(PART_FILTER)
    .map(NORMALIZE_ENTRY)
    .filter((e, i, arr) => arr.findIndex((x) => x.num === e.num) === i)
    .sort((a, b) => a.num - b.num);
}

// ── Layer 3: Gemini (fallback, with retries) ─────────────────

async function geminiDiscovery(
  ai: GoogleGenAI,
  fullText: string,
): Promise<{ masterChapters: TocEntry[]; authorPersona: string; powerWords: string[] }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) {
        const delay = attempt === 2 ? 5_000 : 15_000;
        console.log(`[Discovery] Layer 3 attempt ${attempt}, waiting ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
      const result = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: `${DISCOVERY_PROMPT}\n\nTEXT:\n${fullText.slice(0, 200_000)}`,
        config: { temperature: 0.1 },
      });
      let raw = (result.text ?? "").trim().replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
      const parsed = JSON.parse(raw) as { masterChapters?: TocEntry[]; authorPersona?: string; powerWords?: string[] };
      const masterChapters = (parsed.masterChapters ?? [])
        .filter((e) => typeof e.num === "number" && typeof e.title === "string")
        .filter(PART_FILTER)
        .map(NORMALIZE_ENTRY);
      console.log(`[Discovery] Layer 3 attempt ${attempt}: ${masterChapters.length} chapters`);
      return {
        masterChapters,
        authorPersona: parsed.authorPersona ?? "",
        powerWords: Array.isArray(parsed.powerWords) ? parsed.powerWords : [],
      };
    } catch (e) {
      console.error(`[Discovery] Layer 3 attempt ${attempt} failed:`, e);
    }
  }
  return { masterChapters: [], authorPersona: "", powerWords: [] };
}

async function geminiPersonaOnly(
  ai: GoogleGenAI,
  fullText: string,
): Promise<{ authorPersona: string; powerWords: string[] }> {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `From this book text, return ONLY raw JSON with two fields:
{"authorPersona": "One sentence describing the author's rhetorical style and sentence structure", "powerWords": ["word1","word2","word3","word4","word5"]}
No markdown. No preamble.\n\nTEXT:\n${fullText.slice(0, 50_000)}`,
      config: { temperature: 0.1 },
    });
    const raw = (result.text ?? "").trim().replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const p = JSON.parse(raw) as { authorPersona?: string; powerWords?: string[] };
    return { authorPersona: p.authorPersona ?? "", powerWords: Array.isArray(p.powerWords) ? p.powerWords : [] };
  } catch {
    return { authorPersona: "", powerWords: [] };
  }
}

// ── Main orchestrator ────────────────────────────────────────

async function runDiscovery(
  ai: GoogleGenAI,
  fullText: string,
  buffer: ArrayBuffer,
): Promise<{ masterChapters: TocEntry[]; authorPersona: string; powerWords: string[] }> {
  // Layer 1: PDF native outline
  const outlineChapters = await extractNativeOutline(buffer);
  console.log(`[Discovery] Layer 1 (Native Outline): ${outlineChapters.length} chapters`);
  if (outlineChapters.length >= 3) {
    const { authorPersona, powerWords } = await geminiPersonaOnly(ai, fullText);
    return { masterChapters: outlineChapters, authorPersona, powerWords };
  }

  // Layer 2: TOC regex
  const regexChapters = extractTocFromText(fullText);
  console.log(`[Discovery] Layer 2 (TOC Regex): ${regexChapters.length} chapters`);
  if (regexChapters.length >= 3) {
    const { authorPersona, powerWords } = await geminiPersonaOnly(ai, fullText);
    return { masterChapters: regexChapters, authorPersona, powerWords };
  }

  // Layer 3: Gemini
  console.log(`[Discovery] Layer 3 (Gemini): running...`);
  return geminiDiscovery(ai, fullText);
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
          await runDiscovery(ai, fullText, buffer);

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
