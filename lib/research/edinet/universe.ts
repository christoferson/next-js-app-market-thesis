/**
 * R3 curated Japanese research universe — real, large TSE-listed filers,
 * mirroring the US list's approach. `edinetCode` is EDINET's stable filer
 * ID (E-prefixed); `secCode` is the 5-digit securities code EDINET returns
 * (4-digit ticker + trailing 0), kept as a string per house rules.
 */
export interface JapanResearchCompany {
  /** Stable internal ID for routes. */
  id: string;
  edinetCode: string;
  secCode: string;
  ticker: string;
  name: string;
  nativeName: string;
}

export const JAPAN_RESEARCH_UNIVERSE: readonly JapanResearchCompany[] = [
  {
    id: "toyota",
    edinetCode: "E02144",
    secCode: "72030",
    ticker: "7203",
    name: "Toyota Motor Corporation",
    nativeName: "トヨタ自動車株式会社",
  },
  {
    id: "sony",
    edinetCode: "E01777",
    secCode: "67580",
    ticker: "6758",
    name: "Sony Group Corporation",
    nativeName: "ソニーグループ株式会社",
  },
  {
    id: "keyence",
    edinetCode: "E01967",
    secCode: "68610",
    ticker: "6861",
    name: "Keyence Corporation",
    nativeName: "株式会社キーエンス",
  },
  {
    id: "nintendo",
    edinetCode: "E02367",
    secCode: "79740",
    ticker: "7974",
    name: "Nintendo Co., Ltd.",
    nativeName: "任天堂株式会社",
  },
  {
    id: "fast-retailing",
    edinetCode: "E03217",
    secCode: "99830",
    ticker: "9983",
    name: "Fast Retailing Co., Ltd.",
    nativeName: "株式会社ファーストリテイリング",
  },
  {
    id: "shin-etsu",
    edinetCode: "E00776",
    secCode: "40630",
    ticker: "4063",
    name: "Shin-Etsu Chemical Co., Ltd.",
    nativeName: "信越化学工業株式会社",
  },
];

export function getJapanResearchCompany(
  id: string
): JapanResearchCompany | null {
  return JAPAN_RESEARCH_UNIVERSE.find((c) => c.id === id) ?? null;
}
