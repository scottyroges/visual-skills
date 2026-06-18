import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dependencyNeighborhood } from "../src/dep-graph.js";
import { renderDiagram } from "../src/render-diagram.js";

async function tempRepo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "vs-dep-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, content);
  }
  return root;
}

describe("dependencyNeighborhood", () => {
  it("returns null when no changed file is a source file", async () => {
    const root = await tempRepo({ "README.md": "# x" });
    try {
      expect(await dependencyNeighborhood(["README.md"], root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("graphs imports (outgoing) and importers (incoming) of a changed file and compiles via d2", async () => {
    const root = await tempRepo({
      "src/a.ts": `import { u } from "./util.js";\nimport { z } from "zod";\nexport const a = 1;`,
      "src/util.ts": `export const u = 1;`,
      "src/b.ts": `import { a } from "./a.js";\nexport const b = a;`,
    });
    try {
      const block = await dependencyNeighborhood(["src/a.ts"], root);
      expect(block).not.toBeNull();
      expect(block!.kind).toBe("architecture");
      expect(block!.d2).toContain("src/a.ts");
      expect(block!.d2).toContain("style.fill");
      expect(block!.d2).toContain("src/util");
      expect(block!.d2).toContain("zod");
      expect(block!.d2).toContain("src/b.ts");
      const out = await renderDiagram(block!, { excalidraw: false });
      expect(out.svg).toMatch(/<svg/);
      expect(out.svg).not.toContain("failed to render");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);

  it("bounds node count and collapses overflow into a '+N more' node", async () => {
    const files: Record<string, string> = { "src/hub.ts": `export const hub = 1;` };
    for (let i = 0; i < 30; i++) {
      files[`src/imp${i}.ts`] = `import { hub } from "./hub.js";\nexport const v${i} = hub;`;
    }
    const root = await tempRepo(files);
    try {
      const block = await dependencyNeighborhood(["src/hub.ts"], root, { maxNodes: 8 });
      expect(block).not.toBeNull();
      expect(block!.d2).toContain("more");
      const nodeDecls = (block!.d2.match(/^"/gm) ?? []).length;
      expect(nodeDecls).toBeLessThanOrEqual(9);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
