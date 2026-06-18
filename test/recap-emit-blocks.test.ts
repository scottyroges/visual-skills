import { describe, it, expect } from "vitest";
import { buildBlocks } from "../src/gather-recap.js";
import { GenericAdapter } from "../src/adapters/generic.js";
import { assemble } from "../src/assemble.js";
import type { Block } from "../src/blocks.js";
import type { Scope } from "../src/git.js";

const scope: Scope = {
  repoRoot: ".", baseRef: "HEAD^", headRef: "HEAD", label: "commit HEAD",
  unifiedDiff: "diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new\n",
};

describe("recap blocks round-trip", () => {
  it("gathered blocks serialize to JSON and render through assemble", async () => {
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, new GenericAdapter());
    const json = JSON.stringify(blocks);
    const restored = JSON.parse(json) as Block[];
    expect(Array.isArray(restored)).toBe(true);
    const html = await assemble(restored, { title: "Recap", source: "x" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toContain("<script");
    expect(html).toContain("Areas touched");
  }, 30000);
});
