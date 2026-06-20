import { describe, it, expect } from "vitest";
import { assembleAtlas, assembleDomain, renderAtlasDiagram, atlasLegend } from "../src/assemble-atlas.js";
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
