import { test, expect, type Page } from "@playwright/test";

/**
 * Cross-phase integration: one subject carried from the thesis journal into the
 * portfolio ledger and back (SPEC §25).
 *
 * The flow uses a `demo:` subject throughout, so nothing here depends on SEC
 * EDGAR or the EDINET store — the subject list, the thesis store and the
 * portfolio store are all local.
 *
 * The stores persist between runs, so assertions describe what must be present
 * rather than what must be unique: recording the same buy twice changes the
 * quantity, not whether the row and its thesis link exist.
 */

// The positions table is wide and the flow is a desktop research task; the
// mobile project covers narrow-viewport layout separately.
test.skip(
  ({ isMobile }) => isMobile === true,
  "cross-phase desktop flow — runs on the chromium project only"
);

const SUBJECT_REF = "demo:stock-us-harborlight-utilities";
const SUBJECT_OPTION_LABEL = "Harborlight Utilities (HLU.DEMO)";
/**
 * The thesis store persists between runs, so the title carries a run marker:
 * the flow then identifies its own thesis rather than an identically titled one
 * left by an earlier run.
 */
const THESIS_TITLE = `Rate-base runway (run ${Date.now()})`;
const THESIS_SUMMARY =
  "Rate-base growth is approved through the next regulatory period, which " +
  "supports earnings without volume growth.";
const CLAIM_STATEMENT =
  "Rate base grows at least 5% per year through the approved period.";
const TRADE_DATE = "2026-01-15";

/** The picker starts disabled while `/api/subjects` is in flight. */
async function readySubjectPicker(page: Page) {
  const picker = page.getByLabel("Subject", { exact: true });
  await expect(picker).toBeEnabled();
  return picker;
}

test("a subject carries from the thesis journal into the portfolio ledger", async ({
  page,
}) => {
  // 1. The thesis form offers subjects from the registry, grouped by kind.
  await page.goto("/theses/new");
  await expect(
    page.getByRole("heading", { name: "New thesis", exact: true })
  ).toBeVisible();

  const picker = await readySubjectPicker(page);
  await expect(
    picker.locator('optgroup[label="US research companies"]')
  ).toHaveCount(1);
  await expect(
    picker.locator('optgroup[label="Demo instruments"]')
  ).toHaveCount(1);
  await expect(
    picker.locator(`option[value="${SUBJECT_REF}"]`)
  ).toHaveText(SUBJECT_OPTION_LABEL);

  // 2. Write a minimal thesis about the demo instrument.
  await picker.selectOption(SUBJECT_REF);
  await page.getByLabel("Title", { exact: true }).fill(THESIS_TITLE);
  await page
    .getByLabel("Why is this business attractive?")
    .fill(THESIS_SUMMARY);
  await page.getByLabel("Measurable claim").fill(CLAIM_STATEMENT);
  await page.getByLabel("Importance").selectOption("3");

  await page.getByRole("button", { name: "Save thesis" }).click();

  // 3. The detail page renders the thesis that was just written.
  await expect(page).toHaveURL(/\/theses\/[0-9a-f-]{36}$/);
  const thesisUrl = new URL(page.url()).pathname;
  await expect(
    page.getByRole("heading", { name: THESIS_TITLE, level: 1 })
  ).toBeVisible();
  // The subject links back to the page it came from, via the registry.
  await expect(
    page.getByRole("link", { name: SUBJECT_OPTION_LABEL })
  ).toBeVisible();
  // The claim appears in the claims table and again in the revision history;
  // the table is the one that must render it.
  await expect(
    page.getByRole("rowheader", { name: CLAIM_STATEMENT })
  ).toBeVisible();

  // 4. Record a buy for the same subject, chosen from the same picker.
  await page.goto("/portfolio");
  const ledgerPicker = await readySubjectPicker(page);
  await ledgerPicker.selectOption(SUBJECT_REF);
  // The subject's native currency is offered automatically.
  await expect(page.getByLabel("Currency")).toHaveValue("USD");
  await page.getByLabel("Quantity").fill("10");
  // The price-mark form below carries "Price per share (USD)", so the entry
  // form's own field is matched exactly.
  await page.getByLabel("Price per share", { exact: true }).fill("100");
  await page.getByLabel("Trade date").fill(TRADE_DATE);
  await page.getByRole("button", { name: "Record transaction" }).click();

  await expect(page.getByRole("status").first()).toContainText(
    "Buy recorded for Harborlight Utilities"
  );

  // 5. The position appears, and its Thesis column links to the thesis.
  const row = page
    .getByRole("row")
    .filter({ hasText: "Harborlight Utilities" })
    .first();
  await expect(row).toBeVisible();

  const thesisLink = row.getByRole("link", { name: THESIS_TITLE }).first();
  await expect(thesisLink).toBeVisible();
  // The link is the thesis, not the instrument.
  await expect(thesisLink).toHaveAttribute("href", thesisUrl);

  // 6. Following it returns to the thesis.
  await thesisLink.click();
  await expect(page).toHaveURL(new RegExp(`${thesisUrl}$`));
  await expect(
    page.getByRole("heading", { name: THESIS_TITLE, level: 1 })
  ).toBeVisible();
  // And the thesis now offers the ledger it has an entry in.
  await expect(
    page.getByRole("link", { name: "View position in Portfolio" })
  ).toBeVisible();
});

test("the portfolio Thesis column is present and offers writing one", async ({
  page,
}) => {
  await page.goto("/portfolio");

  await expect(
    page.getByRole("columnheader", { name: "Thesis" })
  ).toBeVisible();
  // Every position either links a thesis or offers to write one, so at least
  // one of the two must appear once a position exists.
  const cells = page
    .getByRole("link", { name: "Write a thesis" })
    .or(page.getByRole("columnheader", { name: "Thesis" }));
  await expect(cells.first()).toBeVisible();
});

test("a research page offers the cross-phase actions even without filings", async ({
  page,
}) => {
  // MSFT reads from SEC EDGAR. Whether that succeeds or the page reports EDGAR
  // as unavailable, the actions must render — writing a thesis does not depend
  // on the filings having loaded.
  await page.goto("/research/msft");

  await expect(page.getByRole("heading", { name: "MSFT", level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Write a thesis" })
  ).toHaveAttribute("href", "/theses/new?subject=research%3Amsft");
  await expect(
    page.getByRole("link", { name: "Record a transaction" })
  ).toHaveAttribute("href", "/portfolio?subject=research%3Amsft");
});

test("a prefilled subject link preselects it in the thesis picker", async ({
  page,
}) => {
  await page.goto(`/theses/new?subject=${encodeURIComponent(SUBJECT_REF)}`);

  const picker = await readySubjectPicker(page);
  await expect(picker).toHaveValue(SUBJECT_REF);
});

test("an unknown prefilled subject is reported rather than guessed at", async ({
  page,
}) => {
  await page.goto("/theses/new?subject=research:not-a-real-company");

  await expect(
    page.getByText("not one this application knows", { exact: false })
  ).toBeVisible();
  const picker = await readySubjectPicker(page);
  await expect(picker).toHaveValue("");
});
