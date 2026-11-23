export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getSession, ArchitectureEntry, Depth } from "@/lib/ingest-session";
import { findMarkerWindow } from "@/lib/marker-utils";

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

/** Characters above this threshold trigger the "extended chapter" notice
 *  and trim the window to keep Gemini response time under control. */
const LONG_CHAPTER_THRESHOLD = 25_000;

// ─────────────────────────────────────────────────────────────
// DEPTH BLOCK — cognitive register for sprints, primer & thread
// ─────────────────────────────────────────────────────────────

function buildDepthBlock(
  depth: Depth,
  personaProfile: string,
  powerWords: string[],
): string {
  const pw =
    powerWords.length > 0 ? powerWords.map((w) => `"${w}"`).join(", ") : "";

  if (depth === "simple") {
    return `
━━━━━━━━━━━━━━━━━━━━━━
DEPTH PROTOCOL: SIMPLE — The Kid
━━━━━━━━━━━━━━━━━━━━━━
Audience: A curious, intelligent 10-year-old who wants to genuinely understand — not be talked down to.
Vocabulary: Top-2,000 common words ONLY. Replace every technical term before writing a single sentence.

MANDATORY SUBSTITUTIONS (use the simpler column, always):
  "Standards"       → "Rules"
  "Revenue"         → "Money"
  "Protocols"       → "Steps"
  "Personnel"       → "Team" or "People"
  "Audit"           → "Check"
  "Inefficiency"    → "Problem" or "Waste"
  "Compensate"      → "Pay"
  "Metrics"         → "Numbers"
  "Strategy"        → "Plan"
  "Implement"       → "Do" or "Start"

Method: Ground every abstract idea in a concrete analogy from everyday life.
  EXAMPLES — "compounding interest" → "money that grows like a snowball rolling downhill"
             "market monopoly" → "being the only ice cream shop on the street"
Sentence length: Under 15 words per sentence. Short. Punchy. Direct.
Tone: Like a brilliant older sibling who is genuinely excited about this idea.
${pw ? `Power Words (${pw}): Translate the MEANING. The insight must survive, the jargon must die.` : "Translate all technical terms into everyday equivalents."}
FORBIDDEN: Any word requiring a dictionary, passive voice, sentences over 20 words, academic hedging.`;
  }

  if (depth === "deep") {
    return `
━━━━━━━━━━━━━━━━━━━━━━
DEPTH PROTOCOL: DEEP — The Soul
━━━━━━━━━━━━━━━━━━━━━━
This is a Soul Transfer. The author is speaking directly into the reader's mind — not explaining, confronting.
Voice: ${personaProfile || "Philosophical, precise, and rhetorically charged."}

MANDATORY VOCABULARY ELEVATION (use the weightier column, always):
  "Belief system"      → "Theology"
  "Decline"            → "Stagnation"
  "Hope"               → "Indefinite Optimism"
  "Innovation"         → "Zero-to-One"
  "Market leadership"  → "Creative Monopoly"
  "Assumption"         → "Dogma"
  "Failure"            → "Entropy"
  "Growth"             → "Compounding"
  "Competitive market" → "Race to zero"

Method: Ask WHY before HOW. Deploy rhetorical questions to create intellectual friction.
  RIGHT  — "If competition is celebrated as virtue, who profits most from the distraction?"
  WRONG  — "Companies should avoid competitive markets."
Second-person address preferred: "You are not choosing a market — you are choosing a future."
${pw ? `Power Words (${pw}): These are sacred texts. Each must appear in the sprint that owns it. Never paraphrase, never omit.` : "Use the author's exact coined vocabulary — every key term is a philosophical anchor."}
Sentence style: Longer, rhythmically varied. Let complexity breathe — simplification is a betrayal here.
Tone: Private, confrontational, intellectually demanding. The reader should feel addressed, not lectured.
Golden thread: A philosophical statement that reframes how the reader understands all 4 pillars — not a summary.
FORBIDDEN: "In summary," "this shows that," "it is important to note," any sentence that could appear in a Wikipedia article.`;
  }

  // default: "detailed"
  return `
━━━━━━━━━━━━━━━━━━━━━━
DEPTH PROTOCOL: DETAILED — The Architect
━━━━━━━━━━━━━━━━━━━━━━
Voice: ${personaProfile || "Technical, professional, and precise."}
Method: Mechanics-first. Focus on HOW and WHAT — data-dense and actionable.
${pw ? `Power Words (${pw}): Use at least one in each sprint.` : "Use the author's professional vocabulary throughout."}
Sentence style: Dense but clear. Every sentence carries load — zero filler.
Tone: Authoritative and direct. Professional register throughout.
Golden thread: The precise insight that explains why the mechanics of all 4 pillars matter together.
FORBIDDEN: Oversimplifying analogies, hedging language, passive constructions, filler phrases.`;
}

