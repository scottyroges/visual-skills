import { describe, it, expect } from "vitest";
import { buildBlocks } from "../src/gather-recap.js";
import { GenericAdapter } from "../src/adapters/generic.js";
import type { Scope } from "../src/git.js";
import type { ApiBlock } from "../src/blocks.js";

const scope: Scope = {
  repoRoot: ".", baseRef: "HEAD^", headRef: "HEAD", label: "commit HEAD",
  unifiedDiff: `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1,1 +1,1 @@
-old
+new
`,
};

describe("buildBlocks", () => {
  it("produces a rich summary, file-tree, and diff blocks (generic stack)", async () => {
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, new GenericAdapter());
    const types = blocks.map((b) => b.type);
    expect(types).toContain("file-tree");
    expect(types).toContain("diff");
    const summary = blocks.find((b) => b.type === "prose" && b.id === "summary");
    expect(summary).toBeDefined();
    expect((summary as { markdown: string }).markdown).toContain("Areas touched");
  });

  it("degrades to file-tree + diff when the adapter throws (warns, no crash)", async () => {
    const warnings: string[] = [];
    const throwingAdapter = {
      name: "broken",
      async detect() { return true; },
      async schemaDiff() { throw new Error("boom-schema"); },
      async apiDiff() { throw new Error("boom-api"); },
    };
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, throwingAdapter, (m) => warnings.push(m));
    const types = blocks.map((b) => b.type);
    expect(types).toContain("file-tree");
    expect(types).toContain("diff");
    expect(types).not.toContain("schema");
    expect(types).not.toContain("api");
    expect(warnings.some((w) => w.includes("boom-schema"))).toBe(true);
    expect(warnings.some((w) => w.includes("boom-api"))).toBe(true);
  });

  it("emits an api-surface diagram before the api tables when procedures exist", async () => {
    const apiBlock: ApiBlock = {
      type: "api", id: "api", title: "API changes",
      procedures: [
        { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "", change: "added" },
      ],
    };
    const adapter = {
      name: "fake",
      async detect() { return true; },
      async schemaDiff() { return null; },
      async apiDiff() { return [apiBlock]; },
    };
    const files = [{ path: "foo.ts", status: "M" as const, added: 1, deleted: 1 }];
    const blocks = await buildBlocks(scope, files, adapter);
    const diagramIdx = blocks.findIndex((b) => b.type === "diagram" && b.id === "api-surface");
    const apiIdx = blocks.findIndex((b) => b.type === "api");
    expect(diagramIdx).toBeGreaterThanOrEqual(0);
    expect(apiIdx).toBeGreaterThanOrEqual(0);
    expect(diagramIdx).toBeLessThan(apiIdx); // diagram precedes the table
  });
});
