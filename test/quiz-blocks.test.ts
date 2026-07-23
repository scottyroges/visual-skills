import { describe, it, expect } from "vitest";
import {
  allQuestions, allBlockIds, assertUniqueQuizIds, collectQuizDiagrams,
  type QuizBlock, type QuizQuestionBlock,
} from "../src/quiz-blocks.js";

const q = (id: string, extra: Partial<Record<string, unknown>> = {}): QuizQuestionBlock => ({
  type: "quiz-question", id, family: "mechanism",
  question: "Why must A run before B?",
  answer: { takeaway: "Because B reads A's output." },
  citations: [{ label: "src/a.ts:10-20", file: "src/a.ts", lines: "10-20" }],
  ...extra,
} as QuizQuestionBlock);

const blocks: QuizBlock[] = [
  { type: "prose", id: "how-to", markdown: "Answer before revealing." },
  q("q1"),
  {
    type: "quiz-group", id: "theme-a", title: "The migration path",
    blocks: [
      q("q2", { diagram: { type: "diagram", id: "q2-d", title: "Order", kind: "flowchart", d2: "a -> b" } }),
      { type: "prose", id: "note-1", markdown: "context" },
    ],
  },
];

describe("quiz-blocks helpers", () => {
  it("allQuestions walks top level and group children in order", () => {
    expect(allQuestions(blocks).map((x) => x.id)).toEqual(["q1", "q2"]);
  });

  it("allBlockIds includes group children (valid citation-fragment targets)", () => {
    const ids = allBlockIds(blocks);
    for (const id of ["how-to", "q1", "theme-a", "q2", "note-1"]) expect(ids.has(id)).toBe(true);
  });

  it("assertUniqueQuizIds throws on a duplicate, including nested ones", () => {
    expect(() => assertUniqueQuizIds(blocks)).not.toThrow();
    const dup: QuizBlock[] = [q("q1"), { type: "quiz-group", id: "g", title: "t", blocks: [q("q1")] } as QuizBlock];
    expect(() => assertUniqueQuizIds(dup)).toThrow(/duplicate block id "q1"/);
  });

  it("assertUniqueQuizIds throws on duplicate diagram ids attached to different questions", () => {
    const dupDiagram: QuizBlock[] = [
      q("q1", { diagram: { type: "diagram", id: "shared-d", title: "A", kind: "flowchart", d2: "a -> b" } }),
      q("q2", { diagram: { type: "diagram", id: "shared-d", title: "B", kind: "flowchart", d2: "c -> d" } }),
    ];
    expect(() => assertUniqueQuizIds(dupDiagram)).toThrow(/duplicate block id "shared-d"/);
  });

  it("assertUniqueQuizIds throws on duplicate code ids attached to different questions, including nested ones", () => {
    const dupCode: QuizBlock[] = [
      q("q1", { code: { type: "annotated-code", id: "shared-c", title: "A", lang: "ts", code: "a", annotations: [] } }),
      {
        type: "quiz-group", id: "g", title: "t",
        blocks: [q("q2", { code: { type: "annotated-code", id: "shared-c", title: "B", lang: "ts", code: "b", annotations: [] } })],
      } as QuizBlock,
    ];
    expect(() => assertUniqueQuizIds(dupCode)).toThrow(/duplicate block id "shared-c"/);
  });

  it("collectQuizDiagrams pulls attached question diagrams for the d2 pipeline", () => {
    expect(collectQuizDiagrams(blocks).map((d) => d.id)).toEqual(["q2-d"]);
  });
});
