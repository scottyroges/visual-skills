import { describe, it, expect } from "vitest";
import { assembleSpec } from "../src/assemble-spec.js";
import { assertUniqueSpecIds, type SpecBlock } from "../src/spec-blocks.js";

// A small but complete spec (4 chapters → not "large", so no diagram is required and the unit
// test stays free of the d2 binary). Exercises every authored surface that carries meaning.
const blocks: SpecBlock[] = [
  {
    type: "tldr", id: "tldr", heading: "Make GM skill show up as plan-perception quality",
    rows: [{ key: "What", value: "A layered `StrategicPlan`" }, { key: "Why", value: "GMs are reactive" }],
    bigIdea: { line: "Detailed but mis-perceived.", sub: "Bad GMs **mis-perceive**." },
  },
  {
    type: "components", id: "boards", title: "The 6 components", badge: "window + 5 boards",
    anatomy: {
      left: { title: "Factual core", desc: "Same for all", eg: "ceiling" },
      mid: { fn: "perceive(t, s)" },
      right: { title: "Perceived layer", desc: "Where skill lives", eg: "perceivedCliffYears" },
      caption: "two GMs, two plans",
    },
    cards: [{
      name: "CapBoard", purpose: "5-year cap outlook",
      skills: [{ name: "capManagement" }, { name: "scoutingNetwork", deputy: true }],
      split: { fact: "CBA", perc: "judgment" },
      fields: { fact: ["ceiling"], perc: ["perceivedCliffYears"] },
    }],
  },
  {
    type: "decisions", id: "decisions", title: "Key decisions",
    decisions: [
      { q: "Plan model", a: "Detailed but mis-perceived", why: "makes skill structural", rejected: "skill scales detail" },
      { q: "Cadence", a: "Fresh each rebuild", why: "real GMs update fast" },
    ],
  },
  { type: "scope", id: "scope", inList: ["the plan"], outList: [{ text: "coach planning", defer: "Phase 2p" }] },
  {
    type: "approve", id: "approve", title: "Before you approve",
    commit: { body: "Staged rollout." },
    scrutinize: { body: "The integration. [See the map](#ref-sites)" },
    open: { note: "Non-blocking:", questions: ["slot granularity?"] },
  },
  {
    type: "reference", id: "reference",
    items: [{ id: "ref-sites", summary: "Decision-site map", tally: "regression-prone", html: "<p>raw body</p>" }],
  },
];

const opts = {
  title: "Spec · GM Brain", phase: "Phase 2m", status: "Ready for plan", date: "2026-05-31",
  complexity: "Large", related: [{ kind: "Seed", value: "memory" }], meta: [{ key: "Status", value: "ready" }],
};

describe("assembleSpec", () => {
  it("renders a self-contained page with the shell, chips, nav, and rail", async () => {
    const html = await assembleSpec(blocks, opts);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trim().endsWith("</html>")).toBe(true);
    // both stylesheets inlined
    expect(html).toContain("--accent");          // review.css token
    expect(html).toContain(".board-card");        // spec.css component
    // topbar chips
    expect(html).toContain("chip-phase");
    expect(html).toContain("Phase 2m");
    expect(html).toContain("chip-complexity");
    // sidebar outline + related + meta
    expect(html).toContain('data-target="decisions"');
    expect(html).toContain("Seed");
    // progress rail spans the 4 chapters (components, decisions, scope, approve), tldr/reference excluded
    expect((html.match(/class="progress-step[ "]/g) || []).length).toBe(4);
    expect(html).toContain('href="#boards"');
    expect(html).toContain('data-target="tldr"');                 // tldr IS in the sidebar outline…
    expect(html).not.toMatch(/class="progress-step[^"]*" href="#tldr"/); // …but NOT a rail step
  });

  it("renders the decision rationale + rejected alternative", async () => {
    const html = await assembleSpec(blocks, opts);
    expect(html).toContain('class="decision-why"');
    expect(html).toContain('class="decision-alt"');
    expect(html).toContain("makes skill structural");
    expect(html).toContain("Rejected");
  });

  it("renders the big idea, anatomy duality, and component card fields", async () => {
    const html = await assembleSpec(blocks, opts);
    expect(html).toContain('class="bigidea-line"');
    expect(html).toContain("anatomy-factual");
    expect(html).toContain("anatomy-perceived");
    expect(html).toContain("skill-chip");
    expect(html).toContain("is-deputy");           // scoutingNetwork deputy chip
    expect(html).toContain("split-badge");
  });

  it("wires the approval cross-link to a reference drawer that exists", async () => {
    const html = await assembleSpec(blocks, opts);
    expect(html).toContain('href="#ref-sites"');    // from the scrutinize markdown link
    expect(html).toContain('<details class="ref" id="ref-sites">');
    expect(html).toContain("raw body");             // the item's html body, verbatim
  });

  it("gives each block its own anchored section", async () => {
    const html = await assembleSpec(blocks, opts);
    for (const id of ["tldr", "boards", "decisions", "scope", "approve", "reference"]) {
      expect(html, `section #${id}`).toContain(`id="${id}" class="section"`);
    }
  });

  it("does not crash on a malformed `related`/`meta` shape — warns and skips instead", async () => {
    // Regression: the dogfood passed link-shaped related ({label, href}); the wrong shape used to
    // crash escapeHtml(undefined). It must now degrade to a warning, never throw.
    const warns: string[] = [];
    const bad = {
      ...opts,
      related: [{ label: "cap-spend", href: "./x.md" }] as unknown as { kind: string; value: string }[],
      meta: [{ k: "Status", v: "ready" }] as unknown as { key: string; value: string }[],
      onWarn: (m: string) => warns.push(m),
    };
    let html = "";
    await expect((async () => { html = await assembleSpec(blocks, bad); })()).resolves.toBeUndefined();
    expect(html).toContain("</html>");
    expect(warns.some((w) => /related\[0\] should be \{ kind, value \}/.test(w))).toBe(true);
    expect(warns.some((w) => /meta\[0\] should be \{ key, value \}/.test(w))).toBe(true);
  });

  it("rejects duplicate ids (block or reference item)", () => {
    expect(() => assertUniqueSpecIds([
      { type: "scope", id: "dup", inList: [], outList: [] },
      { type: "risks", id: "dup", title: "R", risks: [] },
    ])).toThrow(/duplicate/);
  });
});