// ─────────────────────────────────────────────────────────────
// EXTRACTION PROMPT — SEMANTIC X-RAY (SOP v9.0 + v10.0)
// ─────────────────────────────────────────────────────────────

function buildExtractionPrompt(
  marker: ArchitectureEntry,
  nextMarker: ArchitectureEntry | null,
  markerType: string,
  personaProfile: string,
  powerWords: string[],
  isLongChapter: boolean,
  depth: Depth,
): string {

  const boundaryEndLine = nextMarker
    ? `STOP when you reach the header for ${markerType} ${nextMarker.sequence}: "${nextMarker.title}" (anchor: "${nextMarker.anchor}"). Do not extract content from that ${markerType.toLowerCase()} or beyond.`
    : `This is the final ${markerType} — extract until the end of the document.`;

  const earlyChapterWarning =
    marker.sequence <= 1
      ? `
⚠️ EARLY ${markerType.toUpperCase()} WARNING
The Table of Contents near the front of the document also references this ${markerType.toLowerCase()} by name.
That TOC entry is followed only by a page number — IGNORE IT COMPLETELY.
Find the ACTUAL ${markerType} heading followed by multiple paragraphs of prose.
The anchor text "${marker.anchor}" guides you to the correct location.
`
      : "";

  const longChapterNotice = isLongChapter
    ? `
⚠️ EXTENDED CHAPTER — PRIORITISE DEPTH OVER BREADTH
This chapter is unusually long. Before mapping pillars, mentally identify the 4 MOST
IMPORTANT arguments or examples in the text. Anchor your sprints to those 4 — do not
attempt to cover every detail. Distil the core signal; ignore supporting noise.
`
    : "";


  return `You are extracting the COMPLETE content of exactly ONE ${markerType} from a document.
${earlyChapterWarning}${longChapterNotice}
━━━━━━━━━━━━━━━━━━━━━━
TARGET & SNIPER BOUNDARIES
━━━━━━━━━━━━━━━━━━━━━━
Target ${markerType}: ${marker.sequence}: ${marker.title}
Start anchor (first words of this ${markerType.toLowerCase()}'s body): "${marker.anchor}"
${boundaryEndLine}

SNIPER RULE: Locate the start anchor. Extract EVERY paragraph, example, story, and data
point between the start anchor and the stop boundary. Do not skip anything.

━━━━━━━━━━━━━━━━━━━━━━
⚠️  ONE-NODE RULE (ABSOLUTE)
━━━━━━━━━━━━━━━━━━━━━━
ONE ${markerType.toLowerCase()} → ONE JSON object. NEVER an array.
Every sub-header, call-out box, bold section title, and internal division found between
the boundaries is FUEL for the Narrative Sprints. They do NOT become separate objects.
Sub-headers are distinct intellectual territories — absorb each one into its own Sprint,
never merge two unrelated sub-headers into one Sprint.

━━━━━━━━━━━━━━━━━━━━━━
PRE-SYNTHESIS AUDIT — execute this BEFORE writing a single word of JSON
━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — MAP 4 DISTINCT PILLARS FROM SUB-HEADERS
Scan the chapter text for section headings, bold sub-topics, and numbered lists.
Identify exactly 4 UNIQUE conceptual sub-topics. Each must occupy different intellectual
territory — not a variation, synonym, or subset of another.

GOOD pillars: "4-Step Planning Process" / "Sales Delegation" / "Cost Benchmarks" / "Technology Stack"
FORBIDDEN: "Sales Control" + "Sales Techniques" (same territory, different label — illegal)
FORBIDDEN: "Efficiency" + "Waste Reduction" (one is a subset of the other — illegal)
FORBIDDEN: "Cost Control" as the anchor for more than ONE sprint under any circumstances

STEP 1b — LINGUISTIC ANCHOR (key terms from sub-headers)
For each pillar, identify its KEY TERM — the exact phrase from the sub-header.
LINGUISTIC LOCK (zero exceptions):
  • Sprint 1's Key Term and all its synonyms are BANNED as the primary anchor of Sprints 2, 3, 4.
  • Sprint 2's Key Term must come from a DIFFERENT sub-header than Sprint 1's.
  • And so on — four sprints require four completely distinct sub-header anchors.

CORRECT example:
  Sprint 1 anchor → "Establishing Standards"  (covers standards-setting only)
  Sprint 2 anchor → "Training Protocols"       (covers team education — never re-opens "standards")
  Sprint 3 anchor → "Monitoring Systems"       (covers tracking — never re-opens "training" or "standards")
  Sprint 4 anchor → "Technology Platforms"     (covers tools — distinct from all prior)

FORBIDDEN example:
  Sprint 1: "Cost Control"
  Sprint 2: "Controlling Costs via Delegation" ← ILLEGAL — same concept, renamed

STEP 2 — MANDATORY ALLOCATION (no exceptions)
Sprint 1 MUST focus exclusively on Pillar A (Key Term A).
Sprint 2 MUST focus exclusively on Pillar B (Key Term B).
Sprint 3 MUST focus exclusively on Pillar C (Key Term C).
Sprint 4 MUST focus exclusively on Pillar D (Key Term D).

EXAMPLE ANTI-REDUNDANCY LAW: If a specific named example, person, anecdote, or statistic
appears in Sprint 1 (e.g. "the Koi restaurant," "Reed Hastings' offer"), that exact item
is BANNED from Sprints 2, 3, or 4. Every sprint deploys DIFFERENT source material.

STEP 3 — CONNECT IN THE GOLDEN THREAD
The goldenThread is NOT a summary of any one sprint.
It is the conceptual BRIDGE that explains HOW all 4 pillars unite into a single
overarching insight — the "Aha!" that none of the individual sprints can express alone.

SELF-CHECK (mandatory before writing JSON):
□ Are the 4 Key Terms from 4 DIFFERENT sub-headers?
□ Does each sprint stay locked to its assigned Key Term?
□ Does any named example appear in more than one sprint? If yes → rewrite that sprint now.

━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━
Return a SINGLE raw JSON object — no markdown, no preamble:
{
  "id": "[book-slug]-${marker.sequence}",
  "bookTitle": "[the document's exact title as printed in the text]",
  "chapter": "${marker.sequence}: ${marker.title}",
  "supportingContext": "[EXACTLY 2 sentences — scene-setting only]",
  "goldenThread": "[EXACTLY 1 sentence — the conceptual bridge across all 4 pillars]",
  "narrativeSprints": ["[sprint 1 — Pillar 1]", "[sprint 2 — Pillar 2]", "[sprint 3 — Pillar 3]", "[sprint 4 — Pillar 4]"],
  "tags": ["keyword1", "keyword2"],
  "masteryStatus": "Red",
  "level": 1
}

━━━━━━━━━━━━━━━━━━━━━━
PRIMER — "supportingContext" — EXACTLY 2 SENTENCES
━━━━━━━━━━━━━━━━━━━━━━
Set the scene BEFORE the story begins. No outcomes. No spoilers.
Sentence 1: A concrete fact, person, place, or moment from the ${markerType.toLowerCase()}.
Sentence 2: A detail that opens a gap — the reader must cross it to find the answer.

FORBIDDEN in supportingContext:
'${markerType}', 'Section', 'Summarize', 'unlike', 'whereas', 'but', 'yet', 'however',
'while', 'though', 'although', 'despite', 'success', 'failure', 'better', 'worse',
'explains', 'reveals', 'shows', 'proves', 'conclusion'.

━━━━━━━━━━━━━━━━━━━━━━
SPRINTS — "narrativeSprints" — EXACTLY 4 STRINGS
━━━━━━━━━━━━━━━━━━━━━━
Each sprint: EXACTLY 4 to 5 sentences of flowing prose. NO bullets. NO numbered lists.
Each sprint covers ONE pillar — a different intellectual territory from every other sprint.
Cover the FULL sniper range — every sub-section between the boundaries appears in a sprint.

Sprint 1 (Pillar 1): Open with a concrete, tactile scene — a place, a person, a number.
Sprint 2 (Pillar 2): Name the core mechanism. Prioritise the vocabulary mandated by the Depth Protocol below.
Sprint 3 (Pillar 3): Develop with specific evidence — names, numbers, anecdotes from the text.
Sprint 4 (Pillar 4): Push to the edge of the truth without stating the final conclusion outright.

${buildDepthBlock(depth, personaProfile, powerWords)}

FORBIDDEN phrases (all depths): 'it is important to note', 'this suggests that', 'one could argue', 'in summary', 'overall'.

FINAL AUDIT before returning: Confirm each sprint covers a distinct pillar and no named
example appears in more than one sprint. Rewrite any violation before returning.

━━━━━━━━━━━━━━━━━━━━━━
GOLDEN THREAD — "goldenThread" — EXACTLY 1 SENTENCE
━━━━━━━━━━━━━━━━━━━━━━
Must be the bridge that explains HOW all 4 pillars connect — not a summary of any one sprint.
Must resolve the curiosity gap opened by supportingContext.
The ONLY field where outcomes, causes, or judgments are permitted.

━━━━━━━━━━━━━━━━━━━━━━
OTHER FIELDS
━━━━━━━━━━━━━━━━━━━━━━
"id": [book-slug]-${marker.sequence}
  book-slug = bookTitle lowercased, spaces→hyphens, non-alphanumeric stripped
  EXAMPLE: "Zero to One" → "zero-to-one-${marker.sequence}"

"level":
  0 = Introduction, Preface, or Prologue
  1 = core narrative / conceptual ${markerType.toLowerCase()}
  2 = deep-dive, technical, or appendix ${markerType.toLowerCase()}

Return ONLY the raw JSON object. No markdown. No array. No preamble.`;
}

