import { describe, it, expect } from "vitest";
import { assembleAtlas, assembleDomain, assembleTopic, renderAtlasDiagram, atlasLegend, renderAtlasBlock } from "../src/assemble-atlas.js";
import { type AtlasBlock } from "../src/atlas-blocks.js";
import { renderAll } from "../src/render-diagram.js";

const domainBlocks: AtlasBlock[] = [
  { type: "domain-tldr", id: "tldr", heading: "h", rows: [] },
  { type: "components", id: "components", title: "The pieces", cards: [] },
  { type: "diagram-section", id: "arch", title: "Architecture", diagram: { id: "d1", kind: "architecture", d2: "a -> b" } },
  { type: "depth", id: "depth", title: "In depth", components: [
    { id: "c-gm", name: "gm", path: "lib/brain/gm", detail: ["x"] },
    { id: "c-coach", name: "coach", path: "lib/brain/coach", detail: ["x"] },
  ] },
  { type: "owns", id: "data", title: "Data it owns", rows: [] },
  { type: "seams", id: "seams", title: "Seams", exposes: [], depends: [] },
];

describe("assemble shell", () => {
  it("atlas: self-contained doc, three stylesheets, topbar chips, zoom overlay", async () => {
    const html = await assembleAtlas([], { title: "System Atlas · demo", stack: "Next.js", count: "7 domains", date: "2026-06-20", note: "in-memory state" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trim().endsWith("</html>")).toBe(true);
    expect(html).toContain("--accent");        // review.css
    expect(html).toContain(".board-card");     // spec.css
    expect(html).toContain(".domain-tile");    // atlas.css
    expect(html).toContain('class="chip chip-stack">Next.js');
    expect(html).toContain('class="chip chip-count">7 domains');
    expect(html).toContain('id="zoom-overlay"');
    expect(html).toContain("System Atlas · demo");
  });
  it("emits the dark-mode toggle and theme.css", async () => {
    const html = await assembleAtlas([], { title: "System Atlas · demo" });
    expect(html).toContain('data-theme');
    expect(html).toContain('class="vs-theme-toggle"');
    expect(html).toContain('/* vs-theme */');
  });

  it("orders the inlined CSS/JS correctly: theme.css after base CSS, head-apply script before <body>", async () => {
    const html = await assembleAtlas([], { title: "System Atlas · demo" });
    const baseCssIdx = html.indexOf(".topbar {");     // review.css rule, precedes spec.css/atlas.css/theme.css
    const specCssIdx = html.indexOf(".bigidea {");    // spec.css rule
    const atlasCssIdx = html.indexOf(".domain-grid {"); // atlas.css rule, precedes theme.css
    const themeMarkerIdx = html.indexOf("/* vs-theme */");
    const headScriptIdx = html.indexOf("data-theme"); // first occurrence: the head-apply <script>, before <body>
    const bodyIdx = html.indexOf("<body");
    expect(baseCssIdx).toBeGreaterThan(-1);
    expect(specCssIdx).toBeGreaterThan(-1);
    expect(atlasCssIdx).toBeGreaterThan(-1);
    expect(themeMarkerIdx).toBeGreaterThan(-1);
    expect(headScriptIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(baseCssIdx).toBeLessThan(specCssIdx);
    expect(specCssIdx).toBeLessThan(atlasCssIdx);
    expect(atlasCssIdx).toBeLessThan(themeMarkerIdx);
    expect(headScriptIdx).toBeLessThan(bodyIdx);
  });
  it("domain: back-link + layer/path/count/depends chips", async () => {
    const html = await assembleDomain([], { title: "brain", layer: "intelligence", layerLabel: "Intelligence", path: "lib/brain", count: "~76 files", depends: "sim · world" });
    expect(html).toContain('class="topbar-back" href="../atlas.html"');
    expect(html).toContain('class="chip layer-chip layer-intelligence">Intelligence');
    expect(html).toContain('class="chip chip-stat">lib/brain');
    expect(html).toContain('class="chip chip-count">~76 files');
    expect(html).toContain("depends on sim · world");
  });

  it("constrains long topic topbars instead of widening narrow viewports", async () => {
    const html = await assembleTopic(
      [{ type: "topic-tldr", id: "tldr", heading: "Compaction", summary: "s", inputs: [], outputs: [] }],
      {
        title: "Compaction and summarization",
        purpose: "How older messages stay inside the model budget.",
        shape: "algorithm",
        backHref: "../context-building.html",
        backLabel: "Context building",
        date: "2026-08-26",
      },
    );
    expect(html).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.topbar-meta\s*\{\s*display:\s*none/);
    expect(html).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.topbar-title\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/);
  });
});

describe("sidebar + rail", () => {
  it("nests depth components under the in-depth chapter; numbers chapters; tldr is the lead", async () => {
    const html = await assembleDomain(domainBlocks, { title: "brain", layer: "intelligence", layerLabel: "Intelligence", meta: [{ key: "Layer", value: "Intelligence" }] });
    expect(html).toContain('data-target="tldr"');
    expect(html).toContain('class="outline-num" aria-hidden="true">1</span><span>The pieces');
    expect(html).toContain('class="outline-sub"');
    expect(html).toContain('href="#c-gm" class="outline-subitem"');
    expect(html).toContain('href="#c-coach" class="outline-subitem"');
    expect((html.match(/class="progress-step[ "]/g) || []).length).toBe(5);
    expect(html).toMatch(/sidebar-label">Meta/);
    expect(html).not.toMatch(/class="progress-step[^"]*" href="#tldr"/);
  });
  it("atlas builds a Domains block from the index tiles (linked vs pending dot)", async () => {
    const atlasBlocks: AtlasBlock[] = [
      { type: "domain-index", id: "domains", title: "The 7 domains", tiles: [
        { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "p", href: "domain-sim.html" },
        { name: "world", path: "lib/world", layer: "foundation", layerLabel: "Foundation", purpose: "p" },
      ] },
    ];
    const html = await assembleAtlas(atlasBlocks, { title: "Atlas" });
    expect(html).toContain('sidebar-label">Domains');
    expect(html).toContain('href="domain-sim.html" class="nav-domain"');
    expect(html).toContain('nd-pending">overview');
  });
});

describe("diagram card + legend", () => {
  it("legend renders swatches with fill+stroke", () => {
    const h = atlasLegend([{ label: "Engine", fill: "#d0ebff", stroke: "#4dabf7" }]);
    expect(h).toContain("legend-swatch");
    expect(h).toContain("background:#d0ebff");
    expect(h).toContain("Engine");
  });
  it("diagram card wraps a diagram-svg in a zoomable box with a caption", async () => {
    const diag = { id: "d1", kind: "architecture" as const, d2: "a -> b", caption: "the *flow*", legend: [{ label: "x", fill: "#fff", stroke: "#000" }] };
    const map = new Map((await renderAll([{ type: "diagram", id: "d1", title: "", kind: "architecture", d2: "a -> b" }])).map((r) => [r.id, r]));
    const h = await renderAtlasDiagram(diag, map);
    expect(h).toContain('class="diagram-box"');
    expect(h).toContain('diagram-svg');
    expect(h).toContain('class="diagram-caption"');
    expect(h).not.toContain('class="diagram-title"');
  });
});

describe("atlas-page block renderers", () => {
  const empty = new Map();
  it("atlas-tldr renders the card + primer rows", async () => {
    const h = await renderAtlasBlock({ type: "atlas-tldr", id: "tldr", heading: "A `sim`", rows: [{ key: "What", value: "x" }], primer: [{ h: "No god-mode", p: "noisy **perception**" }] }, empty);
    expect(h).toContain('class="tldr-eyebrow">Start here');
    expect(h).toContain('class="tldr-key">What');
    expect(h).toContain('class="primer"');
    expect(h).toContain('class="primer-n">1');
    expect(h).toContain("No god-mode");
  });
  it("domain-map inlines the raw svg + legend + caption in a zoom box", async () => {
    const h = await renderAtlasBlock({ type: "domain-map", id: "map", title: "The domain map", badge: "layered", svg: '<svg class="diagram-svg map-svg flow-svg" viewBox="0 0 10 10"></svg>', legend: [{ label: "Engine", fill: "#d0ebff", stroke: "#4dabf7" }], caption: "x" }, empty);
    expect(h).toContain('id="map" class="section"');
    expect(h).toContain("map-svg");
    expect(h).toContain('class="diagram-box"');
    expect(h).toContain("legend-swatch");
  });
  it("domain-index renders linked + pending tiles with layer chips and deps", async () => {
    const h = await renderAtlasBlock({ type: "domain-index", id: "domains", title: "The 7 domains", tiles: [
      { name: "sim", path: "lib/sim", layer: "engine", layerLabel: "Engine", purpose: "engine", meta: [{ key: "~77", value: "files" }], deps: ["world"], href: "domain-sim.html" },
      { name: "world", path: "lib/world", layer: "foundation", layerLabel: "Foundation", purpose: "data" },
    ] }, empty);
    expect(h).toContain('a class="domain-tile is-linked" href="domain-sim.html"');
    expect(h).toContain('class="layer-chip layer-engine">Engine');
    expect(h).toContain('class="dep-chip">world');
    expect(h).toContain('class="domain-tile is-pending"');
    expect(h).toContain("Page pending");
  });
});

describe("domain-page renderers (lead + cards + arch)", () => {
  const empty = new Map();
  it("domain-tldr renders card + bigidea with the Domain eyebrow", async () => {
    const h = await renderAtlasBlock({ type: "domain-tldr", id: "tldr", heading: "h", rows: [{ key: "Owns", value: "x" }], bigIdea: { line: "the idea", sub: "s" } }, empty);
    expect(h).toContain('class="tldr-eyebrow">Domain');
    expect(h).toContain('class="bigidea-line"');
  });
  it("components renders cards as anchor links with a card-jump", async () => {
    const h = await renderAtlasBlock({ type: "components", id: "components", title: "The 6 brains", cards: [
      { name: "gm", purpose: "p", exports: [{ name: "computeGMAssessment" }, { name: "x", deputy: true }], href: "#c-gm" },
    ] }, empty);
    expect(h).toContain('a class="board-card" href="#c-gm"');
    expect(h).toContain('class="skill-chip">computeGMAssessment');
    expect(h).toContain('class="skill-chip is-deputy">x');
    expect(h).toContain('class="card-jump"');
  });
  it("diagram-section renders intro + diagram + optional callout", async () => {
    const map = new Map((await renderAll([{ type: "diagram", id: "d1", title: "", kind: "architecture", d2: "a -> b" }])).map((r) => [r.id, r]));
    const h = await renderAtlasBlock({ type: "diagram-section", id: "arch", title: "Internal architecture", intro: "i", diagram: { id: "d1", kind: "architecture", d2: "a -> b" }, callout: "note" }, map);
    expect(h).toContain('id="arch" class="section"');
    expect(h).toContain('class="diagram-box"');
    expect(h).toContain('class="callout"');
  });
});

describe("depth + owns + seams", () => {
  it("depth renders a full subsection per component", async () => {
    const map = new Map((await renderAll([{ type: "diagram", id: "gm-plan", title: "", kind: "architecture", d2: "a -> b" }])).map((r) => [r.id, r]));
    const h = await renderAtlasBlock({ type: "depth", id: "depth", title: "In depth", components: [
      { id: "c-gm", name: "gm", path: "lib/brain/gm", detail: ["First para.", "Second `code` para."],
        diagrams: [{ id: "gm-plan", kind: "architecture", d2: "a -> b", legend: [{ label: "x", fill: "#fff", stroke: "#000" }] }],
        codeHtml: '<div class="code-block"><pre>x</pre></div>',
        files: [{ name: "gm/plan/types.ts", desc: "the plan" }],
        exports: [{ name: "computeGMAssessment()", desc: "the read" }],
        connections: [{ dir: "produces", body: "a `StrategicPlan`" }] },
    ] }, map);
    expect(h).toContain('class="subsection" id="c-gm"');
    expect(h).toContain('class="subsection-title">gm <span class="subsection-path">lib/brain/gm');
    expect(h).toContain('subsection-back');
    expect(h).toContain('class="detail-p"');
    expect(h).toContain('class="code-block"');
    expect(h.match(/class="conns-label"/g)?.length).toBe(3);
    expect(h).toContain('class="owns-name">gm/plan/types.ts');
    expect(h).toContain('class="conn-dir">produces');
  });
  it("owns renders a name/desc list + note", async () => {
    const h = await renderAtlasBlock({ type: "owns", id: "data", title: "Data it owns", rows: [{ name: "BrainState", desc: "cross-season" }], note: "reads x" }, new Map());
    expect(h).toContain('class="owns-name">BrainState');
    expect(h).toContain('class="diagram-caption">');
  });
  it("seams renders exposes list + neighbor chips (linked vs flat)", async () => {
    const h = await renderAtlasBlock({ type: "seams", id: "seams", title: "Seams",
      exposes: [{ api: "runDayTriggers()", note: "daily" }],
      depends: [{ name: "sim", path: "lib/sim", href: "domain-sim.html" }, { name: "world", path: "lib/world" }] }, new Map());
    expect(h).toContain('class="seam-api"');
    expect(h).toContain('a class="neighbor-chip" href="domain-sim.html"');
    expect(h).toContain('class="neighbor-chip is-flat"');
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lintAtlas } from "../src/lint-atlas.js";
const fix = (p: string) => JSON.parse(readFileSync(new URL("../example/atlas-ppgl/" + p, import.meta.url), "utf8"));

describe("canonical regeneration (acceptance)", () => {
  it("atlas.json renders the spine, the domain map, and 8 tiles", async () => {
    const doc = fix("atlas.json");
    const html = await assembleAtlas(doc.blocks, { ...doc, title: doc.title });
    expect(html).toContain('id="spine" class="section"');
    expect(html).toContain('id="map"');
    expect(html).toContain('class="progress-step-label">The weekly loop');
    expect((html.match(/class="domain-tile /g) || []).length).toBe(8);
  });
  it("domain-game.json renders 5 deep sections each with files + exports + connections", async () => {
    const doc = fix("domain-game/domain-game.json");
    const html = await assembleDomain(doc.blocks, { ...doc, title: doc.title });
    for (const id of ["c-pick-service","c-pick-lock","c-bot-picks","c-dashboard","c-planner-ui"]) expect(html).toContain(`id="${id}"`);
    expect((html.match(/conns-label">Key files/g) || []).length).toBe(5);
    expect((html.match(/conns-label">Connections/g) || []).length).toBe(5);
  });
  it("domain-golf-data.json renders 7 deep sections", async () => {
    const doc = fix("domain-golf-data/domain-golf-data.json");
    const html = await assembleDomain(doc.blocks, { ...doc, title: doc.title });
    for (const id of ["c-espn","c-payout","c-sync","c-cron","c-tournaments","c-golfers","c-display"]) expect(html).toContain(`id="${id}"`);
    expect((html.match(/conns-label">Connections/g) || []).length).toBe(7);
  });
});

describe("full page assembly", () => {
  it("atlas places the rail after the tldr and renders all blocks", async () => {
    const blocks: AtlasBlock[] = [
      { type: "atlas-tldr", id: "tldr", heading: "h", rows: [], primer: [] },
      { type: "domain-index", id: "domains", title: "The 7 domains", tiles: [] },
    ];
    const html = await assembleAtlas(blocks, { title: "Atlas" });
    expect(html).toContain('id="tldr" class="section"');
    expect(html).toContain('id="domains" class="section"');
    const railAt = html.indexOf('class="progress-rail"'); const tldrAt = html.indexOf('id="tldr"'); const domAt = html.indexOf('id="domains"');
    expect(tldrAt).toBeLessThan(railAt); expect(railAt).toBeLessThan(domAt);
  });
  it("domain renders a depth diagram via the pipeline", async () => {
    const blocks: AtlasBlock[] = [
      { type: "domain-tldr", id: "tldr", heading: "h", rows: [] },
      { type: "depth", id: "depth", title: "In depth", components: [
        { id: "c-x", name: "x", path: "lib/x", detail: ["p"], diagrams: [{ id: "dx", kind: "architecture", d2: "a -> b" }] },
      ] },
    ];
    const html = await assembleDomain(blocks, { title: "x", layer: "engine", layerLabel: "Engine" });
    expect(html).toContain('id="c-x"');
    expect(html).toContain("diagram-svg");
  });
});

it("surfaces completeness warnings through onWarn for a bare atlas", async () => {
  const warns: string[] = [];
  await assembleAtlas(
    [{ type: "domain-index", id: "domains", title: "Domains", tiles: [] }] as any,
    { title: "Bare", onWarn: (m) => warns.push(m) },
  );
  expect(warns.some((w) => /atlas-tldr|start here/i.test(w))).toBe(true);
  expect(warns.some((w) => /domain map/i.test(w))).toBe(true);
});

it("emits no completeness warnings for the canonical atlas blocks", async () => {
  const blocks = JSON.parse(
    readFileSync(join(__dirname, "..", "example", "atlas-ppgl", "atlas.json"), "utf8"),
  ).blocks;
  const warns: string[] = [];
  await assembleAtlas(blocks, { title: "Canonical", onWarn: (m) => warns.push(m) });
  // Only completeness lint should be silent; diagram-compile warnings (no d2 binary) are separate.
  expect(lintAtlas(blocks)).toEqual([]);
  expect(warns.filter((w) => /no atlas-tldr|no domain map|no domain-index|no purpose/i.test(w))).toEqual([]);
});

it("renders an example block on a domain page", async () => {
  const warns: string[] = [];
  const blocks = [
    { type: "domain-tldr", id: "tldr", heading: "h", rows: [{ key: "Owns", value: "x" }] },
    { type: "example", id: "ex-trace", title: "One request through this stack",
      source: "src/game/engine.ts (traced by hand)", lesson: "the engine never touches the store directly",
      stages: [
        { label: "request", kind: "input", body: "POST /score" },
        { label: "resolution", body: "engine applies handicap" },
        { label: "persisted row", kind: "output", body: "scores table" },
      ] },
  ] as unknown as AtlasBlock[];
  const html = await assembleDomain(blocks, { title: "game", layer: "engine", layerLabel: "Engine", onWarn: (m) => warns.push(m) });
  expect(html).toContain("vs-example");
  expect(html).toContain("One request through this stack");
  expect(warns.filter((w) => w.includes("no renderer"))).toEqual([]);
});

describe("assembleDomain example hardening", () => {
  // Regression: assertUniqueAtlasIds, the sidebar labels and sectionHeader read b.id/b.title raw,
  // ahead of renderExample's normalizer.
  it("renders a title-less, id-less example without throwing", async () => {
    const bad = [{ type: "example", stages: [] }] as unknown as AtlasBlock[];
    const html = await assembleDomain(bad, { title: "d", layer: "engine", layerLabel: "Engine" });
    expect(html).toContain("vs-example");
    expect(html).toContain('id="example"');
  });
});

describe("renderAtlasBlock standalone safety", () => {
  // Exported and called directly (as these tests do). preNormalized defaults to FALSE, so a raw
  // authored block is normalized here — the section id and sectionHeader read id/title raw.
  it("renders a malformed example without throwing and surfaces its problems once", async () => {
    const warns: string[] = [];
    const bad = { type: "example", stages: [null, {}] } as unknown as AtlasBlock;
    const html = await renderAtlasBlock(bad, new Map(), (m) => warns.push(m));
    expect(html).toContain("vs-example");
    expect(html).toContain('id="example"');
    expect(warns.filter((w) => w.includes("no source"))).toHaveLength(1);
    expect(warns.filter((w) => w.includes("no lesson"))).toHaveLength(1);
    expect(warns.filter((w) => w.includes("dropped"))).toHaveLength(1);
  });
});

describe("hierarchical topic pages", () => {
  const blocks: AtlasBlock[] = [
    {
      type: "topic-tldr", id: "tldr", heading: "Context building",
      summary: "Builds model input from stored conversation state.",
      when: "Before each model call", inputs: ["stored messages"], outputs: ["ordered context"],
    },
    {
      type: "topic-flow", id: "flow", title: "How it works",
      steps: [{ title: "Load", body: "Read stored state." }, { title: "Order", body: "Apply stable ordering." }],
    },
    {
      type: "topic-rules", id: "rules", title: "Guarantees and failures",
      guarantees: ["The ordering is stable."],
      failures: [{ condition: "The budget is exceeded", behavior: "Compact older content." }],
    },
    {
      type: "implementation-reference", id: "reference", title: "Implementation reference",
      groups: [{ label: "Assembly", files: [{ name: "lib/context.ts", desc: "Builds the ordered list." }] }],
    },
  ];
  const navigation = {
    current: { id: "conversation/context-building", title: "Context building", purpose: "Builds model input", href: "context-building.html", breadcrumb: "System Atlas · demo / Conversation / Context building" },
    breadcrumbs: [
      { id: "atlas", title: "System Atlas · demo", purpose: "", href: "../../atlas.html", breadcrumb: "System Atlas · demo" },
      { id: "conversation", title: "Conversation", purpose: "Runs a turn", href: "../domain-conversation.html", breadcrumb: "System Atlas · demo / Conversation" },
      { id: "conversation/context-building", title: "Context building", purpose: "Builds model input", href: "context-building.html", breadcrumb: "System Atlas · demo / Conversation / Context building" },
    ],
    branch: [
      { link: { id: "conversation", title: "Conversation", purpose: "Runs a turn", href: "../domain-conversation.html", breadcrumb: "System Atlas · demo / Conversation" }, current: false, expanded: true, children: [
        { link: { id: "conversation/context-building", title: "Context building", purpose: "Builds model input", href: "context-building.html", breadcrumb: "System Atlas · demo / Conversation / Context building" }, current: true, expanded: true, children: [] },
      ] },
      { link: { id: "billing", title: "Billing", purpose: "Collects payment", href: "../../domain-billing/domain-billing.html", breadcrumb: "System Atlas · demo / Billing" }, current: false, expanded: false, children: [] },
    ],
    parent: { id: "conversation", title: "Conversation", purpose: "Runs a turn", href: "../domain-conversation.html", breadcrumb: "System Atlas · demo / Conversation" },
    children: [{ id: "conversation/context-building/compaction", title: "Compaction", purpose: "Reduces older input", href: "compaction/compaction.html", breadcrumb: "System Atlas · demo / Conversation / Context building / Compaction" }],
    siblings: [{ id: "conversation/turn-loop", title: "Turn loop", purpose: "Runs one turn", href: "../turn-loop/turn-loop.html", breadcrumb: "System Atlas · demo / Conversation / Turn loop" }],
    related: [],
    readingPaths: [{ title: "Debug context size", purpose: "Follow the budget path", pages: [{ id: "conversation/context-building", title: "Context building", purpose: "Builds model input", href: "context-building.html", breadcrumb: "System Atlas · demo / Conversation / Context building" }] }],
    searchIndex: [
      { id: "conversation/context-building", title: "Context building", purpose: "Builds model input", href: "context-building.html", breadcrumb: "System Atlas · demo / Conversation / Context building", aliases: ["context builder"], sources: ["lib/context.ts"] },
    ],
  };

  it("renders topic content with direct-entry navigation and collapsed references", async () => {
    const html = await assembleTopic(blocks, {
      title: "Context building", purpose: "Builds model input", shape: "mechanism", navigation,
    });

    expect(html).toContain('class="atlas-breadcrumbs"');
    expect(html).toContain('class="topic-child-card" href="compaction/compaction.html"');
    expect(html).toContain('class="atlas-page-footer"');
    expect(html).toContain('<details class="implementation-reference"');
    expect(html).not.toContain('<details class="implementation-reference" open');
    expect(html).toContain('class="topic-flow-step"');
    expect(html).toContain('id="atlas-search-index"');
    expect(html).toContain('"aliases":["context builder"]');
  });

  it("expands only the current hierarchy branch in the sidebar", async () => {
    const html = await assembleTopic(blocks, {
      title: "Context building", purpose: "Builds model input", shape: "mechanism", navigation,
    });

    expect(html).toContain('class="atlas-tree-item is-expanded"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Billing</a>");
    expect(html).not.toContain("billing/invoices");
  });
});
