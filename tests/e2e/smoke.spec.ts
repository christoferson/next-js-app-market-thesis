import { test, expect, type Locator } from "@playwright/test";

/** Reads the count out of a status line such as "7 stocks match …". */
async function readLeadingNumber(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? "";
  const match = /\d+/.exec(text);
  return match === null ? Number.NaN : Number(match[0]);
}

/**
 * Discovery release smoke flow (SPEC §20.7). Runs in demo mode against
 * deterministic fixtures — no live providers, no credentials.
 *
 * Discovery renders the same rows twice: a table from `md` up and cards below
 * it. Only one of the two is displayed at any width, so text assertions filter
 * for the visible instance rather than taking the first DOM match — otherwise
 * the mobile project resolves the CSS-hidden desktop table.
 */

test("core discovery flow: browse, filter, inspect, watchlist", async ({
  page,
}) => {
  // 1. Open Discovery (root redirects).
  await page.goto("/");
  await expect(page).toHaveURL(/\/discover$/);
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true })
  ).toBeVisible();

  // 2. Confirm demo-data status and disclaimer.
  await expect(
    page
      .getByText("Demo data — not current market information.")
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  await expect(
    page.getByText("Market Thesis is a research tool, not financial advice", {
      exact: false,
    })
  ).toBeVisible();

  // 3. Switch asset tabs.
  await page.getByRole("tab", { name: "ETFs" }).click();
  await expect(page).toHaveURL(/asset=etf/);
  await expect(
    page.getByText("Expense Ratio").filter({ visible: true }).first()
  ).toBeVisible();

  await page.getByRole("tab", { name: "Indices" }).click();
  await expect(page).toHaveURL(/asset=index/);
  await expect(
    page
      .getByText("Reference index — not directly tradable")
      .filter({ visible: true })
      .first()
  ).toBeVisible();

  await page.getByRole("tab", { name: "Stocks" }).click();
  // Wait for the tab change to land in the URL before touching another control.
  // Every control derives the next URL from the last-rendered state, so a
  // second change made while the first navigation is still pending would be
  // computed from the previous tab.
  await expect(page).not.toHaveURL(/asset=/);
  await expect(page.getByRole("tab", { name: "Stocks" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  // 4. Switch markets.
  await page.getByLabel(/market/i).selectOption("JP");
  await expect(page).toHaveURL(/market=JP/);
  await expect(
    page.getByText("7201.DEMO").filter({ visible: true }).first()
  ).toBeVisible();
  await expect(page.getByText("NST.DEMO")).toHaveCount(0);
  await page.getByLabel(/market/i).selectOption("all");

  // 5. Search for a symbol.
  await page.getByLabel("Search").fill("NST");
  await expect(page).toHaveURL(/q=NST/);
  await expect(
    page.getByText("Northstar Software").filter({ visible: true }).first()
  ).toBeVisible();

  // 6. Open an instrument. Role locators ignore the CSS-hidden layout, so this
  // resolves the table link on desktop and the card link on a phone.
  await page
    .getByRole("link", { name: /NST\.DEMO|Northstar Software/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/discover\/stock-us-northstar-software/);
  await expect(
    page.getByRole("heading", { name: "Strategy Match" })
  ).toBeVisible();

  // 7. Add it to the watchlist.
  await page
    .getByRole("button", { name: /Add NST\.DEMO to watchlist/ })
    .click();
  await expect(
    page.getByRole("button", { name: /Remove NST\.DEMO from watchlist/ })
  ).toBeVisible();

  // 8-9. Refresh; confirm it remains in the watchlist.
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Remove NST\.DEMO from watchlist/ })
  ).toBeVisible();
  await page.getByRole("link", { name: "Watchlist" }).click();
  await expect(page).toHaveURL(/\/watchlist$/);
  await expect(page.getByText("Northstar Software")).toBeVisible();

  // 10-11. Apply a stock filter (strategy screener) and confirm results change.
  await page.getByRole("link", { name: "Discover" }).click();
  await page
    .getByRole("checkbox", { name: /Quality at a Reasonable Price/ })
    .check();
  // The screener reports its match count in text, so the same assertion holds
  // in the table layout and the card layout — counting `row` elements would
  // only work where the table is displayed.
  const matchCount = page.getByText(
    /^\d+ stocks? match(es)? the selected criteria\.$/
  );
  await expect(matchCount).toBeVisible();
  const beforeCount = await readLeadingNumber(matchCount);
  expect(beforeCount).toBeGreaterThan(0);

  await page.getByLabel(/Maximum P\/E/i).fill("15");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(async () => readLeadingNumber(matchCount))
    .toBeLessThan(beforeCount);

  // 12. Clear filters.
  await page.getByRole("button", { name: "Clear" }).click();

  // 13. Remove the instrument from the watchlist.
  await page.getByRole("link", { name: "Watchlist" }).click();
  await page
    .getByRole("button", { name: /Remove NST\.DEMO from watchlist/ })
    .click();
  await expect(
    page.getByText("Your watchlist is empty", { exact: false })
  ).toBeVisible();
});

test("ETF filters via URL are applied and clearable", async ({ page }) => {
  await page.goto("/discover?asset=etf&exLeveraged=1");
  await expect(page.getByText("TQ2X.DEMO")).not.toBeVisible();
  await expect(page.getByText(/did not match the filters/)).toBeVisible();
});

test("health endpoint reports demo provider", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.provider).toBe("demo");
});
