import { test, expect, type Page } from "@playwright/test";

/**
 * D6 keyboard-navigation coverage. Every control a user needs to browse
 * Discovery must be reachable and operable without a pointer, so these tests
 * only ever use Tab, arrow keys, Enter and Space.
 *
 * Pixel 7 emulates touch, which Chromium honours for `Tab` as well — focus
 * still moves, so these tests run on both projects unless noted.
 */

/** The element that currently has focus, as `tag[role|name]` for readable failures. */
async function focusDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return "none";
    const tag = element.tagName.toLowerCase();
    const label =
      element.getAttribute("aria-label") ??
      element.textContent?.trim().slice(0, 40) ??
      "";
    return `${tag}[${label}]`;
  });
}

test("the skip link is the first stop and moves focus into main", async ({
  page,
}) => {
  await page.goto("/discover");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  // The link is visually hidden until focused; a keyboard user must see it.
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  // `main` carries tabIndex={-1} precisely so activating the link moves focus
  // rather than only moving the URL fragment.
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("arrow keys move asset-tab selection, and Home and End jump to the ends", async ({
  page,
}) => {
  await page.goto("/discover");

  const stocks = page.getByRole("tab", { name: "Stocks" });
  const etfs = page.getByRole("tab", { name: "ETFs" });
  const indices = page.getByRole("tab", { name: "Indices" });

  // Roving tabindex: only the selected tab is in the tab sequence.
  await expect(stocks).toHaveAttribute("tabindex", "0");
  await expect(etfs).toHaveAttribute("tabindex", "-1");
  await expect(indices).toHaveAttribute("tabindex", "-1");

  // Each key press is preceded by an explicit focus of the currently selected
  // tab. Focus is not always retained across a tab change (see the fixme test
  // below), and this test is about which tab the keys *select*.
  await stocks.focus();
  await expect(stocks).toBeFocused();

  // ArrowRight moves selection (selection-follows-focus): the tab, the URL and
  // the results all change together.
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/asset=etf/);
  await expect(etfs).toHaveAttribute("aria-selected", "true");
  await expect(stocks).toHaveAttribute("aria-selected", "false");
  await expect(etfs).toHaveAttribute("tabindex", "0");

  await etfs.focus();
  await page.keyboard.press("End");
  await expect(page).toHaveURL(/asset=index/);
  await expect(indices).toHaveAttribute("aria-selected", "true");

  await indices.focus();
  await page.keyboard.press("Home");
  await expect(page).not.toHaveURL(/asset=/);
  await expect(stocks).toHaveAttribute("aria-selected", "true");

  // ArrowLeft from the first tab wraps to the last.
  await stocks.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/asset=index/);
  await expect(indices).toHaveAttribute("aria-selected", "true");
});

test("arrow keys keep focus on the newly selected asset tab", async ({
  page,
}) => {
  await page.goto("/discover?asset=etf");

  const etfs = page.getByRole("tab", { name: "ETFs" });
  const indices = page.getByRole("tab", { name: "Indices" });

  await etfs.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/asset=index/);
  await expect(indices).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(page).toHaveURL(/asset=etf/);
  await expect(etfs).toBeFocused();
});

/**
 * KNOWN PRODUCT BUG (not a spec problem). Arrow-keying across the Stocks
 * boundary loses keyboard focus to `<body>`, so the user's place in the page is
 * gone and the next Tab restarts from the top of the document. Selection and
 * the URL are correct; only focus is dropped.
 *
 * Cause: `/discover` renders the Stocks tab as
 * `<StockScreener><DiscoveryControls/></StockScreener>` and the other tabs as a
 * bare `<DiscoveryControls/>`. Crossing that boundary changes the element type
 * at that position in the tree, so React unmounts and remounts the whole
 * subtree — including `AssetTabs` — and the focused button is destroyed after
 * `selectIndex` focused it. Transitions that stay within one branch
 * (ETFs ↔ Indices) keep the same DOM node and keep focus, which is why the test
 * above passes.
 *
 * Fixing it means changing `app/(dashboard)/discover/page.tsx` (render one
 * stable wrapper for all tabs) or `AssetTabs` (restore focus after commit),
 * both outside this spec's scope. Unskip this test once that is done.
 */
