import { describe, it, expect } from "vitest";
import { renderWalkthrough } from "../src/review/walkthrough.js";
import type { Block } from "../src/blocks.js";

const blocks: Block[] = [
  { type: "group", id: "grp-core", title: "Core change", description: "The heart.",
    blocks: [
      { type: "diff", id: "diff-0", title: "x.ts", path: "src/x.ts",
        description: "Adds a thing.", hunks: [{ header: "@@ -1 +1 @@", lines: ["+a", "-b"] }] },
      { type: "diff", id: "diff-1", title: "y.ts", path: "src/y.ts",
        hunks: [{ header: "@@ -1 +1 @@", lines: ["+c"] }] },
    ] },
  { type: "group", id: "grp-tests", title: "Tests", blocks: [
      { type: "diff", id: "diff-2", title: "t.ts", path: "src/t.test.ts", hunks: [{ header: "@@", lines: ["+t"] }] },
  ] },
];

describe("renderWalkthrough", () => {
  it("numbers chapters (1/2) and subsections (1a/1b), renders group desc + a collapsed file-diff", async () => {
    const html = await renderWalkthrough(blocks);
    expect(html).toContain('id="grp-core"');
    expect(html).toContain('class="chapter-no"');
    expect(html).toContain(">1<");
    expect(html).toContain(">1a<");
    expect(html).toContain(">1b<");
    expect(html).toContain(">2<");
    expect(html).toContain("The heart.");
    expect(html).toContain('class="file-diff"');
    expect(html).toContain("Adds a thing.");
    expect(html).not.toMatch(/<details[^>]*\bopen\b/);   // diffs collapsed
  });

  it("puts a divider BETWEEN chapters but not before the first", async () => {
    const html = await renderWalkthrough(blocks); // two chapters
    const dividers = html.match(/class="chapter-divider"/g) ?? [];
    expect(dividers).toHaveLength(1); // exactly one separator for two chapters
    expect(html.indexOf("chapter-divider")).toBeGreaterThan(html.indexOf('id="grp-core"'));
  });

  it("gives aligned (desc-item) bullets even when the description leads with a paragraph", async () => {
    const led: Block[] = [
      { type: "group", id: "g", title: "G", description: "d", blocks: [
        { type: "diff", id: "diff-led", title: "z.ts", path: "src/z.ts",
          description: "**Takeaway.**\n\n- first bullet\n- second bullet that is long enough to wrap\n\nTrailing note.",
          hunks: [{ header: "@@", lines: ["+z"] }] },
      ] },
    ];
    const html = await renderWalkthrough(led);
    // The canonical "bold takeaway + bullets" shape must use the aligned flex bullets,
    // not a bare <ul><li> (whose wrapped lines slide under the marker).
    expect(html).toContain('class="desc-item"');
    expect(html).toContain('class="desc-bullet"');
    expect(html).toContain("Takeaway.");
    expect(html).toContain("Trailing note.");
    expect(html).not.toMatch(/<li>(?!<span)/); // no un-transformed list items
  });

  it("renders an example nested in a group, in document order beside its diff", async () => {
    const blocks: Block[] = [{
      type: "group", id: "g1", title: "1. Core change", description: "d",
      blocks: [
        { type: "diff", id: "d1", title: "x.ts", path: "src/x.ts", hunks: [{ header: "@@ -1 +1 @@", lines: ["+a"] }] },
        { type: "example", id: "ex1", title: "Same input, old vs new", source: "test/x.test.ts", lesson: "l",
          variant: "contrast",
          stages: [
            { label: "input", kind: "input", body: "payload" },
            { label: "old", kind: "output", body: "merged", side: "a" },
            { label: "new", kind: "output", body: "split", side: "b" },
          ] },
      ],
    }];
    const html = await renderWalkthrough(blocks, undefined, new Map());
    expect(html).toContain("vs-example");
    expect(html).toContain("Same input, old vs new");
    expect(html.indexOf("src/x.ts")).toBeLessThan(html.indexOf("vs-example"));  // document order
    // The nested example heads at <h4>, level with the diff subsections beside it under the
    // chapter's <h3> — never renderExample's own <h2> (which would invert the hierarchy).
    expect(html).toContain('<h4 class="subsection-title">Same input, old vs new</h4>');
    expect(html).not.toContain("vs-ex-title");
  });
});

describe("renderWalkthrough standalone safety", () => {
  // Exported and called directly. preNormalized defaults to FALSE, so the chapter normalizes the
  // example itself — its <h4> header reads title/id raw, ahead of renderExample.
  it("renders a malformed nested example without throwing and surfaces its problems once", async () => {
    const warns: string[] = [];
    const blocks = [{
      type: "group", id: "g1", title: "1. Core", description: "d",
      blocks: [{ type: "example", stages: [null, {}] }],
    }] as unknown as Block[];
    const html = await renderWalkthrough(blocks, (m) => warns.push(m), new Map());
    expect(html).toContain("vs-example");
    expect(html).toContain('id="example"');
    expect(warns.filter((w) => w.includes("no source"))).toHaveLength(1);
    expect(warns.filter((w) => w.includes("no lesson"))).toHaveLength(1);
    expect(warns.filter((w) => w.includes("dropped"))).toHaveLength(1);
  });
});
