// Diagnose section extraction against a real filing (opt-in, 2 EDGAR requests).
// Usage: node scripts/debug-sections.mjs <cik>
const UA = process.env.EDGAR_USER_AGENT ?? "MarketThesis/0.1 (debug script)";
const cik = String(process.argv[2] ?? "789019").padStart(10, "0");

const submissions = await (
  await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { "User-Agent": UA },
  })
).json();
const recent = submissions.filings.recent;
const i = recent.form.findIndex((f) => f === "10-K");
const accn = recent.accessionNumber[i].replaceAll("-", "");
const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn}/${recent.primaryDocument[i]}`;
console.log("doc:", url);

const html = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
console.log("html bytes:", html.length);

// Reproduce htmlToText inline (keep in sync with lib/research/edgar/sections.ts)
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<\/(p|div|tr|table|h[1-6]|li|br)>/gi, "\n")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/?(span|font|b|i|em|strong|u|a|sup|sub)(\s[^>]*)?>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/[ \t]+/g, " ")
  .replace(/ ?\n ?/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

console.log("text chars:", text.length);
const lines = text.split("\n");
const hits = [];
for (let n = 0; n < lines.length; n++) {
  if (/item\s*1a/i.test(lines[n])) hits.push(`${n}: ${lines[n].slice(0, 120)}`);
}
console.log("lines containing 'item 1a':");
for (const h of hits.slice(0, 12)) console.log(" ", JSON.stringify(h));
console.log("start regex matches:", [...text.matchAll(/^item\s*1a[.:\s—-]*risk\s*factors/gim)].length);
console.log("1b regex matches:", [...text.matchAll(/^item\s*1b[.:\s—-]*unresolved\s*staff/gim)].length);
