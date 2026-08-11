import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import {
  extractInlineXbrlBlock,
  extractRiskText,
} from "@/lib/research/edinet/risk-text";
import { htmlToText } from "@/lib/research/edgar/sections";

/**
 * EDINET filings are inline XBRL: the concept is a `name` attribute on an
 * <ix:nonNumeric> wrapper that may nest further ix elements. These tests pin
 * the depth-counting extraction and the archive-scanning rules, using tiny
 * in-memory ZIPs so nothing touches the network or a real filing.
 */

const CONCEPT = "BusinessRisksTextBlock";

describe("extractInlineXbrlBlock", () => {
  it("returns the inner content of a simple block", () => {
    const html = `<html><body><ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock" contextRef="c1" escape="true">CONTENT</ix:nonNumeric></body></html>`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBe("CONTENT");
  });

  it("returns the complete outer content when another ix:nonNumeric is nested inside", () => {
    const html = [
      `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock" contextRef="c1">`,
      `BEFORE`,
      `<ix:nonNumeric name="jpcrp_cor:SomeOtherTextBlock" contextRef="c2">INNER</ix:nonNumeric>`,
      `AFTER`,
      `</ix:nonNumeric>`,
      `<p>OUTSIDE</p>`,
    ].join("");

    const block = extractInlineXbrlBlock(html, CONCEPT);
    expect(block).toBe(
      `BEFORE<ix:nonNumeric name="jpcrp_cor:SomeOtherTextBlock" contextRef="c2">INNER</ix:nonNumeric>AFTER`
    );
    expect(block).toContain("INNER");
    expect(block).not.toContain("OUTSIDE");
  });

  it("handles two sibling nested blocks without stopping early", () => {
    const html =
      `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">` +
      `<ix:nonNumeric name="a:One">1</ix:nonNumeric>` +
      `MIDDLE` +
      `<ix:nonNumeric name="a:Two">2</ix:nonNumeric>` +
      `TAIL</ix:nonNumeric>TRAILING`;

    const block = extractInlineXbrlBlock(html, CONCEPT);
    expect(block).toContain("MIDDLE");
    expect(block).toContain("TAIL");
    expect(block).not.toContain("TRAILING");
  });

  it("does not treat a self-closing ix:nonNumeric as an extra depth level", () => {
    const html =
      `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">` +
      `HEAD<ix:nonNumeric name="a:Empty" contextRef="c2" />TAIL` +
      `</ix:nonNumeric>AFTER`;

    const block = extractInlineXbrlBlock(html, CONCEPT);
    expect(block).toBe(
      `HEAD<ix:nonNumeric name="a:Empty" contextRef="c2" />TAIL`
    );
    expect(block).not.toContain("AFTER");
  });

  it("matches any taxonomy prefix on the concept name", () => {
    const corporate = `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">A</ix:nonNumeric>`;
    const specified = `<ix:nonNumeric name="jpsps_cor:BusinessRisksTextBlock">B</ix:nonNumeric>`;
    expect(extractInlineXbrlBlock(corporate, CONCEPT)).toBe("A");
    expect(extractInlineXbrlBlock(specified, CONCEPT)).toBe("B");
  });

  it("matches tags and attributes case-insensitively", () => {
    const html = `<IX:NONNUMERIC NAME="jpcrp_cor:BusinessRisksTextBlock">CONTENT</IX:NONNUMERIC>`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBe("CONTENT");
  });

  it("returns null when the concept is absent", () => {
    expect(extractInlineXbrlBlock("<html><p>no xbrl here</p></html>", CONCEPT)).toBeNull();
  });

  it("returns null when only unrelated nonNumeric elements are present", () => {
    const html =
      `<ix:nonNumeric name="jpcrp_cor:ManagementAnalysisTextBlock">A</ix:nonNumeric>` +
      `<ix:nonNumeric name="jpcrp_cor:CompanyHistoryTextBlock">B</ix:nonNumeric>`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBeNull();
  });

  it("returns null when the block is never closed", () => {
    const html = `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">truncated archive`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBeNull();
  });

  it("returns null when a nested block consumes the only close tag", () => {
    const html =
      `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">` +
      `<ix:nonNumeric name="a:Inner">INNER</ix:nonNumeric>`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBeNull();
  });

  it("returns an empty string for an empty but well-formed block", () => {
    const html = `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock"></ix:nonNumeric>`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBe("");
  });

  it("uses the first matching block when a document repeats the concept", () => {
    const html =
      `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">FIRST</ix:nonNumeric>` +
      `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock">SECOND</ix:nonNumeric>`;
    expect(extractInlineXbrlBlock(html, CONCEPT)).toBe("FIRST");
  });
});

/** Long enough that htmlToText output clears the 200-character floor. */
const LONG_JAPANESE_RISK = `<p>当社グループの事業展開において、投資家の判断に重要な影響を及ぼす可能性のある事項を以下に記載しております。</p>`.repeat(
  4
);

const SHORT_RISK = `<p>短い記載です。</p>`;

