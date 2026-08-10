import { describe, expect, it } from "vitest";
import {
  RISK_FACTORS_BOUNDS,
  extractSection,
  htmlToText,
  type ExtractedSection,
} from "@/lib/research/edgar/sections";

/**
 * Section extraction is heuristic, so its edges are the contract: a filing
 * lists every item twice (table of contents and body), cross-references items
 * mid-sentence, and sometimes repeats an item heading in an exhibit index.
 * These tests pin the deterministic rules — last line-start match wins, first
 * end heading after it, and a sliver is "not found" rather than a bad guess.
 */

const FILLER =
  "The Company faces competition, regulatory, technology, and supply-chain " +
  "risks that could materially affect its operating results. ";

/** Deterministic prose of an exact length, for size-threshold assertions. */
function filler(chars: number): string {
  const repeats = Math.ceil(chars / FILLER.length);
  const raw = FILLER.repeat(repeats).slice(0, chars);
  // Extraction trims its slice, so filler must never end on whitespace or
  // exact-length assertions would be off by one.
  return raw.endsWith(" ") ? `${raw.slice(0, -1)}.` : raw;
}

function requireSection(
  section: ExtractedSection | null,
  label: string
): ExtractedSection {
  if (section === null) throw new Error(`Expected a section for ${label}`);
  return section;
}

const TABLE_OF_CONTENTS = [
  "FIXTURE MANUFACTURING CO.",
  "ANNUAL REPORT ON FORM 10-K",
  "TABLE OF CONTENTS",
  "Item 1. Business 3",
  "Item 1A. Risk Factors 12",
  "Item 1B. Unresolved Staff Comments 40",
  "Item 1C. Cybersecurity 41",
  "Item 2. Properties 43",
  "PART I",
].join("\n");

interface FilingOptions {
  includeTableOfContents?: boolean;
  /** Which end headings follow the risk-factors body, in order. */
  endHeadings?: readonly string[];
  riskBodyChars?: number;
  /** Heading form used in the body, e.g. an upper-case variant. */
  bodyHeading?: string;
  /** Extra lines appended after everything else. */
  trailing?: readonly string[];
}

/** Assemble plain filing text with a realistic 10-K shape. */
function buildFilingText(options: FilingOptions = {}): string {
  const {
    includeTableOfContents = true,
    endHeadings = ["Item 1B. Unresolved Staff Comments", "Item 2. Properties"],
    riskBodyChars = 2000,
    bodyHeading = "Item 1A. Risk Factors",
    trailing = [],
  } = options;

  const lines: string[] = [];
  if (includeTableOfContents) lines.push(TABLE_OF_CONTENTS);
  lines.push("Item 1. Business", filler(1200));
  lines.push(bodyHeading, filler(riskBodyChars));
  for (const heading of endHeadings) {
    lines.push(heading, filler(700));
  }
  lines.push(...trailing);
  return lines.join("\n");
}

describe("htmlToText tag and non-content stripping", () => {
  it("strips tags, script bodies, style bodies, and comments", () => {
    const html = [
      "<html><head>",
      "<style>.risk { color: #c00; } p::after { content: 'STYLE_LEAK'; }</style>",
      "<script>var leak = '<p>SCRIPT_LEAK</p>'; alert(leak);</script>",
      "</head><body>",
      "<!-- COMMENT_LEAK draft note -->",
      "<div><span>Visible narrative text.</span></div>",
      "</body></html>",
    ].join("");

    const text = htmlToText(html);

    expect(text).toBe("Visible narrative text.");
    expect(text).not.toContain("STYLE_LEAK");
    expect(text).not.toContain("SCRIPT_LEAK");
    expect(text).not.toContain("COMMENT_LEAK");
    expect(text).not.toContain("<");
  });

  it("drops attribute values without leaking them into the text", () => {
    const text = htmlToText(
      '<p class="ItemHeading" style="font-weight:700">Item 1A. Risk Factors</p>'
    );
    expect(text).toBe("Item 1A. Risk Factors");
  });
});

describe("htmlToText line structure", () => {
  it("turns block closes into newlines", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
    expect(htmlToText("<div>One</div><div>Two</div>")).toBe("One\nTwo");
    expect(htmlToText("<li>One</li><li>Two</li>")).toBe("One\nTwo");
    expect(htmlToText("<h2>One</h2><p>Two</p>")).toBe("One\nTwo");
  });

  it("turns self-closing and bare <br> into newlines", () => {
    expect(htmlToText("One<br/>Two<br>Three<br />Four")).toBe(
      "One\nTwo\nThree\nFour"
    );
  });

  it("keeps an item heading at the start of its own line", () => {
    const html = [
      "<div><p>...as described elsewhere in this report.</p>",
      "<p>Item 1A. Risk Factors</p>",
      "<p>Our business faces the following risks.</p></div>",
    ].join("");

    const text = htmlToText(html);

    expect(text.split("\n")).toContain("Item 1A. Risk Factors");
    const startPattern = RISK_FACTORS_BOUNDS.start[0];
    if (startPattern === undefined) throw new Error("Missing start pattern");
    expect(startPattern.test(text)).toBe(true);
  });

  it("collapses whitespace runs but preserves paragraph breaks", () => {
    expect(htmlToText("<p>A   B\t\tC</p>")).toBe("A B C");
    expect(htmlToText("<p>A</p><br/><br/><br/><p>B</p>")).toBe("A\n\nB");
  });

  it("has no leading or trailing whitespace", () => {
    const text = htmlToText(
      "  <div>\n\n  <p>  Padded narrative.  </p>\n\n  </div>  "
    );
    expect(text).toBe("Padded narrative.");
    expect(text).toBe(text.trim());
  });
});

