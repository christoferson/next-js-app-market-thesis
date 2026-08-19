import { describe, expect, it, vi } from "vitest";

/** The registry is server-only; neutralize the guard for node-env tests. */
vi.mock("server-only", () => ({}));

import {
  listSubjects,
  resolveSubject,
  subjectHref,
  type Subject,
  type SubjectScope,
} from "@/lib/subjects/registry";
import { getDemoSnapshots } from "@/data/demo";
import { RESEARCH_UNIVERSE } from "@/lib/research/universe";
import { JAPAN_RESEARCH_UNIVERSE } from "@/lib/research/edinet/universe";

/**
 * The registry is the boundary that turns a `scope:id` string into a known
 * subject, so these tests pin the reference format, the routes, and the
 * rejection of anything unknown — a typo must not resolve to a subject that
 * a thesis or transaction could then be silently attached to.
 */

const US_RESEARCH_COUNT = 10;
const JP_RESEARCH_COUNT = 6;
const DEMO_COUNT = 26;
const TOTAL_COUNT = US_RESEARCH_COUNT + JP_RESEARCH_COUNT + DEMO_COUNT;

const REF_PATTERN = /^(demo|research|research-jp):[a-z0-9][a-z0-9-]*$/;

/** Index access with a clear failure instead of an `undefined` deep-equal. */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Expected an item at index ${index} of ${items.length}.`);
  }
  return item;
}

function requireSubject(subject: Subject | null): Subject {
  if (subject === null) throw new Error("Expected the subject to resolve.");
  return subject;
}

function subjectsOfScope(scope: SubjectScope): Subject[] {
  return listSubjects().filter((subject) => subject.scope === scope);
}

describe("listSubjects", () => {
  it("covers the US research, JP research and demo universes exactly once", () => {
    const subjects = listSubjects();

    expect(subjects).toHaveLength(TOTAL_COUNT);
    expect(subjectsOfScope("research")).toHaveLength(US_RESEARCH_COUNT);
    expect(subjectsOfScope("research-jp")).toHaveLength(JP_RESEARCH_COUNT);
    expect(subjectsOfScope("demo")).toHaveLength(DEMO_COUNT);
  });

  it("matches the source universes it is built from", () => {
    expect(RESEARCH_UNIVERSE).toHaveLength(US_RESEARCH_COUNT);
    expect(JAPAN_RESEARCH_UNIVERSE).toHaveLength(JP_RESEARCH_COUNT);
    expect(getDemoSnapshots()).toHaveLength(DEMO_COUNT);

    expect(subjectsOfScope("research").map((subject) => subject.id)).toEqual(
      RESEARCH_UNIVERSE.map((company) => company.id)
    );
    expect(subjectsOfScope("research-jp").map((subject) => subject.id)).toEqual(
      JAPAN_RESEARCH_UNIVERSE.map((company) => company.id)
    );
    expect(subjectsOfScope("demo").map((subject) => subject.id)).toEqual(
      getDemoSnapshots().map((snapshot) => snapshot.instrument.id)
    );
  });

  it("gives every subject a unique ref", () => {
    const refs = listSubjects().map((subject) => subject.ref);

    expect(new Set(refs).size).toBe(refs.length);
  });

  it("formats every ref as a known scope plus a slug id", () => {
    for (const subject of listSubjects()) {
      expect(subject.ref).toMatch(REF_PATTERN);
      expect(subject.ref).toBe(`${subject.scope}:${subject.id}`);
    }
  });

  it("groups subjects in a stable order: US research, JP research, demo", () => {
    const groups: string[] = [];
    for (const subject of listSubjects()) {
      if (groups[groups.length - 1] !== subject.groupLabel) {
        groups.push(subject.groupLabel);
      }
    }

    expect(groups).toEqual([
      "US research companies",
      "Japanese research companies",
      "Demo instruments",
    ]);
  });

  it("keeps one group label per scope", () => {
    const labelsByScope = new Map<SubjectScope, Set<string>>();
    for (const subject of listSubjects()) {
      const labels = labelsByScope.get(subject.scope) ?? new Set<string>();
      labels.add(subject.groupLabel);
      labelsByScope.set(subject.scope, labels);
    }

    expect([...labelsByScope.keys()].sort()).toEqual([
      "demo",
      "research",
      "research-jp",
    ]);
    for (const labels of labelsByScope.values()) {
      expect(labels.size).toBe(1);
    }
  });

  it("gives every subject a non-empty label, symbol and href", () => {
    for (const subject of listSubjects()) {
      expect(subject.label.length).toBeGreaterThan(0);
      expect(subject.label.trim()).toBe(subject.label);
      expect(subject.symbol.length).toBeGreaterThan(0);
      expect(subject.href.startsWith("/")).toBe(true);
      expect(subject.href.length).toBeGreaterThan(1);
      expect(subject.groupLabel.length).toBeGreaterThan(0);
    }
  });

  it("includes the symbol in the label so a picker can be searched", () => {
    for (const subject of listSubjects()) {
      expect(subject.label).toContain(subject.symbol);
    }
  });

  it("prices every US research company in USD", () => {
    const currencies = subjectsOfScope("research").map(
      (subject) => subject.currency
    );

    expect(currencies).toHaveLength(US_RESEARCH_COUNT);
    expect(new Set(currencies)).toEqual(new Set(["USD"]));
  });

  it("prices every Japanese research company in JPY", () => {
    const currencies = subjectsOfScope("research-jp").map(
      (subject) => subject.currency
    );

    expect(currencies).toHaveLength(JP_RESEARCH_COUNT);
    expect(new Set(currencies)).toEqual(new Set(["JPY"]));
  });

  it("carries each demo instrument's own native currency", () => {
    // Currency must come from the instrument, never from the listing country
    // being assumed: the registry copies what the demo snapshot declares.
    const currencyByInstrument = new Map(
      getDemoSnapshots().map((snapshot) => [
        snapshot.instrument.id,
        snapshot.instrument.currency,
      ])
    );

    for (const subject of subjectsOfScope("demo")) {
      expect(subject.currency).toBe(currencyByInstrument.get(subject.id));
    }
  });

  it("keeps a known JPY demo instrument in JPY", () => {
    const sakura = requireSubject(
      resolveSubject("demo:stock-jp-sakura-automation")
    );

    expect(sakura.currency).toBe("JPY");
    expect(sakura.label).toBe("Sakura Automation (7201.DEMO)");
    expect(sakura.symbol).toBe("7201.DEMO");
  });

  it("keeps a known USD demo instrument in USD", () => {
    const northstar = requireSubject(
      resolveSubject("demo:stock-us-northstar-software")
    );

    expect(northstar.currency).toBe("USD");
    expect(northstar.label).toBe("Northstar Software (NST.DEMO)");
  });

  it("includes both currencies and all three demo asset kinds", () => {
    const demoSubjects = subjectsOfScope("demo");
    const currencies = new Set(demoSubjects.map((subject) => subject.currency));

    expect(currencies).toEqual(new Set(["USD", "JPY"]));
    expect(
      demoSubjects.some((subject) => subject.id.startsWith("stock-"))
    ).toBe(true);
    expect(demoSubjects.some((subject) => subject.id.startsWith("etf-"))).toBe(
      true
    );
    expect(
      demoSubjects.some((subject) => subject.id.startsWith("index-"))
    ).toBe(true);
  });

  it("exposes only the documented subject fields", () => {
    expect(Object.keys(at(listSubjects(), 0)).sort()).toEqual([
      "currency",
      "groupLabel",
      "href",
      "id",
      "label",
      "ref",
      "scope",
      "symbol",
    ]);
  });

  it("returns the same array instance on repeated calls", () => {
    // The list is module-cached: pickers and validators call this per request.
    expect(listSubjects()).toBe(listSubjects());
  });
});

describe("subject routes", () => {
  it("routes US research companies to /research/{id}", () => {
    expect(requireSubject(resolveSubject("research:msft")).href).toBe(
      "/research/msft"
    );
    expect(requireSubject(resolveSubject("research:aapl")).href).toBe(
      "/research/aapl"
    );
  });

  it("routes Japanese research companies to /research/jp/{id}", () => {
    expect(requireSubject(resolveSubject("research-jp:toyota")).href).toBe(
      "/research/jp/toyota"
    );
    expect(
      requireSubject(resolveSubject("research-jp:fast-retailing")).href
    ).toBe("/research/jp/fast-retailing");
  });

  it("routes demo instruments to /discover/{id}", () => {
    expect(
      requireSubject(resolveSubject("demo:index-jp-tokyo-demo-225")).href
    ).toBe("/discover/index-jp-tokyo-demo-225");
    expect(requireSubject(resolveSubject("demo:etf-us-broad-market")).href).toBe(
      "/discover/etf-us-broad-market"
    );
  });

  it("derives every href from the scope and id, without collisions", () => {
    const expectedPrefix: Record<SubjectScope, string> = {
      research: "/research/",
      "research-jp": "/research/jp/",
      demo: "/discover/",
    };

    const hrefs = listSubjects().map((subject) => {
      expect(subject.href).toBe(
        `${expectedPrefix[subject.scope]}${subject.id}`
      );
      return subject.href;
    });

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("resolveSubject", () => {
  it("resolves a US research company with every field populated", () => {
    expect(resolveSubject("research:msft")).toEqual({
      ref: "research:msft",
      scope: "research",
      id: "msft",
      label: "Microsoft Corporation (MSFT)",
      symbol: "MSFT",
      currency: "USD",
      href: "/research/msft",
      groupLabel: "US research companies",
    });
  });

  it("resolves a Japanese research company with the ticker as the symbol", () => {
    expect(resolveSubject("research-jp:toyota")).toEqual({
      ref: "research-jp:toyota",
      scope: "research-jp",
      id: "toyota",
      label: "Toyota Motor Corporation (7203)",
      symbol: "7203",
      currency: "JPY",
      href: "/research/jp/toyota",
      groupLabel: "Japanese research companies",
    });
  });

  it("resolves a demo instrument", () => {
    expect(resolveSubject("demo:stock-jp-kaede-pharma")).toEqual({
      ref: "demo:stock-jp-kaede-pharma",
      scope: "demo",
      id: "stock-jp-kaede-pharma",
      label: "Kaede Pharma (4501.DEMO)",
      symbol: "4501.DEMO",
      currency: "JPY",
      href: "/discover/stock-jp-kaede-pharma",
      groupLabel: "Demo instruments",
    });
  });

  it("resolves every listed subject by its own ref", () => {
    for (const subject of listSubjects()) {
      expect(resolveSubject(subject.ref)).toEqual(subject);
    }
  });

  it("returns the same object the list holds", () => {
    const listed = at(subjectsOfScope("research"), 0);

    expect(resolveSubject(listed.ref)).toBe(listed);
  });

  it.each([
    "research:mfst",
    "research:MSFT",
    "research:",
    "research: msft",
    "research:msft ",
  ])("returns null for the unknown US research ref %o", (ref) => {
    expect(resolveSubject(ref)).toBeNull();
  });

  it.each([
    "research-jp:toyoda",
    "research-jp:7203",
    "research-jp:",
    "research-jp:TOYOTA",
  ])("returns null for the unknown Japanese research ref %o", (ref) => {
    expect(resolveSubject(ref)).toBeNull();
  });

  it.each([
    "demo:stock-us-nowhere",
    "demo:",
    "demo:NST.DEMO",
    "demo:stock-us-northstar-software-2",
  ])("returns null for the unknown demo ref %o", (ref) => {
    expect(resolveSubject(ref)).toBeNull();
  });

  it.each([
    "portfolio:1",
    "watchlist:msft",
    "RESEARCH:msft",
    "research-us:msft",
    ":msft",
    "jp:toyota",
  ])("returns null for the unknown scope %o", (ref) => {
    expect(resolveSubject(ref)).toBeNull();
  });

  it.each(["research", "msft", "demo", "research-jp", "not a ref"])(
    "returns null when the ref has no colon: %o",
    (ref) => {
      expect(resolveSubject(ref)).toBeNull();
    }
  );

  it("returns null for an empty string", () => {
    expect(resolveSubject("")).toBeNull();
  });

  it("does not cross scopes when the id exists under a different scope", () => {
    expect(resolveSubject("demo:msft")).toBeNull();
    expect(resolveSubject("research:toyota")).toBeNull();
    expect(resolveSubject("research-jp:msft")).toBeNull();
    expect(resolveSubject("research:stock-us-northstar-software")).toBeNull();
  });

  it("keeps everything after the first colon as the id", () => {
    // Refs are split on the FIRST colon, so a stray colon is part of the id
    // and simply fails to resolve rather than silently matching a prefix.
    expect(resolveSubject("research:msft:extra")).toBeNull();
  });
});

describe("subjectHref", () => {
  it("returns the route for a known ref in each scope", () => {
    expect(subjectHref("research:aapl")).toBe("/research/aapl");
    expect(subjectHref("research-jp:nintendo")).toBe("/research/jp/nintendo");
    expect(subjectHref("demo:etf-jp-broad-market")).toBe(
      "/discover/etf-jp-broad-market"
    );
  });

  it("agrees with resolveSubject for every listed subject", () => {
    for (const subject of listSubjects()) {
      expect(subjectHref(subject.ref)).toBe(subject.href);
    }
  });

  it.each(["research:mfst", "demo:nope", "portfolio:1", "research", ""])(
    "returns null for the unknown ref %o",
    (ref) => {
      expect(subjectHref(ref)).toBeNull();
    }
  );
});
