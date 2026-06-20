import { describe, it, expect } from "vitest";
import { matchGlob, firstGuessConfig, reconcile } from "../src/atlas-config.js";

describe("matchGlob", () => {
  it("matches ** across directories and * within a segment", () => {
    expect(matchGlob("lib/sim/**", "lib/sim/engine.ts")).toBe(true);
    expect(matchGlob("lib/sim/**", "lib/sim/loop/season.ts")).toBe(true);
    expect(matchGlob("lib/sim/**", "lib/brain/gm.ts")).toBe(false);
    expect(matchGlob("lib/*/index.ts", "lib/sim/index.ts")).toBe(true);
    expect(matchGlob("lib/*/index.ts", "lib/sim/loop/index.ts")).toBe(false);
  });

  it("does not match a prefix segment that is shorter than the directory name", () => {
    // "lib/sim" is a strict prefix of "lib/simulation" but should not match
    expect(matchGlob("lib/sim/**", "lib/simulation/x.ts")).toBe(false);
  });

  it("escapes literal dots and confines * to a single segment", () => {
    expect(matchGlob("lib/sim/*.ts", "lib/sim/engine.ts")).toBe(true);
    expect(matchGlob("lib/sim/*.ts", "lib/sim/sub/engine.ts")).toBe(false);
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

describe("reconcile", () => {
  const config = {
    repo: "demo",
    srcRoots: ["lib"],
    domains: [
      { slug: "sim", name: "Simulation", globs: ["lib/sim/**"], modules: ["lib/sim/old.ts"] },
      { slug: "brain", name: "Brain", globs: ["lib/brain/**"], modules: [] },
      { slug: "empty", name: "Empty", globs: ["lib/ghost/**"], modules: [] },
    ],
  };
  const live = ["lib/sim/engine.ts", "lib/sim/loop.ts", "lib/brain/gm.ts", "lib/store/cart.ts"];

  it("refills modules from globs, preserving human name/globs", () => {
    const { config: next } = reconcile(config, live);
    const sim = next.domains.find((d) => d.slug === "sim")!;
    expect(sim.name).toBe("Simulation");            // human edit preserved
    expect(sim.modules).toEqual(["lib/sim/engine.ts", "lib/sim/loop.ts"]); // refilled, old.ts dropped
  });

  it("reports new (unassigned) modules, stale paths, and empty domains", () => {
    const { drift } = reconcile(config, live);
    expect(drift.newModules).toEqual(["lib/store/cart.ts"]);
    expect(drift.stalePaths).toEqual([{ slug: "sim", path: "lib/sim/old.ts" }]);
    expect(drift.emptyDomains).toEqual(["empty"]);
  });

  it("does not mutate the input config (globs and modules arrays are independent copies)", () => {
    const snapshot = JSON.stringify(config);
    reconcile(config, live);
    expect(JSON.stringify(config)).toBe(snapshot);
  });

  it("tolerates a hand-written config with no resolved `modules` field", () => {
    // The skill tells humans to author slug/name/globs only; `modules` is generated.
    const handWritten = {
      repo: "demo", srcRoots: ["lib"],
      domains: [{ slug: "sim", name: "Sim", globs: ["lib/sim/**"] }],
    } as unknown as Parameters<typeof reconcile>[0];
    const { config: next, drift } = reconcile(handWritten, ["lib/sim/engine.ts", "lib/x/y.ts"]);
    expect(next.domains[0].modules).toEqual(["lib/sim/engine.ts"]); // resolved from globs
    expect(drift.stalePaths).toEqual([]);                            // no prior modules → no stale
    expect(drift.newModules).toEqual(["lib/x/y.ts"]);
  });
});
