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
ANTI-HALLUCINATION: Only include chapters you can VERIFY exist in the provided text. If you see a chapter title in the TOC but cannot find any content for it in the text, still include it in masterChapters — the extraction phase will handle it. NEVER invent chapter titles that are not present in the TOC or the text itself. If you are unsure whether something is a real chapter, exclude it.
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
  // Search for TOC anywhere in the first 150k chars
  const searchRegion = fullText.slice(0, 150_000);
  const lower = searchRegion.toLowerCase();

  let tocStart = -1;
  for (const marker of ["table of contents", "contents\n", "\ncontents\n", "índice\n", "contenido\n"]) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (tocStart === -1 || idx < tocStart)) tocStart = idx;
  }
  if (tocStart === -1) return [];

  const tocRegion = searchRegion.slice(tocStart, tocStart + 10_000);
  const lines = tocRegion.split("\n").map((l) => l.trim()).filter(Boolean);
  const entries: TocEntry[] = [];

  for (const line of lines) {
    if (/^(part|parte|section|sección)\s+(one|two|three|four|five|\d+)/i.test(line)) continue;
    if (line.length < 5 || /^\d+$/.test(line)) continue;
    if (/^(index|bibliography|acknowledgment|about the author|notes|appendix)/i.test(line)) continue;

    const chMatch = line.match(/^chapter\s+(\d+)[:\s—–-]+(.+?)(?:\s*\.{2,}\s*\d+)?$/i);
    if (chMatch) {
      entries.push({ num: parseInt(chMatch[1]), title: chMatch[2].replace(/\.{2,}\s*\d+$/, "").trim() });
      continue;
    }

    const numMatch = line.match(/^(\d{1,2})[.\s:—–]\s*([A-Z].{4,70})(?:\s*\.{2,}\s*\d+)?$/);
    if (numMatch) {
      const title = numMatch[2].replace(/\.{2,}\s*\d+$/, "").trim();
      if (title.length > 4) entries.push({ num: parseInt(numMatch[1]), title });
      continue;
    }

    if (/^(introduction|preface|prologue|conclusion|epilogue|afterword)\b/i.test(line) && line.length < 60) {
      const isIntro = /^(introduction|preface|prologue)/i.test(line);
      entries.push({ num: isIntro ? 0 : 99, title: line.replace(/\.{2,}\s*\d+$/, "").trim() });
    }
  }

  const result = entries
    .filter(PART_FILTER)
    .map(NORMALIZE_ENTRY)
    .filter((e, i, arr) => arr.findIndex((x) => x.num === e.num) === i)
    .sort((a, b) => a.num - b.num);

  console.log(`[Discovery] Layer 2 TOC found at char ${tocStart}, extracted ${result.length} chapters`);
  return result.length >= 3 ? result : [];
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
        contents: (() => {
          const FULL_BOOK_CAP = 800_000;
          const discoveryText = fullText.length <= FULL_BOOK_CAP ? fullText : fullText.slice(0, FULL_BOOK_CAP);
          return `${DISCOVERY_PROMPT}\n\nTEXT:\n${discoveryText}`;
        })(),
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

function findChapterStart(fullText: string, chapter: TocEntry, scanFrom = 0): number {
  const lower = fullText.toLowerCase();
  const titleLower = chapter.title.toLowerCase();
  const searchFrom = Math.max(scanFrom, Math.min(8_000, Math.floor(fullText.length * 0.05)));
  const footnoteZoneStart = Math.floor(fullText.length * 0.85);

  // Build whitespace-tolerant regex: each space → \s+ to handle line-wrapped headings
  const escaped = titleLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexiblePattern = escaped.replace(/\s+/g, "\\s+");
  let titleRegex: RegExp;
  try {
    titleRegex = new RegExp(flexiblePattern, "g");
  } catch {
    titleRegex = new RegExp("(?!x)x");
  }

  const occurrences: number[] = [];
  titleRegex.lastIndex = searchFrom;
  let match: RegExpExecArray | null;
  while ((match = titleRegex.exec(lower)) !== null) {
    occurrences.push(match.index);
    if (match.index === titleRegex.lastIndex) titleRegex.lastIndex++;
  }

  // Prefer body occurrences (before footnote zone)
  const bodyOccurrences = occurrences.filter((idx) => idx < footnoteZoneStart);
  if (bodyOccurrences.length > 0) return bodyOccurrences[0];

  // Fallback: chapter number patterns in body
  const numberPatterns = [
    `chapter ${chapter.num}\n`, `chapter ${chapter.num} `, `chapter ${chapter.num}:`,
    `\nchapter ${chapter.num}`, `\n${chapter.num}\n`, `\n${chapter.num} `,
    `\n${chapter.num}. `, `\n${chapter.num}: `,
  ];
  for (const pat of numberPatterns) {
    const numIdx = lower.indexOf(pat, searchFrom);
    if (numIdx !== -1 && numIdx < footnoteZoneStart) return numIdx;
  }

  if (occurrences.length > 0) return occurrences[0];
  return -1;
}

const WINDOW_OVERLAP = 10_000;