test(
  "arrow keys keep focus when crossing the Stocks tab boundary",
  async ({ page }) => {
    await page.goto("/discover");

    await page.getByRole("tab", { name: "Stocks" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/asset=etf/);
    await expect(page.getByRole("tab", { name: "ETFs" })).toBeFocused();
  }
);

test("the results tab panel is reachable by Tab from the tabs", async ({
  page,
}) => {
  await page.goto("/discover?asset=index");

  await page.getByRole("tab", { name: "Indices" }).focus();
  // Tab must leave the tablist entirely rather than walking the unselected
  // tabs — that is what the roving tabindex buys.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tab", { name: "ETFs" })).not.toBeFocused();
  expect(await focusDescription(page)).not.toContain("Indices");
});

test("a watchlist button toggles with Enter and with Space", async ({
  page,
}) => {
  // A single-result search keeps exactly one watchlist button on the page, in
  // both the table and the card layout.
  await page.goto("/discover?q=NST");

  const add = page.getByRole("button", { name: "Add NST.DEMO to watchlist" });
  await add.focus();
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Enter");
  const remove = page.getByRole("button", {
    name: "Remove NST.DEMO from watchlist",
  });
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  // Focus must survive the label change, or a keyboard user loses their place.
  await expect(remove).toBeFocused();

  await page.keyboard.press(" ");
  await expect(
    page.getByRole("button", { name: "Add NST.DEMO to watchlist" })
  ).toHaveAttribute("aria-pressed", "false");
});

test("a watchlist button is reachable by Tab from the search box", async ({
  page,
}) => {
  await page.goto("/discover?q=NST");

  // `getByLabel("Search")` is ambiguous here: an active search also renders a
  // "Remove filter: Search: NST" chip. Address the searchbox by role.
  await page.getByRole("searchbox", { name: "Search" }).focus();

  // Walk forward a bounded number of stops; the button must appear in the
  // natural tab order rather than needing a programmatic focus call.
  const target = page.getByRole("button", {
    name: "Add NST.DEMO to watchlist",
  });
  let reached = false;
  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((node) => node === document.activeElement)) {
      reached = true;
      break;
    }
  }
  expect(
    reached,
    `watchlist button was not reachable by Tab; focus stopped at ${await focusDescription(page)}`
  ).toBe(true);
});

test("pagination is reachable and operable by keyboard", async ({ page }) => {
  // 12 demo stocks at pageSize 25 fit on one page, so use the ETF tab with a
  // narrow page to guarantee a second page exists.
  await page.goto("/discover?asset=etf");

  const pager = page.getByRole("navigation", { name: "Results pagination" });
  const previous = pager.getByRole("button", {
    name: "Previous page of results",
  });
  const next = pager.getByRole("button", { name: "Next page of results" });

  await expect(pager).toBeVisible();
  // The demo ETF universe is one page, so both controls are correctly
  // disabled — a disabled control must still be announced, not removed.
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();

  // On a page that does have a previous page, Enter must navigate back.
  await page.goto("/discover?asset=etf&page=2");
  const previousOnPageTwo = page.getByRole("button", {
    name: "Previous page of results",
  });
  await expect(previousOnPageTwo).toBeEnabled();
  await previousOnPageTwo.focus();
  await expect(previousOnPageTwo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/page=2/);
  await expect(
    page.getByRole("button", { name: "Previous page of results" })
  ).toBeDisabled();
});

test("the ETF filter form can be filled and submitted by keyboard", async ({
  page,
  isMobile,
}) => {
  await page.goto("/discover?asset=etf");

  if (isMobile) {
    // Below `md` the fields sit behind a disclosure, which must itself be
    // keyboard-operable before anything inside it can be reached.
    const disclosure = page.getByRole("button", { name: /^Filters/ });
    await disclosure.focus();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  }

  const excludeLeveraged = page.getByRole("checkbox", {
    name: "Exclude leveraged ETFs",
  });
  await excludeLeveraged.focus();
  await page.keyboard.press(" ");
  await expect(excludeLeveraged).toBeChecked();

  const apply = page.getByRole("button", { name: "Apply filters" });
  await apply.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/exLeveraged=1/);

  // The applied filter is announced as a removable chip, also keyboard-operable.
  const chip = page.getByRole("button", {
    name: "Remove filter: Excluding leveraged",
  });
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/exLeveraged/);
});
