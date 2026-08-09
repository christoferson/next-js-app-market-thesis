# D6 Implementation Guide

Final Discovery milestone — quality and release polish for a **demo release**
(user-approved; no live provider). All D1–D4 invariants apply.

## D6 core (already built)

- Playwright installed (`@playwright/test`, chromium); `npm run test:e2e`;
  `playwright.config.ts` boots a production build on port 3210 (webServer),
  desktop + mobile (Pixel 7) projects.
- `tests/e2e/smoke.spec.ts` — the SPEC §20.7 13-step core flow, ETF URL
  filters, and health check. 3 tests green on chromium.
- `lib/discovery/filter-chips.ts` — `buildFilterChips(state)` returns
  removable chips (search, each ETF filter, index sort) with pure `remove`
  functions; `clearAllFilters(state)` clears query + etfFilters + indexSort,
  keeps tab/market. NOT yet wired into the UI.

## Remaining D6 work

1. **Chips UI** — render buildFilterChips output under the controls row in
   DiscoveryControls (when >0 chips): each chip is a button "label ×" with
   accessible name "Remove filter: {label}" that navigates via chip.remove(state);
   plus a "Clear all filters" button using clearAllFilters. Chips reflect
   URL-backed refinements only (stock-screener client state has its own Clear).
2. **Mobile filter sheet** — on <md screens, the ETF filter panel collapses
   into a disclosure ("Filters" button with aria-expanded, count badge when
   active) instead of always-open fieldset. Keep desktop unchanged. No
   dialog/portal library — a simple collapsible region is fine.
3. **A11y sweep** — verify/fix across discover, detail, watchlist, about:
   focus-visible on ALL interactive elements; logical heading order (one h1);
   tab order; aria-current on active nav link; table caption/scope (exists —
   verify); status messages via role=status (exists in places — verify);
   skip-to-content link in the dashboard layout; prefers-reduced-motion:
   no transitions that violate it (transitions are subtle — add
   motion-reduce:transition-none where transitions exist); form inputs all
   labeled (verify); color contrast: stone-500-on-white is borderline for
   small text — bump to stone-600 where it carries information.
4. **Error/empty polish** — error states preserve state ("Your filters and
   watchlist have not been lost."); watchlist unavailable-instrument note;
   API route logging: confirm no credentials/stack traces in responses
   (route code already clean — verify).
5. **E2E additions** — keyboard-navigation spec (tab through asset tabs with
   arrow keys, activate watchlist button with keyboard), mobile spec
   (Pixel 7 project: cards render, no horizontal scroll for primary actions,
   filter sheet opens), a11y-basics spec (headings, labels, skip link).
6. **Docs** — README: demo-release status, all scripts incl. test:e2e,
   limitations section (demo data, no live provider, J-Quants/licensing
   notes reference), unsupported sectors/asset types. Update PROGRESS.md.

## Hard rules

Language/financial-integrity rules unchanged. No new heavy dependencies
(Playwright already added). Do not break the 594 unit tests or 3 e2e tests.
Demo-release framing: docs must say "Demo release — no live market-data
provider configured." (SPEC §26).
