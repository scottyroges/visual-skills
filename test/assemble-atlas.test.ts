import { describe, it, expect } from "vitest";
import { assembleAtlas, assembleDomain, renderAtlasDiagram, atlasLegend, renderAtlasBlock } from "../src/assemble-atlas.js";
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
  it("domain: back-link + layer/path/count/depends chips", async () => {
    const html = await assembleDomain([], { title: "brain", layer: "intelligence", layerLabel: "Intelligence", path: "lib/brain", count: "~76 files", depends: "sim · world" });
    expect(html).toContain('class="topbar-back" href="atlas.html"');
    expect(html).toContain('class="chip layer-chip layer-intelligence">Intelligence');
    expect(html).toContain('class="chip chip-stat">lib/brain');
    expect(html).toContain('class="chip chip-count">~76 files');
    expect(html).toContain("depends on sim · world");
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
const fix = (p: string) => JSON.parse(readFileSync(new URL("../example/atlas-sports-rpg/" + p, import.meta.url), "utf8"));

describe("canonical regeneration (acceptance)", () => {
  it("atlas.json renders the spine, the domain map, and 7 tiles", async () => {
    const doc = fix("atlas.json");
    const html = await assembleAtlas(doc.blocks, { ...doc, title: doc.title });
    expect(html).toContain('id="spine" class="section"');
    expect(html).toContain("map-svg");
    expect(html).toContain('class="progress-step-label">Spine');
    expect((html.match(/class="domain-tile /g) || []).length).toBe(7);
    expect(html).not.toMatch(/season spine/i);
  });
  it("domain-brain.json renders 6 deep sections each with files + exports + connections", async () => {
    const doc = fix("domain-brain.json");
    const html = await assembleDomain(doc.blocks, { ...doc, title: doc.title });
    for (const id of ["c-gm","c-coach","c-owner","c-player","c-scout","c-agent"]) expect(html).toContain(`id="${id}"`);
    expect((html.match(/conns-label">Key files/g) || []).length).toBe(6);
    expect((html.match(/conns-label">Connections/g) || []).length).toBe(6);
  });
  it("domain-story.json renders 7 deep sections", async () => {
    const doc = fix("domain-story.json");
    const html = await assembleDomain(doc.blocks, { ...doc, title: doc.title });
    for (const id of ["c-observer","c-memory","c-director","c-km","c-prose","c-news","c-identity"]) expect(html).toContain(`id="${id}"`);
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
