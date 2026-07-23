import { describe, it, expect } from "vitest";
import { renderQuizQuestion } from "../src/renderers/quiz-question.js";
import type { QuizQuestionBlock } from "../src/quiz-blocks.js";
import type { DiagramResult } from "../src/render-diagram.js";

const base: QuizQuestionBlock = {
  type: "quiz-question", id: "q1", family: "mechanism",
  question: "Why must the migration land **before** the router change?",
  answer: {
    takeaway: "**The router reads the new column** — reversed order 500s.",
    points: ["`capture` selects `paidAt`", "deploy order = migration, then app"],
  },
  citations: [
    { label: "src/router.ts:12-30", file: "src/router.ts", lines: "12-30" },
    { label: "Deploy notes", fragment: "deploy-notes" },
    { label: "Missing", fragment: "nope" },
  ],
};
const ctx = { num: "3", ids: new Set(["q1", "deploy-notes"]), diagrams: new Map<string, DiagramResult>() };

describe("renderQuizQuestion", () => {
  it("renders id, number, family badge, prompt, and a native <details> reveal", async () => {
    const html = await renderQuizQuestion(base, ctx);
    expect(html).toContain('id="q1"');
    expect(html).toContain('class="quiz-num"');
    expect(html).toContain(">3<");
    expect(html).toContain("is-mechanism");
    expect(html).toContain("<details");
    expect(html).toContain("Reveal answer");
    expect(html).toContain("<strong>before</strong>");         // prompt markdown rendered
  });

  it("renders the takeaway, points, and citations", async () => {
    const html = await renderQuizQuestion(base, ctx);
    expect(html).toContain('class="quiz-takeaway"');
    expect(html).toContain("<strong>The router reads the new column</strong>");
    expect(html).toContain("<code>capture</code>");
    expect(html).toContain("src/router.ts:12-30");
  });

  it("links only citations whose fragment resolves to a known block id", async () => {
    const html = await renderQuizQuestion(base, ctx);
    expect(html).toContain('href="#deploy-notes"');
    expect(html).not.toContain('href="#nope"');
    expect(html).toContain("Missing");                          // still shown, as plain text
    expect(html).not.toContain('href="src/router.ts');          // file citations are never links
  });

  it("renders attached annotated code", async () => {
    const withCode: QuizQuestionBlock = {
      ...base,
      code: { type: "annotated-code", id: "q1-code", title: "capture()", lang: "ts",
        code: "const a = 1;\nconst b = a + 1;", annotations: [{ line: 2, note: "depends on a" }] },
    };
    const html = await renderQuizQuestion(withCode, ctx);
    expect(html).toContain("depends on a");
    expect(html).toContain('class="vs-lineno"');
  });
});
