/**
 * Shared marker-location utilities used by both the discovery and extract routes.
 */

export type MarkerRef = { sequence: number; title: string };

const WINDOW_OVERLAP = 10_000;

// ─────────────────────────────────────────────────────────────
// TOC DETECTION
// A TOC entry looks like:  "Chapter Title ........... 12"
// or just:                 "Chapter Title  12"
// — the title is followed by only whitespace/dots and a page number.
// ─────────────────────────────────────────────────────────────

function looksLikeTocEntry(fullText: string, matchIdx: number, matchLen: number): boolean {
  // Grab the 60 chars immediately after the matched title
  const after = fullText.slice(matchIdx + matchLen, matchIdx + matchLen + 60);
  const trimmed = after.trimStart();
  // Looks like a TOC entry if it is: optional dots/spaces then a 1-4 digit number then whitespace/end
  return /^[.\s·•\t]*\d{1,4}[\s\r\n]*$/.test(trimmed) || /^[.\s·•\t]*\d{1,4}[.\s\r\n]/.test(trimmed);
}

// ─────────────────────────────────────────────────────────────
// MARKER START — finds the actual body location, skipping TOC hits
// ─────────────────────────────────────────────────────────────

export function findMarkerStart(
  fullText: string,
  marker: MarkerRef,
  markerType: string,
): number {
  const lower = fullText.toLowerCase();
  const titleLower = marker.title.toLowerCase();
  const typeLower = markerType.toLowerCase();

  // For the first few chapters the TOC is a real risk — scan all occurrences
  // and return the first one that doesn't look like a TOC line.
  if (marker.sequence <= 3) {
    let pos = 0;
    while (pos < lower.length) {
      const found = lower.indexOf(titleLower, pos);
      if (found === -1) break;
      if (!looksLikeTocEntry(fullText, found, titleLower.length)) return found;
      pos = found + 1;
    }
    // Fallback: return whatever we find, even if it looks like a TOC entry
    const fallback = lower.indexOf(titleLower);
    if (fallback !== -1) return fallback;
  }

  // For later chapters: skip the first ~8 % of the document (covers most TOC pages)
  const skipToc = Math.min(8_000, Math.floor(fullText.length * 0.05));

  // Strategy 1: exact title match after TOC area
  let idx = lower.indexOf(titleLower, skipToc);
  if (idx !== -1) return idx;

  // Strategy 2: exact title match from start (short documents)
  idx = lower.indexOf(titleLower);
  if (idx !== -1) return idx;

  // Strategy 3: marker-type + number patterns
  for (const pat of [
    `${typeLower} ${marker.sequence}\n`,
    `${typeLower} ${marker.sequence} `,
    `${typeLower} ${marker.sequence}:`,
    `\n${marker.sequence}\n`,
    `\n${marker.sequence} `,
    `\n${marker.sequence}. `,
    `\n${marker.sequence}: `,
  ]) {
    idx = lower.indexOf(pat, skipToc);
    if (idx !== -1) return idx;
  }

  return -1;
}

// ─────────────────────────────────────────────────────────────
// ANCHOR — first 10 words of actual content at marker location
// ─────────────────────────────────────────────────────────────

export function getAnchorText(
  fullText: string,
  marker: MarkerRef,
  markerType: string,
): string {
  const startIdx = findMarkerStart(fullText, marker, markerType);
  if (startIdx === -1) return marker.title;
  const raw = fullText.slice(startIdx, startIdx + 300).replace(/\s+/g, " ").trim();
  return raw.split(/\s+/).slice(0, 10).join(" ");
}

// ─────────────────────────────────────────────────────────────
// TEXT WINDOW — the slice sent to Gemini for extraction
// ─────────────────────────────────────────────────────────────

export function findMarkerWindow(
  fullText: string,
  marker: MarkerRef,
  nextMarker: MarkerRef | null,
  markerType: string,
): string {
  const startIdx = findMarkerStart(fullText, marker, markerType);
  if (startIdx === -1) return "";

  // 1 k look-back so headings are never cut off
  const windowStart = Math.max(0, startIdx - 1_000);

  // Default window: 50 k chars past the marker start
  let endIdx = startIdx + 50_000;

  if (nextMarker) {
    const nextStart = findMarkerStart(fullText, nextMarker, markerType);
    if (nextStart !== -1 && nextStart > startIdx + 200) {
      endIdx = Math.min(endIdx, nextStart + WINDOW_OVERLAP);
    }
  }

  return fullText.slice(windowStart, Math.min(endIdx, fullText.length));
}
