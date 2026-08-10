/**
 * Deterministic 10-K narrative-section extraction (R2).
 *
 * 10-K documents are HTML without reliable structural tags for items, so
 * extraction is heuristic: strip HTML → locate item headings → slice. The
 * heuristics are pure and unit-testable; the LLM never sees raw HTML.
 */

/** Convert filing HTML to readable plain text. */
export function htmlToText(html: string): string {
  return (
    html
      // Drop non-content elements entirely.
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Block-level closes become newlines so headings stay detectable.
      .replace(/<\/(p|div|tr|table|h[1-6]|li|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      // Inline formatting tags strip to NOTHING: filings routinely split
      // words across spans ("RIS</span><span>K FACTORS"), and turning each
      // tag into a space would corrupt words and break heading detection.
      .replace(/<\/?(span|font|b|i|em|strong|u|a|sup|sub)(\s[^>]*)?>/gi, "")
      .replace(/<[^>]+>/g, " ")
      // Entity decoding for the handful that matter in filings.
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#8220;|&#8221;/g, '"')
      // Single-quote entities (8216/8217/8219) are apostrophes in filings —
      // mapping them to double quotes would corrupt words like "Company's".
      .replace(/&#821[679];|&#39;|&apos;/gi, "'")
      .replace(/&#8211;|&#8212;/g, "—")
      // Whitespace normalization: collapse runs, keep line structure.
      .replace(/[ \t ]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export interface SectionBounds {
  /** Regexes matching the section's own heading. */
  start: RegExp[];
  /** Regexes matching the next section's heading (end of slice). */
  end: RegExp[];
}

/**
 * Item 1A Risk Factors, ending at Item 1B (or 2 when 1B is absent).
 * Matches "Item 1A." / "ITEM 1A —" / "Item 1A: Risk Factors" heading forms
 * at line start; the trailing title requirement avoids matching
 * cross-references like "see Item 1A" mid-sentence.
 */
export const RISK_FACTORS_BOUNDS: SectionBounds = {
  start: [/^item\s*1a[.:\s—-]*risk\s*factors/im],
  end: [
    /^item\s*1b[.:\s—-]*unresolved\s*staff/im,
    /^item\s*1c[.:\s—-]*cybersecurity/im,
    /^item\s*2[.:\s—-]*propert/im,
  ],
};

export interface ExtractedSection {
  text: string;
  /** Character offsets in the plain text, for diagnostics. */
  startOffset: number;
  endOffset: number;
}

/**
 * Extract a section from plain filing text. 10-Ks list items twice — in the
 * table of contents and in the body — so when multiple heading matches
 * exist, the LAST start match is used (the body one); the end heading is
 * the first end match after it. Returns null when the section cannot be
 * located — callers must surface "section unavailable", never guess.
 */
export function extractSection(
  plainText: string,
  bounds: SectionBounds
): ExtractedSection | null {
  let startOffset: number | null = null;
  for (const startPattern of bounds.start) {
    const matches = [...plainText.matchAll(toGlobal(startPattern))];
    const last = matches[matches.length - 1];
    if (last?.index !== undefined) {
      startOffset = last.index;
      break;
    }
  }
  if (startOffset === null) return null;

  let endOffset = plainText.length;
  for (const endPattern of bounds.end) {
    const matches = [...plainText.matchAll(toGlobal(endPattern))];
    const after = matches.find(
      (m) => m.index !== undefined && m.index > startOffset!
    );
    if (after?.index !== undefined) {
      endOffset = Math.min(endOffset, after.index);
    }
  }

  const text = plainText.slice(startOffset, endOffset).trim();
  // A real risk-factors section is substantial; a sliver means we caught a
  // stray heading (e.g. an exhibit index) — treat as not found.
  if (text.length < 500) return null;

  return { text, startOffset, endOffset };
}

function toGlobal(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : pattern.flags + "g";
  return new RegExp(pattern.source, flags);
}
