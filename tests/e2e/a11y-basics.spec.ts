import { test, expect, type Page } from "@playwright/test";

/**
 * D6 accessibility basics: one h1 per page, every form control labelled,
 * `aria-current` on the active nav link, and asset-specific language that a
 * screen-reader user actually reaches. These are structural checks — they run
 * identically on both projects.
 */

const MAIN_PAGES: ReadonlyArray<{ path: string; heading: string }> = [
  { path: "/discover", heading: "Discover" },
  { path: "/discover/stock-us-northstar-software", heading: "NST.DEMO" },
  { path: "/watchlist", heading: "Watchlist" },
  { path: "/about", heading: "About Market Thesis" },
];

for (const { path, heading } of MAIN_PAGES) {
  test(`${path} has exactly one h1`, async ({ page }) => {
    await page.goto(path);

    const level1 = page.getByRole("heading", { level: 1 });
    await expect(level1).toHaveCount(1);
    await expect(level1).toHaveText(heading);
    await expect(level1).toBeVisible();

    // Heading order must not skip a level: an h3 may only follow an h2.
    const levels = await page
      .locator("h1, h2, h3, h4, h5, h6")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const style = window.getComputedStyle(node);
            return style.display !== "none" && style.visibility !== "hidden";
          })
          .map((node) => Number(node.tagName.slice(1)))
      );
    expect(levels[0]).toBe(1);
    for (let index = 1; index < levels.length; index += 1) {
      const jump = levels[index]! - levels[index - 1]!;
      expect(
        jump,
        `heading level jumped from h${levels[index - 1]} to h${levels[index]}`
      ).toBeLessThanOrEqual(1);
    }
  });
}

/**
 * Every rendered form control, with the accessible name the browser computes
 * from a label, `aria-label` or `aria-labelledby`. Hidden controls are skipped:
 * on a phone the desktop table's markup is present but not exposed.
 */
async function unlabelledControls(page: Page): Promise<string[]> {
  return page
    .locator("input, select, textarea")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .filter((node) => {
          const element = node as HTMLInputElement;
          const labelledBy = element.getAttribute("aria-labelledby");
          const labelled =
            labelledBy !== null &&
            labelledBy
              .split(/\s+/)
              .some(
                (id) => (document.getElementById(id)?.textContent ?? "").trim() !== ""
              );
          const ariaLabel = (element.getAttribute("aria-label") ?? "").trim();
          const labelText = element.labels
            ? [...element.labels]
                .map((label) => label.textContent ?? "")
                .join("")
                .trim()
            : "";
          const title = (element.getAttribute("title") ?? "").trim();
          return (
            !labelled && ariaLabel === "" && labelText === "" && title === ""
          );
        })
        .map((node) => {
          const element = node as HTMLInputElement;
          return `${element.tagName.toLowerCase()}#${element.id || "(no id)"}[type=${
            element.getAttribute("type") ?? "text"
          }]`;
        })
    );
}

test("every form control on the Stocks tab has an accessible name", async ({
  page,
}) => {
  await page.goto("/discover");

  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
  expect(await unlabelledControls(page)).toEqual([]);

  // Enabling the strategy reveals the screener's filter and sort controls.
  await page
    .getByRole("checkbox", { name: /Quality at a Reasonable Price/ })
    .check();
  await expect(page.getByLabel(/Maximum P\/E/i)).toBeVisible();
  expect(await unlabelledControls(page)).toEqual([]);
});

test("every form control on the ETFs tab has an accessible name", async ({
  page,
  isMobile,
}) => {
  await page.goto("/discover?asset=etf");

  if (isMobile) {
    // The fields are behind a disclosure below `md`; open it so they render.
    await page.getByRole("button", { name: /^Filters/ }).click();
  }
  await expect(page.getByLabel("Category")).toBeVisible();
  await expect(page.getByLabel(/Maximum expense ratio/)).toBeVisible();
  expect(await unlabelledControls(page)).toEqual([]);
});

test("every form control on the Indices tab has an accessible name", async ({
  page,
}) => {
  await page.goto("/discover?asset=index&sortField=yearToDateReturn&sortDir=desc");

  await expect(page.getByLabel("Sort by")).toBeVisible();
  await expect(page.getByLabel("Order")).toBeVisible();
  expect(await unlabelledControls(page)).toEqual([]);
});