describe("htmlToText entity decoding", () => {
  it("decodes non-breaking spaces to collapsible spaces", () => {
    expect(htmlToText("<p>Item&nbsp;1A.&#160;Risk&nbsp;&nbsp;Factors</p>")).toBe(
      "Item 1A. Risk Factors"
    );
  });

  it("decodes ampersands and angle-bracket entities", () => {
    expect(htmlToText("<p>Research &amp; development</p>")).toBe(
      "Research & development"
    );
    expect(htmlToText("<p>&lt;unaudited&gt;</p>")).toBe("<unaudited>");
  });

  it("normalizes curly and straight quotation entities", () => {
    expect(htmlToText("<p>&#8220;material weakness&#8221;</p>")).toBe(
      '"material weakness"'
    );
    // Single-quote entities decode to apostrophes, not double quotes —
    // &#8217; is the apostrophe in "Company's" throughout real filings.
    expect(htmlToText("<p>&#8216;going concern&#8217;</p>")).toBe(
      "'going concern'"
    );
    expect(htmlToText("<p>the Company&#8217;s results</p>")).toBe(
      "the Company's results"
    );
    expect(htmlToText("<p>it&#39;s and it&apos;s</p>")).toBe("it's and it's");
    expect(htmlToText("<p>&quot;risk factors&quot;</p>")).toBe('"risk factors"');
  });

  it("normalizes en and em dashes to an em dash", () => {
    expect(htmlToText("<p>Revenue &#8212; net</p>")).toBe("Revenue — net");
    expect(htmlToText("<p>2023&#8211;2024</p>")).toBe("2023—2024");
  });
});

describe("extractSection start selection", () => {
  it("starts at the body heading, not the table-of-contents entry", () => {
    const text = buildFilingText();
    const tocOffset = text.indexOf("Item 1A. Risk Factors 12");
    expect(tocOffset).toBeGreaterThanOrEqual(0);

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    expect(section.startOffset).toBeGreaterThan(tocOffset);
    expect(text.lastIndexOf("Item 1A. Risk Factors")).toBe(section.startOffset);
    expect(section.text.startsWith("Item 1A. Risk Factors")).toBe(true);
    expect(section.text).not.toContain("Risk Factors 12");
  });

  it("matches an upper-case body heading", () => {
    const text = buildFilingText({ bodyHeading: "ITEM 1A. RISK FACTORS" });

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "upper-case heading"
    );

    expect(section.text.startsWith("ITEM 1A. RISK FACTORS")).toBe(true);
  });

  it("matches dash and colon heading punctuation forms", () => {
    for (const heading of [
      "Item 1A — Risk Factors",
      "Item 1A: Risk Factors",
      "Item 1A. RISK FACTORS",
      "ITEM 1A-RISK FACTORS",
    ]) {
      const text = buildFilingText({ bodyHeading: heading });
      const section = requireSection(
        extractSection(text, RISK_FACTORS_BOUNDS),
        heading
      );
      expect(section.text.startsWith(heading)).toBe(true);
    }
  });

  it("ignores a later mid-line cross-reference because the pattern is line-anchored", () => {
    const text = buildFilingText({
      endHeadings: ["Item 1B. Unresolved Staff Comments"],
      trailing: [
        "Item 2. Properties",
        "Our facilities are subject to the risks described in see Item 1A. " +
          "Risk Factors above and in our subsequent reports.",
        filler(700),
      ],
    });
    const crossReferenceOffset = text.indexOf("see Item 1A. Risk Factors");
    expect(crossReferenceOffset).toBeGreaterThanOrEqual(0);

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    // The cross-reference is the last textual mention, but ^ prevents it from
    // matching at all, so the body heading still wins.
    expect(crossReferenceOffset).toBeGreaterThan(section.startOffset);
    expect(section.text.startsWith("Item 1A. Risk Factors")).toBe(true);
    expect(section.text).not.toContain("see Item 1A. Risk Factors");
  });

  it("returns null when the only mention is a mid-line cross-reference", () => {
    const text = [
      "Item 1. Business",
      filler(1200),
      "Additional detail appears under see Item 1A. Risk Factors below, " +
        "and management refers to Item 1A. Risk Factors when discussing " +
        "uncertainties.",
      filler(1200),
      "Item 2. Properties",
      filler(700),
    ].join("\n");

    expect(extractSection(text, RISK_FACTORS_BOUNDS)).toBeNull();
  });

  it("returns null when the section is absent entirely", () => {
    const text = [
      "Item 1. Business",
      filler(1500),
      "Item 2. Properties",
      filler(900),
    ].join("\n");

    expect(extractSection(text, RISK_FACTORS_BOUNDS)).toBeNull();
  });
});

