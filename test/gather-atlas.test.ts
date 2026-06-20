import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanInventory } from "../src/gather-atlas.js";
import { aggregateDomainEdges, domainMapDiagram } from "../src/gather-atlas.js";
import type { AtlasConfig } from "../src/atlas-config.js";

const REPO = join(__dirname, "fixtures", "atlas-repo");

describe("scanInventory", () => {
  it("lists source modules with resolved in-repo imports and exports", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const paths = inv.modules.map((m) => m.path).sort();
    expect(paths).toEqual(["lib/api/root.ts", "lib/brain/gm.ts", "lib/sim/engine.ts", "lib/sim/loop.ts"]);

    const loop = inv.modules.find((m) => m.path === "lib/sim/loop.ts")!;
    expect(loop.imports).toEqual(["lib/sim/engine"]);     // resolved module key, bare pkgs dropped
    expect(loop.exports).toEqual(["runSeason"]);

    const engine = inv.modules.find((m) => m.path === "lib/sim/engine.ts")!;
    expect(engine.imports).toEqual(["lib/brain/gm"]);
  });

  it("excludes generated code, test trees, and co-located test files from the inventory", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const paths = inv.modules.map((m) => m.path);
    expect(paths).not.toContain("lib/generated/client.ts");     // codegen
    expect(paths).not.toContain("lib/sim/__tests__/helper.ts"); // nested test tree
    expect(paths).not.toContain("lib/sim/season.test.ts");      // co-located *.test.ts
  });

  it("excludes type-only imports from a module's resolved edges (valueOnly)", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    // api/root.ts: value import of sim/engine + `import type` of brain/gm — only the value edge survives.
    const root = inv.modules.find((m) => m.path === "lib/api/root.ts")!;
    expect(root.imports).toEqual(["lib/sim/engine"]);
    expect(root.imports).not.toContain("lib/brain/gm");
  });

  it("flags routers and collects prisma models", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    expect(inv.modules.find((m) => m.path === "lib/api/root.ts")!.isRouter).toBe(true);
    expect(inv.models.sort()).toEqual(["Game", "Team"]);
  });
});

const CONFIG: AtlasConfig = {
  repo: "demo",
  srcRoots: ["lib"],
  domains: [
    { slug: "sim", name: "sim", globs: ["lib/sim/**"], modules: ["lib/sim/engine.ts", "lib/sim/loop.ts"] },
    { slug: "brain", name: "brain", globs: ["lib/brain/**"], modules: ["lib/brain/gm.ts"] },
    { slug: "api", name: "api", globs: ["lib/api/**"], modules: ["lib/api/root.ts"] },
  ],
};

describe("aggregateDomainEdges", () => {
  it("maps module edges to cross-domain edges, dropping intra-domain", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    expect([...(edges.get("sim") ?? [])].sort()).toEqual(["brain"]); // engine→gm (value); loop→engine dropped
    expect([...(edges.get("api") ?? [])].sort()).toEqual(["sim"]);   // root→engine; root's type-only brain import excluded
    expect(edges.get("brain") ?? new Set()).toEqual(new Set());      // gm imports nothing in-repo
  });
});

describe("domainMapDiagram", () => {
  it("emits an architecture diagram-section with a node per domain and an edge per dep", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const diag = domainMapDiagram(CONFIG, edges);
    expect(diag.kind).toBe("architecture");
    expect(diag.d2).toContain("sim -> brain");
    expect(diag.d2).toContain("api -> sim");
    expect(diag.mermaid).toContain("graph");
  });
});

import { buildAtlasDraft } from "../src/gather-atlas.js";

describe("buildAtlasDraft", () => {
  it("emits tldr + domain-map diagram-section + domain-index with a tile per domain", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const draft = buildAtlasDraft(CONFIG, inv, edges, { date: "2026-06-20" });

    expect(draft.kind).toBe("atlas");
    expect(draft.date).toBe("2026-06-20");
    expect(draft.count).toBe("3 domains");
    const types = draft.blocks.map((b) => b.type);
    expect(types).toEqual(["atlas-tldr", "diagram-section", "domain-index"]);

    const index = draft.blocks.find((b) => b.type === "domain-index") as any;
    expect(index.tiles.map((t: any) => t.name)).toEqual(["sim", "brain", "api"]);
    const sim = index.tiles.find((t: any) => t.name === "sim");
    expect(sim.href).toBe("domain-sim/domain-sim.html");
    expect(sim.deps).toEqual(["brain"]);
    expect(sim.meta[0]).toEqual({ key: "~2", value: "files" });
    expect(sim.purpose).toBe(""); // placeholder for the agent
  });
});

import { buildDomainDraft } from "../src/gather-atlas.js";

describe("buildDomainDraft", () => {
  it("emits tldr + components + arch diagram-section + depth + seams for a domain", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const draft = buildDomainDraft("sim", CONFIG, inv, edges, { date: "2026-06-20" });

    expect(draft.kind).toBe("domain");
    expect(draft.slug).toBe("sim");
    expect(draft.path).toBe("lib/sim");
    expect(draft.depends).toBe("brain");
    expect(draft.blocks.map((b) => b.type)).toEqual(
      ["domain-tldr", "components", "diagram-section", "depth", "seams"],
    );

    // sim has loose files directly under lib/sim → one component named after the domain.
    const depth = draft.blocks.find((b) => b.type === "depth") as any;
    expect(depth.components.map((c: any) => c.name)).toEqual(["sim"]);
    expect(depth.components[0].exports.map((e: any) => e.name).sort())
      .toEqual(["SimResult", "runSeason", "simulateGame"].sort());

    const seams = draft.blocks.find((b) => b.type === "seams") as any;
    expect(seams.depends.map((x: any) => x.name)).toEqual(["brain"]);
    expect(seams.depends[0].href).toBe("../domain-brain/domain-brain.html");
  });

  it("never emits an owns block; throws on an unknown slug", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    const edges = aggregateDomainEdges(CONFIG, inv);
    const draft = buildDomainDraft("sim", CONFIG, inv, edges);
    expect(draft.blocks.some((b) => b.type === "owns")).toBe(false);
    expect(() => buildDomainDraft("nope", CONFIG, inv, edges)).toThrow(/unknown domain/);
  });
});
