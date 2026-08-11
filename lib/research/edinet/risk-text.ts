import AdmZip from "adm-zip";
import { htmlToText } from "@/lib/research/edgar/sections";

/**
 * Extract 事業等のリスク (business risks) from an EDINET XBRL archive.
 *
 * EDINET filings are INLINE XBRL: the concept name is an attribute of an
 * <ix:nonNumeric> wrapper, not an element tag —
 *   <ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock" ...>HTML</ix:nonNumeric>
 * The wrapper can contain nested ix elements, so extraction walks to the
 * MATCHING close tag with a depth counter rather than a non-greedy regex
 * (verified against Nintendo's FY2025 annual report, doc 0102010).
 */

const RISK_CONCEPT = "BusinessRisksTextBlock";

export interface ExtractedRiskText {
  text: string;
  /** Archive entry the text came from, for provenance. */
  sourceEntry: string;
}

/**
 * Find the inner content of the ix:nonNumeric element whose name attribute
 * references the concept, honoring nested ix:nonNumeric elements.
 */
export function extractInlineXbrlBlock(
  html: string,
  conceptLocalName: string
): string | null {
  const openPattern = new RegExp(
    `<ix:nonNumeric\\b[^>]*name="[^"]*:${conceptLocalName}"[^>]*>`,
    "i"
  );
  const openMatch = openPattern.exec(html);
  if (openMatch === null) return null;

  const contentStart = openMatch.index + openMatch[0].length;
  const tagPattern = /<(\/?)ix:nonNumeric\b[^>]*>/gi;
  tagPattern.lastIndex = contentStart;

  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(contentStart, match.index);
      }
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }
  return null;
}

/**
 * Inline-XBRL body documents live under XBRL/PublicDoc/ as .htm files; the
 * risk block is in the 事業の状況 document, but scanning all is robust.
 */
export function extractRiskText(archive: Buffer): ExtractedRiskText | null {
  const zip = new AdmZip(archive);

  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    if (!/XBRL\/PublicDoc\/.*\.htm[l]?$/i.test(name)) continue;

    const content = entry.getData().toString("utf8");
    if (!content.includes(RISK_CONCEPT)) continue;

    const block = extractInlineXbrlBlock(content, RISK_CONCEPT);
    if (block === null) continue;

    const text = htmlToText(block);
    if (text.length >= 200) {
      return { text, sourceEntry: name };
    }
  }

  return null;
}
