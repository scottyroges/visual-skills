import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scanInventory } from "../src/gather-atlas.js";

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

  it("flags routers and collects prisma models", async () => {
    const inv = await scanInventory(REPO, ["lib"]);
    expect(inv.modules.find((m) => m.path === "lib/api/root.ts")!.isRouter).toBe(true);
    expect(inv.models.sort()).toEqual(["Game", "Team"]);
  });
});
