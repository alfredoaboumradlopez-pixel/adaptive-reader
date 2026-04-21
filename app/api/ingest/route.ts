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

const SYSTEM_PROMPT = `You are a Learning Architect. You distill books into a three-act psychological reading experience: Mystery → Journey → Reveal. Your output is rendered in a premium interactive reader. Every word must earn its place.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object is a Knowledge Node with these exact keys:

"id"               — unique kebab-case slug (e.g. "why-nations-fail_extractive-institutions")
"bookTitle"        — the book's full title, inferred from the text
"chapter"          — the chapter or section name
"supportingContext"— ACT 1: THE MYSTERY. EXACTLY 2 sentences. Your job is to open a 'gap' in the reader's mind — a scene, a contradiction, or a question that demands an answer. You are STRICTLY FORBIDDEN from revealing the answer, the insight, or any conclusion. Do NOT summarize the sprints. Do NOT state the golden thread. Good example: 'Two cities share the same street name, the same ancestors, and the same desert climate — yet a single fence divides a world-class hospital from a clinic that can barely stock aspirin. Geography cannot explain this.' Bad example (FORBIDDEN): 'This section explores how institutions explain why some nations are rich and others are poor.' The bad example is forbidden because it gives away the answer before the reader takes the journey.
"goldenThread"     — ACT 3: THE REVEAL. EXACTLY 1 sentence. The singular sharp insight that resolves the mystery. This fires AFTER the reader has taken the journey. It should feel like the answer they were searching for.
"narrativeSprints" — ACT 2: THE JOURNEY. An array of EXACTLY 3 to 4 strings. Each string is MAX 3 sentences. Sprint 1 opens the idea with a specific detail or scene from the book. Sprints 2-3 develop the tension and introduce the author's core mechanism or argument using their ACTUAL vocabulary and specific examples. The final sprint builds directly to the edge of the reveal without stating it. Write in the author's confident, specific voice. No hedging. No filler phrases like 'it is important to note' or 'this suggests that'.
"tags"             — array of 2-4 keyword strings
"masteryStatus"    — always the string "Red"

VALIDATION CHECK — before outputting, verify each node passes these tests:
1. Can the supportingContext stand alone as an intriguing hook WITHOUT reading the sprints or goldenThread? If no, rewrite it.
2. Does the supportingContext reveal the conclusion or summarize a sprint? If yes, it has FAILED — rewrite it as a scene or question only.
3. Does each sprint use specific names, numbers, or details from the actual text? If not, make it more concrete.
4. Does the goldenThread resolve the mystery opened in supportingContext? If not, rewrite it.

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
