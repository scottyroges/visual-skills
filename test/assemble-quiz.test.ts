import { describe, it, expect } from "vitest";
import { assembleQuiz } from "../src/assemble-quiz.js";
import type { QuizBlock, QuizQuestionBlock } from "../src/quiz-blocks.js";

const q = (id: string, family: "system-fit" | "rationale" | "mechanism", title?: string): QuizQuestionBlock => ({
  type: "quiz-question", id, family, title,
  question: `Prompt for ${id}?`,
  answer: { takeaway: `**Takeaway ${id}**` },
  citations: [{ label: `src/${id}.ts:1-5` }],
});

const blocks: QuizBlock[] = [
  { type: "prose", id: "how-to", title: "How to use this quiz", markdown: "Answer in your head first." },
  q("q1", "system-fit", "Where it sits"),
  {
    type: "quiz-group", id: "theme-a", title: "The capture path", description: "The core mechanism.",
    blocks: [q("q2", "mechanism"), q("q3", "rationale")],
  },
];

const opts = { title: "Quiz — PayPal capture", source: "PR #42", intro: "Covers the capture flow." };

describe("assembleQuiz", () => {
  it("renders a self-contained page with shell, TL;DR fold, and viewer script", async () => {
    const html = await assembleQuiz(blocks, opts);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trim().endsWith("</html>")).toBe(true);
    expect(html).toContain("--accent");                    // review.css inlined
    expect(html).toContain(".quiz-q");                     // quiz.css inlined
    expect(html).toContain('class="tldr-card"');           // TL;DR fold
    expect(html).toContain("PR #42");                      // source row
    expect(html).toContain("3 questions");                 // count in TL;DR / topbar
    expect(html).toContain("zoom-overlay");                // viewer wired
  });

  it("numbers questions continuously across groups and renders group children (not diff-filtered)", async () => {
    const html = await assembleQuiz(blocks, opts);
    expect(html).toContain('id="q1"');
    expect(html).toContain('id="q2"');
    expect(html).toContain('id="q3"');                     // group child rendered
    expect(html).toContain('id="theme-a"');
    expect(html).toContain("The core mechanism.");         // group description
    const order = ["Takeaway q1", "Takeaway q2", "Takeaway q3"].map((s) => html.indexOf(s));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("sidebar lists every question with its number and short label", async () => {
    const html = await assembleQuiz(blocks, opts);
    expect(html).toContain('data-target="q1"');
    expect(html).toContain('data-target="q2"');
    expect(html).toContain('data-target="q3"');
    expect(html).toContain("Where it sits");               // custom title
    expect(html).toContain("Question 2");                  // default label
  });

  it("surfaces lint warnings through onWarn", async () => {
    const warns: string[] = [];
    await assembleQuiz([q("solo", "mechanism")], { title: "t", onWarn: (m) => warns.push(m) });
    expect(warns.some((w) => /fewer than 2 questions/.test(w))).toBe(true);
  });

  it("throws on duplicate ids", async () => {
    await expect(assembleQuiz([q("a", "mechanism"), q("a", "rationale")], { title: "t" }))
      .rejects.toThrow(/duplicate block id/);
  });

  it("flushes structural lint warnings before a diagram-render crash (missing d2 source)", async () => {
    const warns: string[] = [];
    const broken: QuizBlock[] = [
      { ...q("q1", "mechanism"), diagram: { type: "diagram", id: "q1-d", title: "Broken", kind: "flowchart" } as any },
      { ...q("q2", "rationale"), citations: [] }, // known structural warning: no citations
    ];
    await expect(assembleQuiz(broken, { title: "t", onWarn: (m) => warns.push(m) }))
      .rejects.toThrow(/d2 source/);
    expect(warns.some((w) => /question "q2" has no citations/.test(w))).toBe(true);
  });

  it("emits the dark-mode toggle and theme.css", async () => {
    const html = await assembleQuiz(blocks, opts);
    expect(html).toContain('data-theme');
    expect(html).toContain('class="vs-theme-toggle"');
    expect(html).toContain('/* vs-theme */');
  });

  it("orders the inlined CSS/JS correctly: theme.css after quiz.css, head-apply script before <body>", async () => {
    const html = await assembleQuiz(blocks, opts);
    const baseCssIdx = html.indexOf("--accent");        // review.css, precedes quiz.css/theme.css
    const quizCssIdx = html.indexOf(".quiz-q");          // quiz.css rule, precedes theme.css
    const themeMarkerIdx = html.indexOf("/* vs-theme */");
    const headScriptIdx = html.indexOf("data-theme");    // first occurrence: the head-apply <script>, before <body>
    const bodyIdx = html.indexOf("<body");
    expect(baseCssIdx).toBeGreaterThan(-1);
    expect(quizCssIdx).toBeGreaterThan(-1);
    expect(themeMarkerIdx).toBeGreaterThan(-1);
    expect(headScriptIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(baseCssIdx).toBeLessThan(quizCssIdx);
    expect(quizCssIdx).toBeLessThan(themeMarkerIdx);
    expect(headScriptIdx).toBeLessThan(bodyIdx);
  });
});