describe("extractSection end selection", () => {
  it("ends at Item 1B when present", () => {
    const text = buildFilingText();

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    expect(section.endOffset).toBe(
      text.indexOf("Item 1B. Unresolved Staff Comments", section.startOffset)
    );
    expect(section.text).not.toContain("Unresolved Staff Comments");
    expect(section.text).not.toContain("Item 2. Properties");
  });

  it("falls through to Item 2 when Item 1B is absent", () => {
    const text = buildFilingText({ endHeadings: ["Item 2. Properties"] });

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    expect(section.endOffset).toBe(
      text.indexOf("Item 2. Properties", section.startOffset)
    );
    expect(section.text).not.toContain("Item 2. Properties");
  });

  it("ends at Item 1C when it is the first following heading", () => {
    const text = buildFilingText({
      endHeadings: ["Item 1C. Cybersecurity", "Item 2. Properties"],
    });

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    expect(section.endOffset).toBe(
      text.indexOf("Item 1C. Cybersecurity", section.startOffset)
    );
    expect(section.text).not.toContain("Cybersecurity");
  });

  it("uses the earliest following end heading regardless of pattern order", () => {
    // Item 2 is listed last in RISK_FACTORS_BOUNDS.end but appears first here.
    const text = buildFilingText({
      endHeadings: ["Item 2. Properties", "Item 1B. Unresolved Staff Comments"],
    });

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    expect(section.endOffset).toBe(
      text.indexOf("Item 2. Properties", section.startOffset)
    );
  });

  it("runs to the end of the text when no end heading follows", () => {
    const text = buildFilingText({
      includeTableOfContents: false,
      endHeadings: [],
      riskBodyChars: 2500,
    });

    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "risk factors"
    );

    expect(section.endOffset).toBe(text.length);
    expect(section.text).toBe(text.slice(section.startOffset).trim());
  });
});

describe("extractSection minimum-length guard", () => {
  it("returns null when a stray exhibit-index heading is the last match", () => {
    const text = buildFilingText({
      trailing: [
        "EXHIBIT INDEX",
        "Item 1A. Risk Factors",
        "Incorporated by reference to Exhibit 99.1.",
      ],
    });

    // The real body section is substantial, but the last line-start match is
    // the exhibit-index heading, whose slice is a sliver.
    expect(text.lastIndexOf("Item 1A. Risk Factors")).toBeGreaterThan(
      text.indexOf("Item 1B. Unresolved Staff Comments")
    );
    expect(extractSection(text, RISK_FACTORS_BOUNDS)).toBeNull();
  });

  it("rejects a section just under 500 characters and accepts one at 500", () => {
    const heading = "Item 1A. Risk Factors\n";
    const buildAt = (total: number) =>
      [
        "Item 1. Business",
        filler(600),
        heading + filler(total - heading.length),
        "Item 1B. Unresolved Staff Comments",
        filler(600),
      ].join("\n");

    expect(extractSection(buildAt(499), RISK_FACTORS_BOUNDS)).toBeNull();

    const section = requireSection(
      extractSection(buildAt(500), RISK_FACTORS_BOUNDS),
      "500-character section"
    );
    expect(section.text).toHaveLength(500);
  });
});

describe("extractSection on converted HTML", () => {
  it("extracts the body section from a filing that starts as HTML", () => {
    const html = [
      "<html><body>",
      "<table><tr><td>Item 1A. Risk Factors</td><td>12</td></tr></table>",
      "<p>Item 1. Business</p>",
      `<p>${filler(1000)}</p>`,
      "<p><b>Item&nbsp;1A. Risk Factors</b></p>",
      `<p>${filler(1400)}</p>`,
      "<p>Item 1B. Unresolved Staff Comments</p>",
      "<p>None.</p>",
      "</body></html>",
    ].join("");

    const text = htmlToText(html);
    const section = requireSection(
      extractSection(text, RISK_FACTORS_BOUNDS),
      "html filing"
    );

    expect(section.startOffset).toBeGreaterThan(
      text.indexOf("Item 1A. Risk Factors")
    );
    expect(section.text.startsWith("Item 1A. Risk Factors")).toBe(true);
    expect(section.text).not.toContain("Unresolved Staff Comments");
    expect(section.text.length).toBeGreaterThanOrEqual(500);
  });
});
