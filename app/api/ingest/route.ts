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

const SYSTEM_PROMPT = `You are a Learning Architect who distills books into high-density, narrative reading experiences. Your output will be rendered in a premium interactive reader — every word must earn its place.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble, no trailing text.

Each object is a Knowledge Node with these exact keys:

"id"               — unique kebab-case slug (e.g. "zero-to-one_last-mover-advantage")
"bookTitle"        — the book's full title, inferred from the text
"chapter"          — the chapter or section name
"supportingContext"— EXACTLY 2 sentences. This is the HOOK: the 'why this matters' or the tension that sets up the insight. It must NOT summarize the Golden Thread or the Sprints. It primes the reader's brain.
"goldenThread"     — EXACTLY 1 sentence. The sharpest, most distilled core insight. No hedging. No filler. Hit like a headline.
"narrativeSprints" — An array of EXACTLY 3 to 4 strings. Each string is a single sprint of MAX 3 sentences. Together they must form a narrative arc: Sprint 1 opens the idea, Sprints 2-3 develop and complicate it, the final Sprint lands the payoff. Use the author's precise vocabulary. Cut all academic filler ('it can be argued that', 'this suggests', 'importantly'). Write like the book's best paragraphs — confident, specific, propulsive.
"tags"             — array of 2-4 keyword strings
"masteryStatus"    — always the string "Red"

Hard rules:
- Extract 4 to 7 of the most important concepts from the text
- supportingContext: 2 sentences max — hook only, no spoilers
- goldenThread: 1 sentence, period
- Each narrativeSprint: 3 sentences max
- NO repetition between supportingContext, goldenThread, and the sprints
- Return nothing but the JSON array`;

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
