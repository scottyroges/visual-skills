import { describe, it, expect } from "vitest";
import { renderTldr } from "../src/review/tldr.js";
import type { OverviewBlock } from "../src/blocks.js";

const ov: OverviewBlock = {
  type: "overview", id: "overview", headline: "Add a weekly standings query",
  facets: { what: "A protected query.", why: "Foundation for past weeks.", size: "8 files, ~154 runtime lines." },
  risk: { level: "low", note: "Additive, no schema changes." },
  startHref: "#s-repo",
  points: [{ text: "new `weeklyStandings` on the [router](#s-router)" }],
};

describe("renderTldr", () => {
  it("renders the TL;DR card with facets, a level-coded risk chip, and a start link (NO points)", async () => {
    const html = await renderTldr(ov);
    expect(html).toContain('class="tldr-card"');
    expect(html).toContain("Add a weekly standings query");
    expect(html).toContain("A protected query.");
    expect(html).toMatch(/chip-risk risk-low/);
    expect(html).toContain('href="#s-repo"');
    expect(html).not.toContain("tldr-points");
  });
  it("omits facets/risk/start gracefully when absent", async () => {
    const html = await renderTldr({ type: "overview", id: "o", headline: "H", points: [] });
    expect(html).toContain("H");
    expect(html).not.toContain("chip-risk");
    expect(html).not.toContain("tldr-start");
  });
});

describe("renderOverviewPoints", () => {
  it("renders the key-fact points (keyword links) as the Overview section", async () => {
    const { renderOverviewPoints } = await import("../src/review/tldr.js");
    const html = await renderOverviewPoints(ov);
    expect(html).toContain('class="overview-list"');
    expect(html).toContain('href="#s-router"');
  });
});
