// Opt-in live verification of the EDGAR pipeline (R1). Not part of the
// default test suite (SPEC §20.8): makes 2 real requests to data.sec.gov.
// Usage: EDGAR_USER_AGENT="you@example.com" node scripts/verify-edgar.mjs
const UA = process.env.EDGAR_USER_AGENT ?? "MarketThesis/0.1 (verify script)";
const CIK = "0000320193"; // Apple

async function get(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

const submissions = await get(
  `https://data.sec.gov/submissions/CIK${CIK}.json`
);
const recent = submissions.filings.recent;
const tenKs = recent.form
  .map((form, i) => ({ form, date: recent.filingDate[i] }))
  .filter((f) => f.form === "10-K")
  .slice(0, 3);
console.log("submissions ok:", submissions.name, "| recent 10-Ks:", tenKs);

const facts = await get(
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${CIK}.json`
);
const revenue =
  facts.facts["us-gaap"]?.RevenueFromContractWithCustomerExcludingAssessedTax;
const annual = (revenue?.units?.USD ?? [])
  .filter((f) => f.form === "10-K" && f.start !== undefined)
  .filter((f) => {
    const days = (Date.parse(f.end) - Date.parse(f.start)) / 86400000;
    return days >= 340 && days <= 400;
  });
const byPeriod = new Map();
for (const f of annual) {
  const key = `${f.start}|${f.end}`;
  const prev = byPeriod.get(key);
  if (!prev || f.filed > prev.filed) byPeriod.set(key, f);
}
const sorted = [...byPeriod.values()].sort((a, b) =>
  a.end < b.end ? 1 : -1
);
console.log(
  "annual revenue (deduped, latest 3):",
  sorted.slice(0, 3).map((f) => ({
    period: `${f.start}..${f.end}`,
    val: f.val,
    accn: f.accn,
    filed: f.filed,
  }))
);
console.log(
  "raw annual fact count:",
  annual.length,
  "→ deduped periods:",
  byPeriod.size
);