// ─────────────────────────────────────────────────────────────
// SINGLE-MARKER EXTRACTION
// ─────────────────────────────────────────────────────────────

async function extractMarker(
  ai: GoogleGenAI,
  marker: ArchitectureEntry,
  nextMarker: ArchitectureEntry | null,
  markerText: string,
  personaProfile: string,
  powerWords: string[],
  markerType: string,
  depth: Depth,
): Promise<Record<string, unknown> | null> {
  const isLongChapter = markerText.length > LONG_CHAPTER_THRESHOLD;

  // Trim oversized windows to keep Gemini latency predictable for long chapters
  const textToSend = isLongChapter
    ? markerText.slice(0, LONG_CHAPTER_THRESHOLD)
    : markerText;

  // Scale output tokens to chapter size so the 10-Bit Soul is never cut off mid-sentence
  const maxOutputTokens = isLongChapter ? 16_384 : 8_192;

  const prompt = buildExtractionPrompt(
    marker,
    nextMarker,
    markerType,
    personaProfile,
    powerWords,
    isLongChapter,
    depth,
  );

  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `${prompt}\n\nTEXT (sniper window):\n${textToSend}`,
    config: { temperature: 0.2, maxOutputTokens },
  });

  let raw = (result.text ?? "").trim();
  raw = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Validation: golden thread present, 4 distinct sprints
  const goldenThread =
    typeof parsed.goldenThread === "string" ? parsed.goldenThread.trim() : "";
  const sprints = Array.isArray(parsed.narrativeSprints) ? parsed.narrativeSprints : [];
  if (!goldenThread || sprints.length < 3) return null;

  // id and bookTitle are overridden at the call site using canonical session values
  return {
    ...parsed,
    id: `__pending__-${marker.sequence}`,
    chapter: `${marker.sequence}: ${marker.title}`,
  };
}

