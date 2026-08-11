// Inspect the local EDINET store (R3 debug helper).
// Usage: node --conditions=react-server --import tsx scripts/inspect-edinet-store.mts
const { listCompanyFilings, closeStore, countFilings } = await import(
  "../lib/research/edinet/store"
);
const { JAPAN_RESEARCH_UNIVERSE } = await import(
  "../lib/research/edinet/universe"
);

console.log("total filings:", countFilings());
for (const company of JAPAN_RESEARCH_UNIVERSE) {
  for (const docType of ["120", "160"]) {
    for (const filing of listCompanyFilings(company.edinetCode, docType, 3)) {
      console.log(
        [
          company.ticker,
          company.name.slice(0, 22).padEnd(22),
          `type=${filing.docTypeCode}`,
          `period=${filing.periodEnd}`,
          `risk=${filing.riskText?.length ?? "NONE"} chars`,
          filing.riskTextSource?.split("/").pop()?.slice(0, 44) ?? "",
        ].join(" | ")
      );
    }
  }
}
closeStore();
