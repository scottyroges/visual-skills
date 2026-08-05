import { describe, it, expect } from "vitest";
import { lintExamples, FAT_STAGE_CHARS } from "../src/lint-examples.js";
import type { ExampleBlock } from "../src/blocks.js";

const ex = (over: Partial<ExampleBlock> = {}): ExampleBlock => ({
  type: "example", id: "ex", title: "T", source: "test/x.json", lesson: "l",
  stages: [
    { label: "a", kind: "input", body: "x" },
    { label: "b", body: "y" },
    { label: "c", kind: "output", body: "z" },
  ],
  ...over,
});
const stageN = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `s${i}`, body: "x" }));

describe("lintExamples", () => {
  it("clean example → no warnings", () => {
    expect(lintExamples([ex()])).toEqual([]);
  });
  it("under-stepped: step with <3 stages", () => {
    const w = lintExamples([ex({ mode: "step", stages: stageN(2) })]);
    expect(w.some((m) => m.includes("hides content that already fits"))).toBe(true);
  });
  it("under-walked: 5+ stage static walkthrough", () => {
    const w = lintExamples([ex({ stages: stageN(5) })]);
    expect(w.some((m) => m.includes('consider mode:"step"'))).toBe(true);
  });
  it("fat stage body", () => {
    const w = lintExamples([ex({ stages: [{ label: "a", body: "x".repeat(FAT_STAGE_CHARS + 1) }] })]);
    expect(w.some((m) => m.includes("trim to the minimum"))).toBe(true);
  });
  it("dead reveal: mode reveal, nothing flagged", () => {
    const w = lintExamples([ex({ mode: "reveal" })]);
    expect(w.some((m) => m.includes("nothing is hidden"))).toBe(true);
  });
  it("reveal spam: two reveal blocks on one page", () => {
    const r = (id: string): ExampleBlock =>
      ex({ id, mode: "reveal", stages: [{ label: "a", body: "x", reveal: true }, { label: "b", body: "y" }] });
    expect(lintExamples([r("e1"), r("e2")]).some((m) => m.includes("predict-then-check"))).toBe(true);
    expect(lintExamples([r("e1")]).some((m) => m.includes("predict-then-check"))).toBe(false);
  });
  it("flat contrast (no sides) and one-sided contrast", () => {
    const flat = lintExamples([ex({ variant: "contrast" })]);
    expect(flat.some((m) => m.includes("no side tags"))).toBe(true);
    const oneSided = lintExamples([ex({ variant: "contrast", stages: [
      { label: "shared", body: "s" }, { label: "old", body: "x", side: "a" }] })]);
    expect(oneSided.some((m) => m.includes("both sides"))).toBe(true);
  });
  it("synthetic source", () => {
    const w = lintExamples([ex({ source: "synthetic — no fixture exists yet" })]);
    expect(w.some((m) => m.includes("real fixture"))).toBe(true);
  });
});