function findChapterWindow(
  fullText: string,
  chapter: TocEntry,
  nextChapter: TocEntry | null,
): string {
  const startIdx = findChapterStart(fullText, chapter);
  if (startIdx === -1) {
    console.warn(`[Sniper] Ch ${chapter.num} "${chapter.title}" — not found in text`);
    return "";
  }

  console.log(`[Sniper] Ch ${chapter.num} found at char ${startIdx} (${Math.round(startIdx / 1000)}k of ${Math.round(fullText.length / 1000)}k)`);

  const windowStart = Math.max(0, startIdx - 500);
  const MINIMUM_WINDOW = 40_000;
  const MAXIMUM_WINDOW = 90_000;

  let endIdx = startIdx + MAXIMUM_WINDOW;

  if (nextChapter) {
    const nextStart = findChapterStart(fullText, nextChapter);
    if (nextStart !== -1 && nextStart > startIdx + 200) {
      console.log(`[Sniper] Ch ${chapter.num} boundary: ${Math.round(startIdx / 1000)}k → ${Math.round(nextStart / 1000)}k`);
      const surroundingText = fullText.slice(Math.max(0, nextStart - 50), nextStart + 200);
      const isPartBoundary = surroundingText.split("\n").some((line) => PART_HEADER_RE.test(line));
      if (isPartBoundary) {
        // Part boundary — ignore as chapter limit, use maximum window
        endIdx = startIdx + MAXIMUM_WINDOW;
      } else {
        const boundaryEnd = nextStart + 2_000;
        // Enforce minimum window even if next chapter is very close
        endIdx = Math.max(startIdx + MINIMUM_WINDOW, boundaryEnd);
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
  return `ANTI-HALLUCINATION RULES — MANDATORY:
1. You are extracting content from the CHAPTER TEXT provided below. Every fact, anecdote, name, number, and quote MUST come from that text.
2. If the chapter text is too short or empty, return null — do NOT invent content.
3. NEVER invent stories, examples, statistics, or insights not present in the text.
4. If you cannot find at least 3 paragraphs of real content for this chapter, respond with exactly: {"hallucination_guard": true}
5. The narrativeSprints must quote or closely paraphrase actual sentences from the chapter text. If you find yourself writing something that isn't in the text, STOP.

You are extracting exactly ONE chapter from a book.

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
  "level": 1,
  "authorQuote": "[cita textual exacta del autor, o null si no hay una clara]",
  "keyMechanism": "[NombreConcepto → definición en una línea]",
  "socraticQuestion": "[pregunta conceptual profunda que requiere haber leído los sprints]"
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
VOICE PRESERVATION — MANDATORY:
Before writing any sprint, identify the grammatical person the author uses in the chapter text:
- First person ("I", "my", "we", "our") → write all sprints in first person
- Third person ("he", "she", "they", "his", "her") → write all sprints in third person
- Second person ("you", "your") → write all sprints in second person

NEVER convert between persons. If the author writes "I joined the Peace Corps",
the sprint must say "I joined the Peace Corps" — not "he joined the Peace Corps".
If the author writes "the protagonist discovered", the sprint must say
"the protagonist discovered" — not "I discovered".

This is the most important voice rule. Violating it destroys the author's DNA.

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

━━━━━━━━━━━━━━━━━━━━━━
NEW FIELDS — ADDITIVE
━━━━━━━━━━━━━━━━━━━━━━
"authorQuote": A VERBATIM quote from the chapter text — the author's exact words, in quotation marks.
- Must be a real sentence or phrase from the chapter text provided
- Maximum 2 sentences
- Choose a phrase that captures the chapter's philosophy or a memorable insight
- If no clear quotable sentence exists, return null
- NEVER invent or paraphrase — verbatim only
GOOD: "We only know what we make." (if this exact phrase appears in the text)
BAD: "Forte says that making things helps us learn" (that's paraphrase, not a quote)

"keyMechanism": The central concept or tool introduced in this chapter, in format:
"ConceptName → one-line definition using the author's own vocabulary"
Examples:
- "PARA → organizes information by actionability rather than category"
- "Progressive Summarization → distills notes in layers to make knowledge rediscoverable"
- "Intermediate Packets → discrete, reusable units of work assembled into final products"
If the chapter doesn't introduce a named mechanism, describe the core insight:
- "Resonance → the intuitive signal that something is worth capturing"

"socraticQuestion": One conceptual question that can ONLY be answered after understanding the chapter.
NOT trivia. NOT "what is X called?"
YES: deep conceptual questions that require synthesis.
Examples:
- "Why does organizing information by topic create digital graveyards instead of useful knowledge?"
- "What is the difference between consuming information and expressing it, and why does it matter for memory?"
- "Why is the feeling of resonance a more reliable capture filter than analytical checklists?"

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
    config: { temperature: 0.2, timeout: 120_000 },
  });

  let raw = (result.text ?? "").trim();
  raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Hallucination guard: model signals insufficient content
  if (parsed.hallucination_guard === true) {
    console.warn(`[extractChapter] Ch ${chapter.num} "${chapter.title}" — insufficient text, skipping`);
    return null;
  }

  // Content density check
  const sprints = Array.isArray(parsed.narrativeSprints) ? parsed.narrativeSprints : [];
  if (sprints.length === 0) return null;
  const validSprints = sprints.filter((s: unknown) => typeof s === "string" && (s as string).length >= 100);
  if (validSprints.length === 0) {
    console.warn(`[extractChapter] Ch ${chapter.num} — sprints too short, likely hallucinated`);
    return null;
  }

  const goldenThread = typeof parsed.goldenThread === "string" ? parsed.goldenThread.trim() : "";
  if (!goldenThread || goldenThread.length < 30) {
    console.warn(`[extractChapter] Ch ${chapter.num} — missing or weak goldenThread`);
    return null;
  }

  console.log(`[extractChapter] Ch ${chapter.num} "${chapter.title}" — passed all guards, emitting node`);

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
              console.error(
                `[POST] Ch ${chapter.num} "${chapter.title}" FAILED at char ${
                  fullText.toLowerCase().indexOf(chapter.title.toLowerCase())
                } — ${e instanceof Error ? e.message : String(e)}`
              );
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
