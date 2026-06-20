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