function riskBlock(inner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>` +
    `<ix:nonNumeric name="jpcrp_cor:BusinessRisksTextBlock" contextRef="CurrentYearDuration" escape="true">` +
    inner +
    `</ix:nonNumeric></body></html>`
  );
}

function makeArchive(entries: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  return zip.toBuffer();
}

describe("extractRiskText", () => {
  it("extracts the risk text from a PublicDoc inline-XBRL document", () => {
    const archive = makeArchive({
      "S100XYZ1/XBRL/PublicDoc/0102010_honbun_jpcrp030000.htm":
        riskBlock(LONG_JAPANESE_RISK),
    });

    const extracted = extractRiskText(archive);
    expect(extracted).not.toBeNull();
    expect(extracted?.sourceEntry).toBe(
      "S100XYZ1/XBRL/PublicDoc/0102010_honbun_jpcrp030000.htm"
    );
    expect(extracted?.text.length).toBeGreaterThanOrEqual(200);
    expect(extracted?.text).toContain("投資家の判断に重要な影響");
    expect(extracted?.text).not.toContain("<p>");
  });

  it("preserves Japanese characters through the HTML conversion", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/0102010_honbun.htm": riskBlock(
        `<p>【事業等のリスク】</p>` + LONG_JAPANESE_RISK
      ),
    });

    const extracted = extractRiskText(archive);
    expect(extracted?.text.startsWith("【事業等のリスク】")).toBe(true);
    expect(extracted?.text).toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });

  it("returns null when the block is too short to be a real section", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/0102010_honbun.htm": riskBlock(SHORT_RISK),
    });

    expect(htmlToText(SHORT_RISK).length).toBeLessThan(200);
    expect(extractRiskText(archive)).toBeNull();
  });

  it("keeps scanning past a too-short block to a substantial one", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/0000000_header.htm": riskBlock(SHORT_RISK),
      "XBRL/PublicDoc/0102010_honbun.htm": riskBlock(LONG_JAPANESE_RISK),
    });

    const extracted = extractRiskText(archive);
    expect(extracted?.sourceEntry).toBe("XBRL/PublicDoc/0102010_honbun.htm");
  });

  it("returns null for an archive with no PublicDoc htm entries", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/jpcrp030000-asr-001.xbrl": riskBlock(LONG_JAPANESE_RISK),
      "S100XYZ1/manifest.xml": "<manifest/>",
    });
    expect(extractRiskText(archive)).toBeNull();
  });

  it("ignores an AuditDoc entry even when it contains a substantial concept block", () => {
    const archive = makeArchive({
      "S100XYZ1/XBRL/AuditDoc/0105000_audit.htm": riskBlock(LONG_JAPANESE_RISK),
    });
    expect(extractRiskText(archive)).toBeNull();
  });

  it("prefers the PublicDoc entry when the AuditDoc is listed first", () => {
    // The AuditDoc block here is long enough to qualify on its own, so only
    // the path filter can exclude it.
    const auditProse =
      `<p>監査報告書の記載であり、投資家向けのリスク情報ではありません。</p>`.repeat(
        8
      );
    const archive = makeArchive({
      "S100XYZ1/XBRL/AuditDoc/0105000_audit.htm": riskBlock(auditProse),
      "S100XYZ1/XBRL/PublicDoc/0102010_honbun.htm": riskBlock(
        LONG_JAPANESE_RISK
      ),
    });

    expect(htmlToText(auditProse).length).toBeGreaterThanOrEqual(200);

    const extracted = extractRiskText(archive);
    expect(extracted?.sourceEntry).toContain("PublicDoc");
    expect(extracted?.text).not.toContain("監査報告書");
  });

  it("accepts .html as well as .htm entries", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/0102010_honbun.html": riskBlock(LONG_JAPANESE_RISK),
    });
    expect(extractRiskText(archive)?.sourceEntry).toBe(
      "XBRL/PublicDoc/0102010_honbun.html"
    );
  });

  it("returns null for an archive whose PublicDoc document has no risk concept", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/0101010_honbun.htm":
        `<html><body><ix:nonNumeric name="jpcrp_cor:CompanyHistoryTextBlock">` +
        LONG_JAPANESE_RISK +
        `</ix:nonNumeric></body></html>`,
    });
    expect(extractRiskText(archive)).toBeNull();
  });

  it("returns null when the concept name appears but the element is malformed", () => {
    const archive = makeArchive({
      "XBRL/PublicDoc/0102010_honbun.htm":
        `<html><body><!-- BusinessRisksTextBlock referenced in a comment --><p>` +
        LONG_JAPANESE_RISK +
        `</p></body></html>`,
    });
    expect(extractRiskText(archive)).toBeNull();
  });

  it("returns null for an empty archive", () => {
    expect(extractRiskText(makeArchive({}))).toBeNull();
  });

  it("extracts entity-escaped markup, though the tags survive as literal text", () => {
    // Documents the CURRENT behavior for escape="true" blocks, whose markup
    // arrives entity-encoded: htmlToText strips real tags before decoding
    // entities, so "&lt;p&gt;" becomes the literal text "<p>" rather than a
    // paragraph break. The Japanese prose is still recovered intact.
    const escaped = LONG_JAPANESE_RISK.replace(/</g, "&lt;").replace(
      />/g,
      "&gt;"
    );
    const archive = makeArchive({
      "XBRL/PublicDoc/0102010_honbun.htm": riskBlock(escaped),
    });

    const extracted = extractRiskText(archive);
    expect(extracted).not.toBeNull();
    expect(extracted?.text).toContain("投資家の判断に重要な影響");
    expect(extracted?.text).toContain("<p>");
  });
});
