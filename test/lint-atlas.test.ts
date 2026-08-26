import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lintAtlas, lintDomain, lintReadability, lintTopic } from "../src/lint-atlas.js";
import type { AtlasBlock } from "../src/atlas-blocks.js";

const load = (f: string): AtlasBlock[] =>
  JSON.parse(readFileSync(join(__dirname, "..", "example", "atlas-ppgl", f), "utf8")).blocks;

describe("lintAtlas", () => {
  it("is clean on the canonical atlas page", () => {
    expect(lintAtlas(load("atlas.json"))).toEqual([]);
  });

  it("warns on a bare atlas: missing tldr, map, index", () => {
    const warns = lintAtlas([
      { type: "diagram-section", id: "x", title: "X",
        diagram: { id: "xd", kind: "flowchart", d2: "a -> b" } },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /start here|atlas-tldr|tl;dr/i.test(w))).toBe(true);
    expect(warns.some((w) => /domain map/i.test(w))).toBe(true);
    expect(warns.some((w) => /domain.index|tile/i.test(w))).toBe(true);
  });

  it("warns when a domain tile has no purpose", () => {
    const warns = lintAtlas([
      { type: "atlas-tldr", id: "tldr", heading: "Demo", rows: [] },
      { type: "domain-map", id: "map", svg: "<svg></svg>" },
      { type: "domain-index", id: "domains", title: "Domains", tiles: [
        { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "", href: "domain-sim.html" },
      ] },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /purpose/i.test(w))).toBe(true);
  });
});

describe("lintDomain", () => {
  it("is clean on the canonical domain page", () => {
    expect(lintDomain(load("domain-game/domain-game.json"))).toEqual([]);
  });

  it("warns on a bare domain: missing tldr, components, seams", () => {
    const warns = lintDomain([
      { type: "diagram-section", id: "arch", title: "Arch",
        diagram: { id: "ad", kind: "architecture", d2: "a -> b" } },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /domain-tldr|tl;dr/i.test(w))).toBe(true);
    expect(warns.some((w) => /component/i.test(w))).toBe(true);
    expect(warns.some((w) => /seam/i.test(w))).toBe(true);
  });

  it("warns when a large domain (many components) has no internal-arch diagram", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `c-${i}`, name: `c${i}`, path: `lib/x/c${i}`, detail: [""],
    }));
    const warns = lintDomain([
      { type: "domain-tldr", id: "tldr", heading: "X", rows: [] },
      { type: "components", id: "components", title: "Components", cards: [] },
      { type: "depth", id: "depth", title: "In depth", components: many },
      { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
    ] as AtlasBlock[]);
    expect(warns.some((w) => /internal arch|diagram/i.test(w))).toBe(true);
  });
});

describe("readability and current-truth lint", () => {
  it("warns when standing documentation contains project-history prose", () => {
    const warnings = lintReadability([{
      type: "topic-tldr", id: "tldr", heading: "Context building",
      summary: "PR #42 replaced the old task implementation after review round 3.",
      inputs: [], outputs: [],
    }], "topic");

    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/project history/i)]));
  });

  it("warns on a paragraph over roughly 100 words", () => {
    const paragraph = Array.from({ length: 101 }, () => "word").join(" ");
    const warnings = lintReadability([{
      type: "topic-tldr", id: "tldr", heading: "Context", summary: paragraph,
      inputs: [], outputs: [],
    }], "topic");

    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/paragraph.*100 words/i)]));
  });

  it("warns on oversized card copy and page-level visible prose", () => {
    const cardPurpose = Array.from({ length: 41 }, () => "purpose").join(" ");
    const domainProse = Array.from({ length: 1201 }, () => "domain").join(" ");
    const topicProse = Array.from({ length: 2001 }, () => "topic").join(" ");

    expect(lintReadability([{
      type: "domain-index", id: "domains", title: "Domains", tiles: [{
        name: "conversation", path: "src", layer: "engine", layerLabel: "Engine", purpose: cardPurpose,
      }],
    }], "atlas")).toEqual(expect.arrayContaining([expect.stringMatching(/card.*40 words/i)]));
    expect(lintReadability([{
      type: "domain-tldr", id: "tldr", heading: "Conversation", rows: [{ key: "Purpose", value: domainProse }],
    }], "domain")).toEqual(expect.arrayContaining([expect.stringMatching(/domain page.*1,200/i)]));
    expect(lintReadability([{
      type: "topic-tldr", id: "tldr", heading: "Context", summary: topicProse, inputs: [], outputs: [],
    }], "topic")).toEqual(expect.arrayContaining([expect.stringMatching(/topic page.*2,000/i)]));
  });

  it("warns when one topic contains multiple independent flow mechanisms", () => {
    const warnings = lintTopic([
      { type: "topic-tldr", id: "tldr", heading: "Context", summary: "Builds input", inputs: [], outputs: [] },
      { type: "topic-flow", id: "flow-a", title: "Assembly", steps: [] },
      { type: "topic-flow", id: "flow-b", title: "Compaction", steps: [] },
      { type: "topic-rules", id: "rules", title: "Rules", guarantees: [], failures: [] },
    ], "mechanism");

    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/independent mechanisms/i)]));
  });
});

