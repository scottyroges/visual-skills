import { describe, it, expect } from "vitest";
import { normalizeExample, MAX_STEP_STAGES, type ExampleBlock } from "../src/blocks.js";

const base = (over: Partial<ExampleBlock> = {}): ExampleBlock => ({
  type: "example", id: "ex", title: "T", source: "test/fixtures/x.json", lesson: "the point",
  stages: [{ label: "in", kind: "input", body: "a" }, { label: "out", kind: "output", body: "b" }],
  ...over,
});

describe("normalizeExample", () => {
  it("applies defaults and passes a well-formed block through clean", () => {
    const { block, problems } = normalizeExample(base());
    expect(problems).toEqual([]);
    expect(block.variant).toBe("walkthrough");
    expect(block.mode).toBe("static");
    expect(block.columns).toEqual(["Before", "After"]);
    expect(block.stages).toHaveLength(2);
  });

  it("flags missing source and lesson", () => {
    const { problems } = normalizeExample(base({ source: "", lesson: undefined as unknown as string }));
    expect(problems.some((p) => p.includes("no source"))).toBe(true);
    expect(problems.some((p) => p.includes("no lesson"))).toBe(true);
  });

  it("survives non-array stages and hostile entries like [null, {}]", () => {
    const { block, problems } = normalizeExample(base({ stages: "nope" as unknown as ExampleBlock["stages"] }));
    expect(block.stages).toEqual([]);
    expect(problems.some((p) => p.includes("not an array"))).toBe(true);

    const hostile = normalizeExample(base({ stages: [null, {}] as unknown as ExampleBlock["stages"] }));
    expect(hostile.block.stages).toHaveLength(1);            // null dropped, {} kept with empty fields
    expect(hostile.problems.some((p) => p.includes("dropped"))).toBe(true);
    expect(hostile.problems.some((p) => p.includes("no label"))).toBe(true);
    expect(hostile.problems.some((p) => p.includes("no body"))).toBe(true);
  });

  it("coerces contrast+step and over-cap step to static, with a problem each", () => {
    const cs = normalizeExample(base({ variant: "contrast", mode: "step" }));
    expect(cs.block.mode).toBe("static");
    expect(cs.problems.some((p) => p.includes("seeing both at once"))).toBe(true);

    const many = Array.from({ length: MAX_STEP_STAGES + 1 }, (_, i) => ({ label: `s${i}`, body: "x" }));
    const over = normalizeExample(base({ mode: "step", stages: many }));
    expect(over.block.mode).toBe("static");
    expect(over.problems.some((p) => p.includes("step cap"))).toBe(true);
  });

  it("normalizes invalid kind/side/reveal values instead of trusting them", () => {
    const { block } = normalizeExample(base({
      stages: [{ label: "x", body: "y", kind: "bogus", side: "c", reveal: "yes" } as unknown as ExampleBlock["stages"][number]],
    }));
    expect(block.stages[0].kind).toBe("step");
    expect(block.stages[0].side).toBeUndefined();
    expect(block.stages[0].reveal).toBe(false);
  });
});
