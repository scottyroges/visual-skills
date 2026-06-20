import { describe, it, expect } from "vitest";
import { assembleAtlas, assembleDomain } from "../src/assemble-atlas.js";

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
