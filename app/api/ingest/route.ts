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

const SYSTEM_PROMPT = `You are a Learning Architect. Your job is to transform raw book text into a structured knowledge graph.

Return ONLY a raw JSON array — no markdown, no code fences, no backticks, no preamble.

Each object in the array is a Knowledge Node with these exact keys:
- "id": unique kebab-case slug (e.g. "atomic-habits_ch2_habit-loop")
- "bookTitle": the full title of the book, inferred from the text
- "chapter": the chapter or section name this concept comes from
- "supportingContext": 2-3 sentences that build up context before the insight
- "goldenThread": the core thesis or 'Aha!' insight — 1-2 punchy sentences
- "narrativeSprints": array of exactly 3-4 flowing paragraph strings that distill the author's narrative
- "tags": array of 2-4 keyword strings
- "masteryStatus": always the string "Red"

Rules:
- Extract 4-7 of the most important concepts
- Preserve the author's voice in narrativeSprints
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
