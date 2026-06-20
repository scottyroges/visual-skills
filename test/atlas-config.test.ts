import { describe, it, expect } from "vitest";
import { matchGlob, firstGuessConfig } from "../src/atlas-config.js";

describe("matchGlob", () => {
  it("matches ** across directories and * within a segment", () => {
    expect(matchGlob("lib/sim/**", "lib/sim/engine.ts")).toBe(true);
    expect(matchGlob("lib/sim/**", "lib/sim/loop/season.ts")).toBe(true);
    expect(matchGlob("lib/sim/**", "lib/brain/gm.ts")).toBe(false);
    expect(matchGlob("lib/*/index.ts", "lib/sim/index.ts")).toBe(true);
    expect(matchGlob("lib/*/index.ts", "lib/sim/loop/index.ts")).toBe(false);
  });
});

describe("firstGuessConfig", () => {
  it("makes one domain per top-level dir under each srcRoot", () => {
    const cfg = firstGuessConfig("demo", ["lib"], [
      "lib/sim/engine.ts",
      "lib/sim/loop/season.ts",
      "lib/brain/gm.ts",
      "lib/index.ts", // loose file under the root → no domain
    ]);
    expect(cfg.repo).toBe("demo");
    expect(cfg.srcRoots).toEqual(["lib"]);
    expect(cfg.domains.map((d) => d.slug).sort()).toEqual(["brain", "sim"]);
    const sim = cfg.domains.find((d) => d.slug === "sim")!;
    expect(sim.globs).toEqual(["lib/sim/**"]);
    expect(sim.modules.sort()).toEqual(["lib/sim/engine.ts", "lib/sim/loop/season.ts"]);
  });
});
