// Inspect a stored filing's XBRL archive structure (R3 debug).
// Usage: node --conditions=react-server --import tsx scripts/debug-edinet-xbrl.mts <docId>
import AdmZip from "adm-zip";
import "./load-env.mts";

const { fetchFilingArchive } = await import("../lib/research/edinet/client");
const { getFiling } = await import("../lib/research/edinet/store");

const docId = process.argv[2] ?? "";
const filing = getFiling(docId);
console.log("filing:", filing?.filerName, filing?.periodEnd);

const archive = await fetchFilingArchive(docId);
console.log("archive bytes:", archive.length);
const zip = new AdmZip(archive);

for (const entry of zip.getEntries()) {
  if (/PublicDoc/.test(entry.entryName)) {
    console.log(" ", entry.entryName, entry.header.size);
  }
}

// Enumerate inline-XBRL nonNumeric element names per PublicDoc htm file.
for (const entry of zip.getEntries()) {
  if (!/PublicDoc\/.*\.htm/i.test(entry.entryName)) continue;
  const content = entry.getData().toString("utf8");
  const names = [
    ...content.matchAll(/<ix:nonNumeric[^>]*name="([^"]*)"/gi),
  ].map((m) => m[1]);
  const riskNames = [...new Set(names)].filter((n) => /risk/i.test(n ?? ""));
  if (riskNames.length > 0) {
    console.log(
      "RISK ELEMENTS in",
      entry.entryName.split("/").pop()?.slice(0, 20),
      ":",
      riskNames
    );
  }
}