test("the active navigation link is marked with aria-current", async ({
  page,
}) => {
  const nav = () => page.getByRole("navigation", { name: "Main" });

  await page.goto("/discover");
  await expect(nav().getByRole("link", { name: "Discover" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  // Exactly one link may claim to be the current page.
  await expect(nav().locator("[aria-current='page']")).toHaveCount(1);

  await page.goto("/watchlist");
  await expect(nav().getByRole("link", { name: "Watchlist" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(nav().locator("[aria-current='page']")).toHaveCount(1);

  await page.goto("/about");
  await expect(nav().getByRole("link", { name: "About" })).toHaveAttribute(
    "aria-current",
    "page"
  );

  // A detail route keeps its section marked as current.
  await page.goto("/discover/stock-us-northstar-software");
  await expect(nav().getByRole("link", { name: "Discover" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(nav().locator("[aria-current='page']")).toHaveCount(1);
});

test("the results table exposes a caption and header scopes", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the table is only displayed from the md breakpoint up");

  await page.goto("/discover?asset=index");

  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  // The caption explains that an index level is not a share price.
  await expect(table.locator("caption")).toContainText(
    "Index levels are not share prices"
  );
  // Every column header is scoped, and each row is identified by a row header.
  const unscoped = await table
    .locator("thead th")
    .evaluateAll((nodes) =>
      nodes.filter((node) => node.getAttribute("scope") !== "col").length
    );
  expect(unscoped).toBe(0);
  await expect(table.locator("tbody th[scope='row']").first()).toBeVisible();
});

test("the Indices tab states that an index is not directly tradable", async ({
  page,
}) => {
  await page.goto("/discover?asset=index");

  // Asset-specific language must reach the user in whichever layout renders.
  await expect(
    page
      .getByText("Reference index — not directly tradable")
      .filter({ visible: true })
      .first()
  ).toBeVisible();

  // And on the detail page, where it is the primary caveat.
  await page.goto("/discover/index-jp-tokyo-demo-225");
  await expect(
    page
      .getByText("Reference index — not directly tradable")
      .filter({ visible: true })
      .first()
  ).toBeVisible();
  await expect(
    page.getByText("An index level is a benchmark reading, not a share price.")
  ).toBeVisible();
});

test("filter chips are labelled, removable, and clearable in bulk", async ({
  page,
}) => {
  await page.goto("/discover?asset=etf&exLeveraged=1");

  const group = page.getByRole("group", { name: "Active refinements" });
  await expect(group).toBeVisible();

  // The chip's accessible name says what removing it will do — the visible "×"
  // alone would announce as nothing useful.
  const chip = group.getByRole("button", {
    name: "Remove filter: Excluding leveraged",
  });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("Excluding leveraged");

  await chip.click();
  await expect(page).not.toHaveURL(/exLeveraged/);
  await expect(group).toHaveCount(0);
});

test("Clear all filters removes every refinement but keeps tab and market", async ({
  page,
}) => {
  await page.goto(
    "/discover?asset=etf&market=US&q=BRDX&exLeveraged=1&exInverse=1"
  );

  const group = page.getByRole("group", { name: "Active refinements" });
  // Search plus both exclusions.
  await expect(group.getByRole("listitem")).toHaveCount(3);

  await group.getByRole("button", { name: "Clear all filters" }).click();

  // Refinements gone…
  await expect(page).not.toHaveURL(/exLeveraged|exInverse|q=/);
  await expect(group).toHaveCount(0);
  // …while the tab and market selection survive.
  await expect(page).toHaveURL(/asset=etf/);
  await expect(page).toHaveURL(/market=US/);
  await expect(page.getByRole("tab", { name: "ETFs" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByRole("combobox", { name: "Market" })).toHaveValue("US");
});

test("loading and pagination status messages are announced", async ({
  page,
}) => {
  await page.goto("/discover?asset=etf");

  // The results region is a tab panel labelled by its tab, with a status line
  // for in-flight navigation.
  const panel = page.getByRole("tabpanel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("[role='status']")).toHaveCount(1);

  // Pagination reports its position in a live region rather than by colour.
  await expect(
    page
      .getByRole("navigation", { name: "Results pagination" })
      .getByText(/Page 1 of \d+/)
  ).toBeVisible();
});