// ─────────────────────────────────────────────────────────────
// POST HANDLER
// ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      sequenceIndex?: number;
    };
    const { sessionId, sequenceIndex } = body;

    if (!sessionId || sequenceIndex === undefined) {
      return NextResponse.json(
        { error: "Missing sessionId or sequenceIndex" },
        { status: 400 },
      );
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session expired or not found. Re-upload the PDF." },
        { status: 404 },
      );
    }

    const {
      fullText,
      documentArchitecture,
      personaProfile,
      powerWords,
      markerType,
      bookTitle: canonicalBookTitle,
      bookSlug: canonicalBookSlug,
      depth,
    } = session;

    const marker = documentArchitecture[sequenceIndex];
    if (!marker) {
      return NextResponse.json({ error: "Invalid sequenceIndex" }, { status: 400 });
    }

    const nextMarker = documentArchitecture[sequenceIndex + 1] ?? null;
    const markerText = findMarkerWindow(fullText, marker, nextMarker, markerType);

    if (!markerText) {
      console.warn(
        `[extract] ✗ No window for ${markerType} ${marker.sequence}: "${marker.title}"`,
      );
      return NextResponse.json({
        skip: true,
        reason: `Could not locate "${marker.title}" in the extracted text`,
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const node = await extractMarker(
          ai,
          marker,
          nextMarker,
          markerText,
          personaProfile,
          powerWords,
          markerType,
          depth ?? "detailed",
        );

        // Canonical identity lock — override whatever Gemini returned
        if (node) {
          node.bookTitle = canonicalBookTitle;
          node.id = `${canonicalBookSlug}-${marker.sequence}`;
        }

        if (node) {
          console.log(`[extract] ✓ ${markerType} ${marker.sequence}: ${marker.title}`);
          return NextResponse.json({ node });
        }
      } catch (e) {
        if (attempt === 2) {
          console.warn(`[extract] ✗ ${markerType} ${marker.sequence} errored:`, e);
          return NextResponse.json({ skip: true, reason: String(e) });
        }
      }
    }

    return NextResponse.json({ skip: true, reason: "validation failed after 2 attempts" });
  } catch (error) {
    console.error("[/api/ingest/extract]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed" },
      { status: 500 },
    );
  }
}
