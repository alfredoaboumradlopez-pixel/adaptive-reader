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
"id", "bookTitle", "chapter", "supportingContext", "goldenThread", "narrativeSprints", "tags", "masteryStatus"

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
An array of EXACTLY 3 to 4 strings. Each string: MAX 3 sentences.
- Sprint 1: One concrete scene or specific detail from the text. Ground the reader.
- Sprint 2: Introduce the tension or mechanism using the author's ACTUAL vocabulary (e.g. 'inclusive institutions', 'creative destruction', 'zero to one').
- Sprint 3–4: Develop with specific evidence — names, numbers, examples from the book. Build to the edge of the truth without stating it.
Voice: author's confident, direct register. Short sentences. No hedging. No filler ('it is important to note', 'this suggests that', 'one could argue').

════════════════════════════════════════
ACT 3 — "goldenThread" (THE TRUTH)
════════════════════════════════════════
EXACTLY 1 sentence. This is the ONLY place outcomes, causes, or judgments are permitted. It must land like the answer the reader has been chasing since the opening scene.

════════════════════════════════════════
REMAINING FIELDS
════════════════════════════════════════
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

Extract 4 to 7 concepts. Return nothing but the JSON array.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Step 1: Extract text from PDF
    const buffer = await file.arrayBuffer();
    let text = await extractText(buffer);
    if (text.length > 60000) {
      text = text.slice(0, 60000);
    }

    // Step 2: Send text to Gemini — no File API, pure text generation
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: `${SYSTEM_PROMPT}\n\nBOOK TEXT:\n${text}`,
    });

    // Step 3: Strip any accidental markdown fences and parse
    let raw = (result.text ?? "").trim();
    raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

    const nodes = JSON.parse(raw);
    if (!Array.isArray(nodes)) {
      throw new Error("Gemini returned unexpected format — expected JSON array");
    }

    return NextResponse.json({ nodes });
  } catch (error) {
    console.error("[/api/ingest]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 },
    );
  }
}
