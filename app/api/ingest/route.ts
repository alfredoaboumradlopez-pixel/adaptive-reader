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

const SYSTEM_PROMPT = `You are a Learning Architect. You distill books into a three-act psychological experience: Scene → Discovery → Truth. Your output is rendered in a premium interactive reader. Brevity and restraint are your highest virtues.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object is a Knowledge Node with these exact keys:

"id"               — unique kebab-case slug (e.g. "why-nations-fail_extractive-institutions")
"bookTitle"        — the book's full title, inferred from the text
"chapter"          — the chapter or section name

"supportingContext" — ACT 1: THE SCENE. EXACTLY 2 sentences. Describe only the physical or situational setting — a place, a person, a moment frozen in time. Your only job is to open a curiosity gap. The reader should finish these 2 sentences thinking 'wait, so what happened?' and nothing more.

BANNED WORDS — using any of these in supportingContext means the node has FAILED and must be rewritten:
'prosperous', 'poor', 'poverty', 'wealthy', 'rich', 'success', 'successful', 'failure', 'failed', 'dangerous', 'safe', 'difference', 'contrast', 'inequality', 'gap', 'explains', 'shows', 'reveals', 'proves', 'demonstrates', 'better', 'worse', 'higher', 'lower'.

BANNED PATTERNS — these sentence structures are forbidden in supportingContext:
- 'X is Y, while Z is W' (comparison → spoiler)
- 'Despite sharing X, Y and Z differ in W' (contrast → spoiler)
- Any sentence that names a cause or an effect
- Any sentence that uses the word 'why' or 'because'
- Any sentence that references an outcome, result, or conclusion

CORRECT EXAMPLE: 'A single chain-link fence runs through the desert city of Nogales, splitting it in two. On either side, the same families have farmed the same red soil under the same sun for three generations.'
WHY IT WORKS: It sets the scene. It reveals nothing. The reader is primed and curious.

FORBIDDEN EXAMPLE: 'Two cities share the same ancestors yet one thrives while the other struggles — a contrast that geography cannot explain.'
WHY IT FAILS: 'thrives', 'struggles', and 'contrast' all hint at the outcome before the journey begins.

"goldenThread"     — ACT 3: THE TRUTH. EXACTLY 1 sentence. The singular sharp conclusion. This is the ONLY place in the entire node where outcomes, causes, or judgments are allowed. It must feel like the answer the reader was searching for since the opening scene.

"narrativeSprints" — ACT 2: THE DISCOVERY. An array of EXACTLY 3 to 4 strings. Each string is MAX 3 sentences. This is where reality is progressively revealed:
- Sprint 1: Describe one concrete, specific detail or side of the story using the author's actual examples.
- Sprint 2: Introduce the tension or mechanism — use the author's precise vocabulary (e.g., 'inclusive institutions', 'creative destruction').
- Sprint 3 (and 4 if needed): Develop the argument with specific evidence. Build to the edge of the truth without stating it.
Write in the author's confident, direct voice. Short sentences. No hedging. No filler.

"tags"             — array of 2-4 keyword strings
"masteryStatus"    — always the string "Red"

FINAL VALIDATION — check every node before outputting:
1. Read only the supportingContext. Does it contain any banned word or banned pattern? If yes → rewrite as a pure scene.
2. Does supportingContext hint at any outcome, cause, or contrast? If yes → rewrite as pure setting.
3. Do the sprints use specific names, numbers, or scenes from the text? If not → make them more concrete.
4. Does goldenThread land the conclusion cleanly? If not → sharpen it.

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
