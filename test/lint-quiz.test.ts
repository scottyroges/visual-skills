import { describe, it, expect } from "vitest";
import { lintQuiz } from "../src/lint-quiz.js";
import type { QuizBlock, QuizFamily } from "../src/quiz-blocks.js";

const q = (id: string, over: Partial<Record<string, unknown>> = {}): QuizBlock => ({
  type: "quiz-question", id, family: "mechanism" as QuizFamily,
  question: "Why must the schema migration land before the router change?",
  answer: { takeaway: "**The router reads the new column** — reversed order 500s." },
  citations: [{ label: "src/router.ts:12-30", file: "src/router.ts", lines: "12-30" }],
  ...over,
} as QuizBlock);

describe("lintQuiz", () => {
  it("passes a healthy mixed quiz with no warnings", () => {
    const blocks: QuizBlock[] = [
      q("q1", { family: "system-fit" }), q("q2", { family: "rationale" }),
      q("q3"), q("q4", { family: "rationale" }),
    ];
    expect(lintQuiz(blocks)).toEqual([]);
  });

  it("flags fewer than 2 questions", () => {
    expect(lintQuiz([q("q1")]).some((w) => /fewer than 2 questions/.test(w))).toBe(true);
  });

  it("flags a missing takeaway and empty citations", () => {
    const warns = lintQuiz([q("q1", { answer: { takeaway: " " } }), q("q2", { citations: [] })]);
    expect(warns.some((w) => /"q1" has no answer takeaway/.test(w))).toBe(true);
    expect(warns.some((w) => /"q2" has no citations/.test(w))).toBe(true);
  });

  it("flags trivia-pattern questions", () => {
    const warns = lintQuiz([q("q1", { question: "Which file holds the migration?" }), q("q2")]);
    expect(warns.some((w) => /"q1" looks like recall trivia/.test(w))).toBe(true);
  });

  it("flags a citation fragment that resolves to no block id", () => {
    const warns = lintQuiz([
      q("q1", { citations: [{ label: "see notes", fragment: "missing-block" }] }), q("q2"),
    ]);
    expect(warns.some((w) => /unknown fragment "#missing-block"/.test(w))).toBe(true);
  });

  it("flags a medium+ quiz drawn from a single family, descending into groups", () => {
    const blocks: QuizBlock[] = [
      q("q1"), q("q2"),
      { type: "quiz-group", id: "g", title: "theme", blocks: [q("q3"), q("q4")] } as QuizBlock,
    ];
    expect(lintQuiz(blocks).some((w) => /all 4 questions test one family/.test(w))).toBe(true);
  });
});
