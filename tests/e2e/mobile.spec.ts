import { test, expect } from "@playwright/test";

/**
 * D6 narrow-viewport behaviour, exercised by the Pixel 7 project. Discovery
 * renders the same rows as a table from `md` up and as cards below it; these
 * tests assert the card layout is the one a phone actually gets, and that the
 * primary actions fit without sideways scrolling.
 */

// The desktop project would assert the opposite layout, so skip it entirely
// rather than branching every assertion.
test.skip(
  ({ isMobile }) => !isMobile,
  "narrow-viewport layout — runs on the mobile project only"
);

/** Widths can land on a fraction of a device pixel; one CSS pixel of slack. */
const SCROLL_TOLERANCE_PX = 1;

async function horizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

test("Discovery shows result cards, not the results table", async ({
  page,
}) => {
  await page.goto("/discover");

  // The table markup is still in the DOM (it is CSS-hidden, not unmounted), so
  // assert on visibility rather than presence.
  await expect(page.getByRole("table")).toBeHidden();

  const cards = page.getByRole("listitem").filter({ hasText: "NST.DEMO" });
  await expect(cards.first()).toBeVisible();
  // Card layout facts: symbol, name, and the key metrics as a definition list.
  await expect(
    page.getByText("Northstar Software").filter({ visible: true }).first()
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /NST\.DEMO/ }).first()
  ).toBeVisible();
});

test("the page does not scroll sideways and primary actions are reachable", async ({
  page,
}) => {
  await page.goto("/discover");

  // Wait for results before measuring, so the page is at its full height.
  await expect(
    page.getByRole("link", { name: /NST\.DEMO/ }).first()
  ).toBeVisible();

  const { scrollWidth, innerWidth } = await horizontalOverflow(page);
  expect(
    scrollWidth,
    `document is ${scrollWidth}px wide in a ${innerWidth}px viewport`
  ).toBeLessThanOrEqual(innerWidth + SCROLL_TOLERANCE_PX);

  // The primary actions must sit inside the viewport without a sideways scroll.
  for (const action of [
    page.getByRole("tab", { name: "ETFs" }),
    page.getByRole("searchbox", { name: "Search" }),
    page.getByRole("combobox", { name: "Market" }),
    page.getByRole("button", { name: /to watchlist$/ }).first(),
  ]) {
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) continue;
    expect(box.x).toBeGreaterThanOrEqual(-SCROLL_TOLERANCE_PX);
    expect(box.x + box.width).toBeLessThanOrEqual(
      innerWidth + SCROLL_TOLERANCE_PX
    );
  }
});

test("the ETF filter panel collapses behind a Filters disclosure", async ({
  page,
}) => {
  await page.goto("/discover?asset=etf");

  const disclosure = page.getByRole("button", { name: /^Filters/ });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");

  // Collapsed: the eight filter controls are not on screen and not in the tab
  // order — the panel unmounts them rather than merely hiding them.
  const category = page.getByLabel("Category");
  await expect(category).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply filters" })).toHaveCount(
    0
  );

  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(category).toBeVisible();
  await expect(page.getByLabel("Exposure region")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Exclude leveraged ETFs" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply filters" })
  ).toBeVisible();

  // Collapsing again puts the results back in view.
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(category).toHaveCount(0);
});

test("the Filters disclosure shows an active-filter count", async ({
  page,
}) => {
  // Filters live in the URL, so arriving on a shared link must show the badge
  // even though the panel starts collapsed.
  await page.goto("/discover?asset=etf&exLeveraged=1");

  const disclosure = page.getByRole("button", { name: /^Filters/ });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(disclosure).toContainText("1 active");

  // A second filter is counted too, and the count comes from the URL rather
  // than from the collapsed form's draft state.
  await page.goto("/discover?asset=etf&exLeveraged=1&exInverse=1");
  await expect(page.getByRole("button", { name: /^Filters/ })).toContainText(
    "2 active"
  );

  // No active filters, no badge.
  await page.goto("/discover?asset=etf");
  await expect(page.getByRole("button", { name: /^Filters/ })).not.toContainText(
    "active"
  );
});

test("the demo notice and the disclaimer are visible on a phone", async ({
  page,
}) => {
  await page.goto("/discover");

  await expect(
    page
      .getByText("Demo data — not current market information.")
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  await expect(
    page.getByText(
      "Market Thesis is a research tool, not financial advice",
      { exact: false }
    )
  ).toBeVisible();
  // The header's persistent demo badge must not be pushed off-screen.
  await expect(
    page.getByText("Demo data", { exact: true }).filter({ visible: true })
  ).toBeVisible();
});

test("an instrument detail page fits the viewport", async ({ page }) => {
  await page.goto("/discover/stock-us-northstar-software");

  await expect(page.getByRole("heading", { name: "NST.DEMO" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /NST\.DEMO (to|from) watchlist/ })
  ).toBeVisible();

  const { scrollWidth, innerWidth } = await horizontalOverflow(page);
  expect(
    scrollWidth,
    `detail page is ${scrollWidth}px wide in a ${innerWidth}px viewport`
  ).toBeLessThanOrEqual(innerWidth + SCROLL_TOLERANCE_PX);
});