describe("orientation-first domain and structured topic floors", () => {
  it("accepts an orientation domain with children and no expanded component inventory", () => {
    const warnings = lintDomain([
      { type: "domain-tldr", id: "tldr", heading: "Conversation", rows: [] },
      { type: "diagram-section", id: "arch", title: "Architecture", diagram: { id: "d", kind: "architecture", d2: "a -> b" } },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [] },
      { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
    ], { hasChildren: true });

    expect(warnings.filter((warning) => /component/i.test(warning))).toEqual([]);
  });

  it("requires the structured topic lead, flow, and rules", () => {
    const warnings = lintTopic([
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [] },
    ], "algorithm");

    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/topic-tldr/i),
      expect.stringMatching(/topic-flow/i),
      expect.stringMatching(/topic-rules/i),
    ]));
  });

  it("warns when required topic blocks still contain untouched draft fields", () => {
    const warnings = lintTopic([
      { type: "topic-tldr", id: "tldr", heading: "Context", summary: "", inputs: [], outputs: [] },
      { type: "topic-flow", id: "flow", title: "How it works", steps: [] },
      { type: "topic-rules", id: "rules", title: "Rules", guarantees: [], failures: [] },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [
        { label: "Assembly", files: [{ name: "src/context.ts", desc: "" }] },
      ] },
    ], "mechanism");

    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/summary/i),
      expect.stringMatching(/input/i),
      expect.stringMatching(/output/i),
      expect.stringMatching(/two non-empty steps/i),
      expect.stringMatching(/guarantee/i),
      expect.stringMatching(/failure.*introduction/i),
      expect.stringMatching(/implementation.*description/i),
    ]));
  });

  it("warns when a multi-stage mechanism has no grounded visual or trace", () => {
    const warnings = lintTopic([
      { type: "topic-tldr", id: "tldr", heading: "Context", summary: "Builds input", inputs: ["messages"], outputs: ["context"] },
      { type: "topic-flow", id: "flow", title: "Assembly", steps: [
        { title: "Load", body: "Read stored messages." },
        { title: "Budget", body: "Calculate the available window." },
        { title: "Order", body: "Place durable memory before the newest turn." },
        { title: "Return", body: "Return the bounded model input." },
      ] },
      { type: "topic-rules", id: "rules", title: "Rules", guarantees: ["Order is stable"], failures: [
        { condition: "Storage fails", behavior: "Stop before model invocation." },
      ] },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [
        { label: "Assembly", files: [{ name: "src/context.ts", desc: "Builds the context window." }] },
      ] },
    ], "mechanism");

    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/multi-stage.*diagram.*worked example/i),
    ]));
  });

  it("warns when any flow step is only partially authored", () => {
    const warnings = lintTopic([
      { type: "topic-tldr", id: "tldr", heading: "Context", summary: "Builds input", inputs: ["messages"], outputs: ["context"] },
      { type: "topic-flow", id: "flow", title: "Assembly", steps: [
        { title: "Load", body: "Read stored messages." },
        { title: "Order", body: "Place durable memory before the newest turn." },
        { title: "", body: "This body has no meaningful step title." },
      ] },
      { type: "topic-rules", id: "rules", title: "Rules", guarantees: ["Order is stable"], failures: [
        { condition: "Storage fails", behavior: "Stop before model invocation." },
      ] },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [
        { label: "Assembly", files: [{ name: "src/context.ts", desc: "Builds the context window." }] },
      ] },
    ], "mechanism");

    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/flow step.*blank title or body/i),
    ]));
  });

  it("warns when an algorithm has no worked example", () => {
    const warnings = lintTopic([
      { type: "topic-tldr", id: "tldr", heading: "Compaction", summary: "Fits older input", inputs: ["messages"], outputs: ["bounded context"] },
      { type: "topic-flow", id: "flow", title: "Compaction", steps: [
        { title: "Measure", body: "Estimate the total token use." },
        { title: "Choose", body: "Select summarization or incremental assembly." },
      ] },
      { type: "topic-rules", id: "rules", title: "Rules", guarantees: ["Recent input remains ordered"], failures: [
        { condition: "Summarization fails", behavior: "Use bounded truncation." },
      ] },
      { type: "implementation-reference", id: "reference", title: "Implementation", groups: [
        { label: "Policy", files: [{ name: "src/compact.ts", desc: "Selects a bounded assembly path." }] },
      ] },
    ], "algorithm");

    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/algorithm.*worked example/i)]));
  });

  it("warns when a topic is still only a very short outline", () => {
    const warnings = lintReadability([{
      type: "topic-tldr", id: "tldr", heading: "Context", summary: "Builds input", inputs: ["messages"], outputs: ["context"],
    }], "topic");

    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/fewer than.*180/i)]));
  });
});
