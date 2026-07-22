import { describe, it, expect } from "vitest";
import { assembleReview } from "../src/assemble-review.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "prose", id: "summary", title: "Summary", markdown: "Hello." },
];

describe("assembleReview lint wiring", () => {
  it("runs authoring lints through onWarn (group without description warns)", async () => {
    const warnings: string[] = [];
    await assembleReview([
      { type: "group", id: "g", title: "G", blocks: [
        { type: "diff", id: "d0", title: "x", path: "x", hunks: [{ header: "@@ -1 +1 @@", lines: ["+a"] }] }] },
    ], { title: "T", source: "s", onWarn: (m) => warnings.push(m) });
    expect(warnings.some((m) => m.includes('group "g" has no description'))).toBe(true);
  });
});

describe("assembleReview", () => {
  it("emits the app-shell (topbar + sidebar + main) and exactly one inlined viewer script", async () => {
    const html = await assembleReview(blocks, { title: "Recap — x", source: "ppgl · base a → head b" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('class="topbar"');
    expect(html).toContain('class="sidebar"');
    expect(html).toContain('class="main"');
    expect(html).toContain("Recap — x");
    expect(html).toContain("<style>");                       // inlined review.css
    expect(html).toContain("zoom-overlay");                  // inlined review-viewer.js + markup
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);         // never external
  });

  it("emits the dark-mode toggle and theme.css", async () => {
    const html = await assembleReview(blocks, { title: "Recap — x", source: "ppgl · base a → head b" });
    expect(html).toContain('data-theme');
    expect(html).toContain('class="vs-theme-toggle"');
    expect(html).toContain('/* vs-theme */');
  });

  it("orders the inlined CSS/JS correctly: theme.css after base CSS, head-apply script before <body>", async () => {
    const html = await assembleReview(blocks, { title: "Recap — x", source: "ppgl · base a → head b" });
    const baseCssIdx = html.indexOf(".topbar {");     // review.css rule, precedes theme.css in the <style> concat
    const themeMarkerIdx = html.indexOf("/* vs-theme */");
    const headScriptIdx = html.indexOf("data-theme"); // first occurrence: the head-apply <script>, before <body>
    const bodyIdx = html.indexOf("<body");
    expect(baseCssIdx).toBeGreaterThan(-1);
    expect(themeMarkerIdx).toBeGreaterThan(-1);
    expect(headScriptIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(baseCssIdx).toBeLessThan(themeMarkerIdx);
    expect(headScriptIdx).toBeLessThan(bodyIdx);
  });
});
