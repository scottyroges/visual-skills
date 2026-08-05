import { describe, it, expect } from "vitest";
import { lintSpec } from "../src/lint-spec.js";
import type { SpecBlock } from "../src/spec-blocks.js";

const tldr = (bigIdea = true): SpecBlock => ({
  type: "tldr", id: "tldr", heading: "h",
  rows: [{ key: "What", value: "x" }],
  ...(bigIdea ? { bigIdea: { line: "big" } } : {}),
});
const scope = (): SpecBlock => ({ type: "scope", id: "scope", inList: ["a"], outList: [{ text: "b" }] });
const decisions = (opts: { why: boolean; rejected: boolean; n: number }): SpecBlock => ({
  type: "decisions", id: "decisions", title: "Decisions",
  decisions: Array.from({ length: opts.n }, (_, i) => ({
    q: `q${i}`, a: `a${i}`,
    ...(opts.why ? { why: "because" } : {}),
    ...(opts.rejected && i === 0 ? { rejected: "the other way" } : {}),
  })),
});
const diagram = (): SpecBlock => ({ type: "diagram", id: "flow", title: "t", kind: "architecture", d2: "a -> b" });
const rollout = (): SpecBlock => ({ type: "rollout", id: "ro", title: "Rollout", phases: [{ tag: "A", title: "x", scope: "y", gate: ["z"] }] });
const approve = (): SpecBlock => ({
  type: "approve", id: "approve", title: "Before you approve",
  commit: { body: "c" }, scrutinize: { body: "s" }, open: { questions: ["q"] },
});
const filler = (id: string): SpecBlock => ({ type: "risks", id, title: "Risks", risks: [{ risk: "r", mitigation: "m" }] });

describe("lintSpec", () => {
  it("passes a complete large spec with no warnings", () => {
    const blocks: SpecBlock[] = [
      tldr(true), diagram(), { type: "fits", id: "fits", chain: [{ role: "r", title: "t", desc: "d" }] },
      decisions({ why: true, rejected: true, n: 5 }), scope(), rollout(), approve(), example(),
    ];
    expect(lintSpec(blocks)).toEqual([]);
  });

  it("flags the missing lead, decisions, and scope", () => {
    const warns = lintSpec([filler("a"), filler("b")]);
    expect(warns.some((w) => /no TL;DR/.test(w))).toBe(true);
    expect(warns.some((w) => /no Key decisions/.test(w))).toBe(true);
    expect(warns.some((w) => /no Scope/.test(w))).toBe(true);
  });

  it("flags decisions that lack a rationale and a missing rejected-alternative", () => {
    const blocks: SpecBlock[] = [tldr(), scope(), decisions({ why: false, rejected: false, n: 4 })];
    const warns = lintSpec(blocks);
    expect(warns.some((w) => /lack a "why"/.test(w))).toBe(true);
    expect(warns.some((w) => /no rejected-alternative/.test(w))).toBe(true);
  });

  it("scales: a large spec missing the hero / rollout / approval band is flagged", () => {
    // 5 chapters (>= LARGE) made of fillers, plus the floor pieces — but no diagram/rollout/approve.
    const blocks: SpecBlock[] = [
      tldr(true), decisions({ why: true, rejected: true, n: 4 }), scope(),
      filler("r1"), filler("r2"), filler("r3"),
    ];
    const warns = lintSpec(blocks);
    expect(warns.some((w) => /no hero diagram/.test(w))).toBe(true);
    expect(warns.some((w) => /no Rollout/.test(w))).toBe(true);
    expect(warns.some((w) => /Before you approve/.test(w))).toBe(true);
  });

  it("does not impose large-spec surfaces on a small spec", () => {
    const blocks: SpecBlock[] = [tldr(false), decisions({ why: true, rejected: false, n: 2 }), scope()];
    const warns = lintSpec(blocks);
    expect(warns.some((w) => /hero diagram|Rollout|Before you approve|big-idea/.test(w))).toBe(false);
  });
});

const example = (over: Partial<import("../src/blocks.js").ExampleBlock> = {}): SpecBlock => ({
  type: "example", id: "ex", title: "Worked example", source: "test/x.json", lesson: "l",
  stages: [{ label: "in", kind: "input", body: "x" }], ...over,
});

describe("lintSpec — examples", () => {
  it("example blocks do not count toward the large-spec chapter threshold", () => {
    // 4 real chapters + 1 example = still medium: no hero/rollout/approve demands.
    const warns = lintSpec([tldr(true), decisions({ why: true, rejected: true, n: 2 }), scope(),
      filler("r1"), filler("r2"), example()]);
    expect(warns.filter((w) => w.includes("hero") || w.includes("Rollout") || w.includes("approve"))).toEqual([]);
  });
  it("nudges a large spec with zero examples, clears with one", () => {
    const large = [tldr(true), diagram(), decisions({ why: true, rejected: true, n: 2 }), scope(),
      rollout(), approve(), filler("r1")];
    expect(lintSpec(large as SpecBlock[]).some((w) => w.includes("worked example"))).toBe(true);
    expect(lintSpec([...large, example()] as SpecBlock[]).some((w) => w.includes("worked example"))).toBe(false);
  });
  it("pipes lintExamples judgment rules through", () => {
    const warns = lintSpec([tldr(true), decisions({ why: true, rejected: true, n: 2 }), scope(),
      example({ mode: "reveal" })]);
    expect(warns.some((w) => w.includes("nothing is hidden"))).toBe(true);
  });
});
