# Quiz Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sixth skill, `quiz`, that turns a PR/spec/generated doc into an on-demand comprehension-check HTML page (reveal-style questions) plus a live terminal grading mode.

**Architecture:** A separate `QuizBlock` union (`src/quiz-blocks.ts`, modeled on `spec-blocks.ts`) composed with the existing `ProseBlock`/`AnnotatedCodeBlock`/`DiagramBlock` primitives; a dedicated assembler `assembleQuiz` reusing the shared page chrome (review.css, spec.css, review-viewer.js, d2 pipeline) with its own sidebar/TL;DR/group rendering; a render-only CLI `bin/quiz.ts` mirroring `bin/spec.ts`; a structural lint `lintQuiz`; and a `skills/quiz/SKILL.md` carrying the question standard, grounding rules, and live mode.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), Node + tsx, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-quiz-skill-design.md` — read it before starting.

## Global Constraints

- `quiz-question` must NOT be added to the global `Block` union in `src/blocks.ts` — the quiz has its own `QuizBlock` union (the skill-docs sync test would otherwise force visual-doc to document it).
- Citations render as styled text, never hrefs; the only linkable form is an in-page `#fragment` validated against block ids (safe-link policy: `SAFE_HREF` in `src/html.ts` allows only `#fragment` and `http(s)`).
- The answer reveal uses native `<details>` — no JS required, `file://`-safe.
- CLI: relative `--blocks`/`--out` resolve against cwd (`resolve()`), writes `quiz.html` AND re-writes `quiz.json` into `--out` (self-contained folder convention).
- Generator string: `visual-skills · quiz`. Output convention: `<target-repo>/.visual/quizzes/<short-label>/`.
- All source files use ESM imports with the `.js` suffix (e.g. `from "./quiz-blocks.js"`), matching the repo.
- Run all commands from the repo root: `/home/srogener/visual-skills`.

---

### Task 1: Quiz block model (`src/quiz-blocks.ts`)

**Files:**
- Create: `src/quiz-blocks.ts`
- Test: `test/quiz-blocks.test.ts`

**Interfaces:**
- Consumes: `ProseBlock`, `AnnotatedCodeBlock`, `DiagramBlock` from `src/blocks.ts` (existing).
- Produces (used by every later task): `QuizFamily`, `Citation`, `QuizQuestionBlock`, `QuizGroupBlock`, `QuizBlock`, `QuizDoc`, `allQuestions(blocks: QuizBlock[]): QuizQuestionBlock[]`, `allBlockIds(blocks: QuizBlock[]): Set<string>`, `assertUniqueQuizIds(blocks: QuizBlock[]): void`, `collectQuizDiagrams(blocks: QuizBlock[]): DiagramBlock[]`.

- [ ] **Step 1: Write the failing test**

Create `test/quiz-blocks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  allQuestions, allBlockIds, assertUniqueQuizIds, collectQuizDiagrams,
  type QuizBlock,
} from "../src/quiz-blocks.js";

const q = (id: string, extra: Partial<Record<string, unknown>> = {}): QuizBlock => ({
  type: "quiz-question", id, family: "mechanism",
  question: "Why must A run before B?",
  answer: { takeaway: "Because B reads A's output." },
  citations: [{ label: "src/a.ts:10-20", file: "src/a.ts", lines: "10-20" }],
  ...extra,
} as QuizBlock);

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

  it("collectQuizDiagrams pulls attached question diagrams for the d2 pipeline", () => {
    expect(collectQuizDiagrams(blocks).map((d) => d.id)).toEqual(["q2-d"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/quiz-blocks.test.ts`
Expected: FAIL — cannot resolve `../src/quiz-blocks.js`.

- [ ] **Step 3: Write the implementation**

Create `src/quiz-blocks.ts`:

```ts
// Block model for the quiz renderer. A quiz page is an ordered array of these blocks;
// `assemble-quiz.ts` renders each to a section and derives the sidebar outline from them.
// Questions attach the shared annotated-code / diagram primitives by composition (the way
// atlas embeds DiagramBlock), so this union stays separate from the global Block union —
// see docs/superpowers/specs/2026-07-22-quiz-skill-design.md.
import type { AnnotatedCodeBlock, DiagramBlock, ProseBlock } from "./blocks.js";

export type QuizFamily = "system-fit" | "rationale" | "mechanism";

/** Structured citation — rendered as styled text, NEVER an external href (safe-link policy
 *  allows only #fragment and http(s)). `fragment` is the one linkable form: an in-page anchor
 *  to a block id in THIS quiz doc, validated at render time. */
export interface Citation {
  label: string;      // e.g. "src/git.ts:41–52" or "Recap §3 — The migration path"
  file?: string;      // repo-relative path, when citing code
  lines?: string;     // e.g. "41-52"
  fragment?: string;  // in-page anchor to a block id in this doc
}

export interface QuizQuestionBlock {
  type: "quiz-question";
  id: string;
  family: QuizFamily;          // exactly one — the family the question primarily tests
  title?: string;              // short sidebar label; defaults to "Question N"
  question: string;            // markdown prompt shown before the reveal
  code?: AnnotatedCodeBlock;   // real snippet the question interrogates
  diagram?: DiagramBlock;      // rendered between the prompt and the reveal
  answer: {
    takeaway: string;          // bold one-line model answer (inline markdown)
    points?: string[];         // markdown bullets expanding it
  };
  citations: Citation[];       // >=1 — where the answer is grounded
}

/** Optional theming for large quizzes; children are questions (plus optional prose). */
export interface QuizGroupBlock {
  type: "quiz-group";
  id: string;
  title: string;
  description?: string;        // markdown shown under the group title
  blocks: (QuizQuestionBlock | ProseBlock)[];
}

export type QuizBlock = QuizQuestionBlock | QuizGroupBlock | ProseBlock;

/** Envelope — the file Claude authors (quiz.json). */
export interface QuizDoc {
  kind: "quiz";
  title: string;               // "Quiz — <human label>"
  source: string;              // what was quizzed (PR #, spec path, doc path)
  intro?: string;              // markdown: what this quiz covers (feeds the TL;DR fold)
  generator?: string;
  excalidraw?: boolean;
  blocks: QuizBlock[];
}

/** Questions in document order, descending into groups. */
export function allQuestions(blocks: QuizBlock[]): QuizQuestionBlock[] {
  const out: QuizQuestionBlock[] = [];
  for (const b of blocks) {
    if (b.type === "quiz-question") out.push(b);
    else if (b.type === "quiz-group")
      for (const c of b.blocks) if (c.type === "quiz-question") out.push(c);
  }
  return out;
}

/** Every block id in the doc (incl. group children) — the valid citation-fragment targets. */
export function allBlockIds(blocks: QuizBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const b of blocks) {
    ids.add(b.id);
    if (b.type === "quiz-group") for (const c of b.blocks) ids.add(c.id);
  }
  return ids;
}

export function assertUniqueQuizIds(blocks: QuizBlock[]): void {
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) throw new Error(`duplicate block id "${id}" — ids must be unique`);
    seen.add(id);
  };
  for (const b of blocks) {
    add(b.id);
    if (b.type === "quiz-group") for (const c of b.blocks) add(c.id);
  }
}

/** Attached diagrams for the shared d2 pipeline (keyed by the diagram's own id). */
export function collectQuizDiagrams(blocks: QuizBlock[]): DiagramBlock[] {
  return allQuestions(blocks).flatMap((q) => (q.diagram ? [q.diagram] : []));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/quiz-blocks.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/quiz-blocks.ts test/quiz-blocks.test.ts
git commit -m "feat(quiz): QuizBlock model — separate union composed from shared primitives"
```

---

### Task 2: Structural lint (`src/lint-quiz.ts`)

**Files:**
- Create: `src/lint-quiz.ts`
- Test: `test/lint-quiz.test.ts`

**Interfaces:**
- Consumes: `allQuestions`, `allBlockIds`, `QuizBlock` from `src/quiz-blocks.ts` (Task 1).
- Produces: `lintQuiz(blocks: QuizBlock[]): string[]` — warning strings, used by `assembleQuiz` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `test/lint-quiz.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lint-quiz.test.ts`
Expected: FAIL — cannot resolve `../src/lint-quiz.js`.

- [ ] **Step 3: Write the implementation**

Create `src/lint-quiz.ts`:

```ts
// Structural floor for quiz docs — heuristics surfaced via onWarn, not hard errors (same
// philosophy as lint-spec.ts). Altitude and proportionality are SKILL.md authoring rules:
// the render-only CLI has no source inventory to judge coverage against.
import { allBlockIds, allQuestions, type QuizBlock } from "./quiz-blocks.js";

const TRIVIA: [RegExp, string][] = [
  [/\bwhich file\b/i, "which file"],
  [/\bwhat file\b/i, "what file"],
  [/\bhow many\b/i, "how many"],
  [/\bwhat line\b/i, "what line"],
  [/\bdid we test\b/i, "did we test"],
];

export function lintQuiz(blocks: QuizBlock[]): string[] {
  const warns: string[] = [];
  const qs = allQuestions(blocks);
  const ids = allBlockIds(blocks);

  if (qs.length < 2)
    warns.push("fewer than 2 questions — even a one-file fix earns 2-3 (mechanism + rationale)");

  for (const q of qs) {
    if (!q.answer?.takeaway?.trim())
      warns.push(`question "${q.id}" has no answer takeaway — every question carries a bold model answer`);
    if (!q.citations?.length)
      warns.push(`question "${q.id}" has no citations — ground the model answer in the source (file:lines or a doc section)`);
    const hit = TRIVIA.find(([re]) => re.test(q.question));
    if (hit)
      warns.push(`question "${q.id}" looks like recall trivia ("${hit[1]}...") — ask for the why/mechanism, not what ctrl-F can answer`);
    for (const c of q.citations ?? []) {
      if (c.fragment && !ids.has(c.fragment))
        warns.push(`question "${q.id}" cites unknown fragment "#${c.fragment}" — citation fragments must match a block id in this doc`);
    }
  }

  if (qs.length >= 4 && new Set(qs.map((x) => x.family)).size === 1)
    warns.push(`all ${qs.length} questions test one family ("${qs[0].family}") — a medium+ quiz mixes system-fit, rationale, and mechanism`);

  return warns;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lint-quiz.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lint-quiz.ts test/lint-quiz.test.ts
git commit -m "feat(quiz): structural lint floor (count, answers, citations, trivia, family mix)"
```

---

### Task 3: Question renderer (`src/renderers/quiz-question.ts`)

**Files:**
- Create: `src/renderers/quiz-question.ts`
- Test: `test/quiz-question.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (`src/html.ts`), `renderMarkdown`/`renderInlineMarkdown` (`src/renderers/markdown.ts`), `renderAnnotatedCode` (`src/renderers/annotated-code.ts`), `renderDiagramCard` (`src/review/sections.ts`), `DiagramResult` (`src/render-diagram.ts`), Task 1 types.
- Produces: `renderQuizQuestion(b: QuizQuestionBlock, ctx: QuizQuestionCtx): Promise<string>` with `QuizQuestionCtx = { num: string; ids: Set<string>; diagrams: Map<string, DiagramResult>; onWarn?: (msg: string) => void }` — used by `assembleQuiz` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `test/quiz-question.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/quiz-question.test.ts`
Expected: FAIL — cannot resolve `../src/renderers/quiz-question.js`.

- [ ] **Step 3: Write the implementation**

Create `src/renderers/quiz-question.ts`:

```ts
import { escapeHtml } from "../html.js";
import { renderInlineMarkdown, renderMarkdown } from "./markdown.js";
import { renderAnnotatedCode } from "./annotated-code.js";
import { renderDiagramCard } from "../review/sections.js";
import type { DiagramResult } from "../render-diagram.js";
import type { Citation, QuizQuestionBlock } from "../quiz-blocks.js";

export interface QuizQuestionCtx {
  num: string;                          // continuous question number, e.g. "3"
  ids: Set<string>;                     // valid in-page fragment targets (allBlockIds)
  diagrams: Map<string, DiagramResult>;
  onWarn?: (msg: string) => void;
}

const FAMILY_LABEL: Record<QuizQuestionBlock["family"], string> = {
  "system-fit": "system fit",
  rationale: "rationale",
  mechanism: "mechanism",
};

/** Citations are styled text; only a validated in-page fragment becomes a link
 *  (safe-link policy: no relative/file hrefs — see src/html.ts SAFE_HREF). */
function renderCitation(c: Citation, ids: Set<string>): string {
  const label = escapeHtml(c.label);
  if (c.fragment && ids.has(c.fragment))
    return `<a class="quiz-cite" href="#${escapeHtml(c.fragment)}">${label}</a>`;
  return `<span class="quiz-cite">${label}</span>`;
}

export async function renderQuizQuestion(b: QuizQuestionBlock, ctx: QuizQuestionCtx): Promise<string> {
  const prompt = await renderMarkdown(b.question, ctx.onWarn);
  const dr = b.diagram ? ctx.diagrams.get(b.diagram.id) : undefined;
  const diagram = b.diagram && dr ? renderDiagramCard(b.diagram, dr) : "";
  const code = b.code ? await renderAnnotatedCode(b.code, ctx.onWarn) : "";
  const points = b.answer.points?.length
    ? `<ul class="quiz-points">${(await Promise.all(
        b.answer.points.map(async (p) => `<li>${await renderInlineMarkdown(p)}</li>`),
      )).join("")}</ul>`
    : "";
  const citations = b.citations.length
    ? `<div class="quiz-citations"><span class="quiz-cite-label">Grounded in</span>` +
      `${b.citations.map((c) => renderCitation(c, ctx.ids)).join("")}</div>`
    : "";
  return (
    `<article class="quiz-q" id="${escapeHtml(b.id)}">` +
    `<div class="quiz-q-head"><span class="quiz-num" aria-hidden="true">${escapeHtml(ctx.num)}</span>` +
    `<span class="quiz-family is-${escapeHtml(b.family)}">${FAMILY_LABEL[b.family]}</span></div>` +
    `<div class="quiz-prompt">${prompt}</div>` +
    diagram + code +
    `<details class="quiz-reveal"><summary>Reveal answer</summary>` +
    `<div class="quiz-answer"><p class="quiz-takeaway">${await renderInlineMarkdown(b.answer.takeaway)}</p>` +
    `${points}${citations}</div></details></article>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/quiz-question.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderers/quiz-question.ts test/quiz-question.test.ts
git commit -m "feat(quiz): quiz-question renderer — details reveal, family badge, text citations"
```

---

### Task 4: Assembler (`src/assemble-quiz.ts`) + `assets/quiz.css`

**Files:**
- Create: `src/assemble-quiz.ts`
- Create: `assets/quiz.css`
- Test: `test/assemble-quiz.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `renderProse` (`src/renderers/prose.ts`), `renderAll` (`src/render-diagram.ts`), `renderMarkdown`/`renderInlineMarkdown`, `escapeHtml`.
- Produces: `assembleQuiz(blocks: QuizBlock[], opts: QuizOpts): Promise<string>` with `QuizOpts = { title: string; source?: string; intro?: string; outDir?: string; excalidraw?: boolean; onWarn?: (msg: string) => void; generator?: string }` — used by the CLI (Task 5).

- [ ] **Step 1: Write the failing test**

Create `test/assemble-quiz.test.ts` (no diagrams → no d2 binary needed, same trick as `assemble-spec.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { assembleQuiz } from "../src/assemble-quiz.js";
import type { QuizBlock } from "../src/quiz-blocks.js";

const q = (id: string, family: "system-fit" | "rationale" | "mechanism", title?: string): QuizBlock => ({
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/assemble-quiz.test.ts`
Expected: FAIL — cannot resolve `../src/assemble-quiz.js`.

- [ ] **Step 3: Create `assets/quiz.css`**

```css
/* quiz.css — quiz-shell components, layered over review.css tokens (loaded after review.css
   and spec.css; relies on their body/layout/sidebar/tldr styles). */

.quiz-q {
  border: 1px solid var(--border, #d9dee5);
  border-radius: 12px;
  background: var(--card, #fff);
  padding: 20px 22px;
  margin: 16px 0;
}
.quiz-q-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.quiz-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent, #2563eb); color: #fff;
  font-weight: 700; font-size: 13px;
}
.quiz-family {
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border, #d9dee5);
  color: var(--ink-faint, #646b75);
}
.quiz-family.is-system-fit { border-color: #7c3aed; color: #7c3aed; }
.quiz-family.is-rationale  { border-color: #b45309; color: #b45309; }
.quiz-family.is-mechanism  { border-color: #047857; color: #047857; }
.quiz-prompt { font-size: 1.05rem; font-weight: 600; line-height: 1.5; }
.quiz-prompt p { margin: 0 0 8px; }

.quiz-reveal { margin-top: 12px; }
.quiz-reveal > summary {
  cursor: pointer; user-select: none; font-weight: 600; font-size: 0.95rem;
  color: var(--accent, #2563eb); padding: 6px 0; list-style-position: inside;
}
.quiz-answer {
  border-left: 3px solid var(--accent, #2563eb);
  padding: 10px 14px; margin-top: 8px;
  background: var(--wash, #f6f8fa); border-radius: 0 8px 8px 0;
}
.quiz-takeaway { font-weight: 700; margin: 0 0 6px; }
.quiz-points { margin: 6px 0 0 18px; padding: 0; }
.quiz-points li { margin: 4px 0; }

.quiz-citations { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.quiz-cite-label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--ink-faint, #646b75);
}
.quiz-cite {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  padding: 2px 8px; border-radius: 6px;
  border: 1px solid var(--border, #d9dee5); background: var(--card, #fff);
  color: var(--ink, #1f242b); text-decoration: none;
}
a.quiz-cite:hover { border-color: var(--accent, #2563eb); color: var(--accent, #2563eb); }

.quiz-group-desc { color: var(--ink-faint, #646b75); margin: 4px 0 10px; }
.quiz-intro { margin-top: 12px; }

@media (prefers-reduced-motion: reduce) {
  .quiz-reveal, .quiz-reveal * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 4: Write the assembler**

Create `src/assemble-quiz.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html.js";
import { renderInlineMarkdown, renderMarkdown } from "./renderers/markdown.js";
import { renderProse } from "./renderers/prose.js";
import { renderAll, type DiagramResult } from "./render-diagram.js";
import { renderQuizQuestion } from "./renderers/quiz-question.js";
import { lintQuiz } from "./lint-quiz.js";
import {
  allBlockIds, allQuestions, assertUniqueQuizIds, collectQuizDiagrams,
  type QuizBlock, type QuizGroupBlock, type QuizQuestionBlock,
} from "./quiz-blocks.js";
import type { ProseBlock } from "./blocks.js";

export interface QuizOpts {
  title: string;
  source?: string;
  intro?: string;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
  generator?: string;
}

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

function renderTopbar(opts: QuizOpts, qCount: number): string {
  return (
    `<header class="topbar" role="banner">` +
    `<button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation sidebar" aria-expanded="false">` +
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
    `<rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
    `<rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
    `<rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg></button>` +
    `<span class="topbar-title">${escapeHtml(opts.title)}</span>` +
    `<div class="topbar-meta"><span class="chip chip-stat">${qCount} questions</span></div></header>`
  );
}

interface NavEntry { id: string; label: string; num: string; indent: boolean; }

/** One entry per navigable block; question numbering is continuous across groups. */
function navEntries(blocks: QuizBlock[]): NavEntry[] {
  const entries: NavEntry[] = [{ id: "tldr", label: "TL;DR", num: "—", indent: false }];
  let n = 0;
  const qEntry = (q: QuizQuestionBlock, indent: boolean): NavEntry => {
    n++;
    return { id: q.id, label: q.title ?? `Question ${n}`, num: String(n), indent };
  };
  for (const b of blocks) {
    if (b.type === "quiz-question") entries.push(qEntry(b, false));
    else if (b.type === "quiz-group") {
      entries.push({ id: b.id, label: b.title, num: "—", indent: false });
      for (const c of b.blocks) if (c.type === "quiz-question") entries.push(qEntry(c, true));
    } else {
      entries.push({ id: b.id, label: b.title ?? "Notes", num: "—", indent: false });
    }
  }
  return entries;
}

function renderSidebar(blocks: QuizBlock[]): string {
  const outline = navEntries(blocks)
    .map((e) =>
      `<li><a href="#${escapeHtml(e.id)}" class="outline-item" data-target="${escapeHtml(e.id)}"` +
      `${e.indent ? ` style="padding-left:28px;"` : ""}>` +
      `<span class="outline-num" aria-hidden="true">${e.num === "—" ? "&#8212;" : e.num}</span>` +
      `<span>${escapeHtml(e.label)}</span></a></li>`)
    .join("");
  return (
    `<nav class="sidebar" id="sidebar" aria-label="Document navigation">` +
    `<div class="sidebar-section"><span class="sidebar-label">Questions</span>` +
    `<ul class="outline-list" role="list">${outline}</ul></div></nav>`
  );
}

async function renderTldrFold(opts: QuizOpts, qs: QuizQuestionBlock[]): Promise<string> {
  const byFamily = new Map<string, number>();
  for (const q of qs) byFamily.set(q.family, (byFamily.get(q.family) ?? 0) + 1);
  const famLabel: Record<string, string> = { "system-fit": "system fit", rationale: "rationale", mechanism: "mechanism" };
  const mix = [...byFamily.entries()].map(([f, c]) => `${c} ${famLabel[f] ?? f}`).join(" · ");
  const rows: { key: string; value: string }[] = [];
  if (opts.source) rows.push({ key: "Source", value: opts.source });
  rows.push({ key: "Questions", value: `${qs.length} questions${mix ? ` — ${mix}` : ""}` });
  rows.push({ key: "How", value: "Answer each in your head (or aloud) **before** revealing; a hand-wave is a miss." });
  const rowsHtml = (await Promise.all(rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span>` +
    `<span class="tldr-val">${await renderInlineMarkdown(r.value)}</span></div>`))).join("");
  const intro = opts.intro
    ? `<div class="quiz-intro">${await renderMarkdown(opts.intro, opts.onWarn)}</div>` : "";
  return (
    `<section id="tldr" class="section"><div class="tldr-card">` +
    `<div class="tldr-header"><span class="tldr-eyebrow">Quiz</span>` +
    `<h2 class="tldr-heading">Prove you got it — before you act on it</h2></div>` +
    `<div class="tldr-rows">${rowsHtml}</div></div>${intro}</section>`
  );
}

async function renderGroup(
  g: QuizGroupBlock, num: () => string, ids: Set<string>,
  diagrams: Map<string, DiagramResult>, opts: QuizOpts,
): Promise<string> {
  const desc = g.description
    ? `<p class="quiz-group-desc">${await renderInlineMarkdown(g.description)}</p>` : "";
  const children = await Promise.all(g.blocks.map(async (c) =>
    c.type === "quiz-question"
      ? renderQuizQuestion(c, { num: num(), ids, diagrams, onWarn: opts.onWarn })
      : renderProseWithAnchor(c, opts)));
  return (
    `<section id="${escapeHtml(g.id)}" class="section">` +
    `<div class="section-header"><h2 class="section-title">${escapeHtml(g.title)}</h2></div>` +
    `${desc}${children.join("")}</section>`
  );
}

async function renderProseWithAnchor(b: ProseBlock, opts: QuizOpts): Promise<string> {
  return `<div id="${escapeHtml(b.id)}">${await renderProse(b, opts.onWarn)}</div>`;
}

export async function assembleQuiz(blocks: QuizBlock[], opts: QuizOpts): Promise<string> {
  assertUniqueQuizIds(blocks);
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const specCss = await readFile(join(ASSETS, "spec.css"), "utf8");
  const quizCss = await readFile(join(ASSETS, "quiz.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");

  const rendered = await renderAll(collectQuizDiagrams(blocks), {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const diagrams = new Map<string, DiagramResult>();
  for (const r of rendered) diagrams.set(r.id, r);
  if (opts.onWarn) {
    for (const w of lintQuiz(blocks)) opts.onWarn(w);
    const failed = rendered.filter((r) => r.failed).map((r) => r.id);
    if (failed.length) opts.onWarn(`${failed.length} diagram(s) failed to compile: ${failed.join(", ")} — fix their d2 source`);
  }

  const qs = allQuestions(blocks);
  const ids = allBlockIds(blocks);
  let n = 0;
  const num = () => String(++n);

  const parts: string[] = [await renderTldrFold(opts, qs)];
  for (const b of blocks) {
    if (b.type === "quiz-question")
      parts.push(`<section class="section">${await renderQuizQuestion(b, { num: num(), ids, diagrams, onWarn: opts.onWarn })}</section>`);
    else if (b.type === "quiz-group") parts.push(await renderGroup(b, num, ids, diagrams, opts));
    else parts.push(`<section class="section">${await renderProseWithAnchor(b, opts)}</section>`);
  }
  const main = `<main class="main">${parts.join("")}</main>`;

  const zoomOverlay =
    `<div id="zoom-overlay" class="zoom-overlay" aria-hidden="true">` +
    `<div class="zoom-controls">` +
    `<button id="zoom-out" type="button" aria-label="Zoom out">&#8722;</button>` +
    `<button id="zoom-reset" type="button">Reset</button>` +
    `<button id="zoom-in" type="button" aria-label="Zoom in">+</button>` +
    `<button id="zoom-close" type="button" aria-label="Close">&#10006;</button>` +
    `</div><div id="zoom-stage" class="zoom-stage"></div></div>`;

  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}\n${specCss}\n${quizCss}</style></head>` +
    `<body>${renderTopbar(opts, qs.length)}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${renderSidebar(blocks)}${main}</div>${zoomOverlay}` +
    `<script>${viewer}</script></body></html>\n`
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/assemble-quiz.test.ts`
Expected: PASS (5 tests).

Note: one sidebar assertion expects the default label `Question 2` — navEntries and the body renderer number independently but in the same traversal order, so they agree. If this fails, check that both iterate `blocks` in identical order.

- [ ] **Step 6: Commit**

```bash
git add src/assemble-quiz.ts assets/quiz.css test/assemble-quiz.test.ts
git commit -m "feat(quiz): assembleQuiz — quiz shell with own sidebar, TL;DR fold, group rendering"
```

---

### Task 5: CLI (`bin/quiz.ts`) + package script

**Files:**
- Create: `bin/quiz.ts`
- Modify: `package.json` (scripts block, after the `"atlas"` entry)
- Test: `test/quiz-cli.test.ts`

**Interfaces:**
- Consumes: `assembleQuiz`, `QuizOpts` (Task 4); `QuizBlock`, `QuizDoc` (Task 1).
- Produces: `npx tsx bin/quiz.ts --blocks <quiz.json> --out <dir> [--title …] [--excalidraw] [--no-excalidraw]` → writes `<out>/quiz.html` + re-writes `<out>/quiz.json`.

- [ ] **Step 1: Write the failing test**

Create `test/quiz-cli.test.ts`:

```ts
import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = new URL("../bin/quiz.ts", import.meta.url).pathname;

const quizDoc = {
  kind: "quiz",
  title: "Quiz — demo",
  source: "PR #1",
  blocks: [
    { type: "quiz-question", id: "q1", family: "mechanism", question: "Why does A precede B?",
      answer: { takeaway: "**B reads A's output**" }, citations: [{ label: "src/a.ts:1-3" }] },
    { type: "quiz-question", id: "q2", family: "rationale", question: "Why this approach?",
      answer: { takeaway: "**Simplest thing that works**" }, citations: [{ label: "spec §2" }] },
  ],
};

it("resolves relative --blocks/--out against the cwd and writes quiz.html + quiz.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "quiz-cli-"));
  try {
    writeFileSync(join(dir, "quiz.json"), JSON.stringify(quizDoc));
    execFileSync("npx", ["tsx", BIN, "--blocks", "quiz.json", "--out", "."], { encoding: "utf8", cwd: dir });
    expect(existsSync(join(dir, "quiz.html"))).toBe(true);
    const rewritten = JSON.parse(readFileSync(join(dir, "quiz.json"), "utf8"));
    expect(rewritten.blocks.length).toBe(2);
    const html = readFileSync(join(dir, "quiz.html"), "utf8");
    expect(html).toContain('content="visual-skills · quiz"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);

it("exits 2 with usage when --blocks/--out are missing", () => {
  try {
    execFileSync("npx", ["tsx", BIN], { encoding: "utf8", stdio: "pipe" });
    expect.unreachable("should have exited non-zero");
  } catch (e) {
    expect((e as { status?: number }).status).toBe(2);
    expect(String((e as { stderr?: string }).stderr)).toContain("usage: quiz");
  }
}, 30_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/quiz-cli.test.ts`
Expected: FAIL — `bin/quiz.ts` does not exist (execFileSync error).

- [ ] **Step 3: Write the CLI**

Create `bin/quiz.ts`:

```ts
#!/usr/bin/env -S node --import tsx
// quiz CLI — render a quiz.json (QuizDoc: opts + blocks) into a single self-contained HTML page.
//
//   npx tsx bin/quiz.ts --blocks <quiz.json> --out <dir> [--title "…"] [--excalidraw]
// Paths may be relative; they resolve against the current working directory.
//
// Writes <out>/quiz.html and re-writes <out>/quiz.json, so the doc folder stays self-contained
// and re-renders in place. Mirrors `spec --blocks`.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { assembleQuiz, type QuizOpts } from "../src/assemble-quiz.js";
import type { QuizBlock } from "../src/quiz-blocks.js";

interface QuizDocFile extends Partial<QuizOpts> { kind?: string; blocks: QuizBlock[]; }

async function main() {
  const { values } = parseArgs({
    options: {
      blocks: { type: "string" },
      out: { type: "string" },
      title: { type: "string" },
      excalidraw: { type: "boolean" },
      "no-excalidraw": { type: "boolean" },
    },
  });
  if (!values.blocks || !values.out) {
    console.error("usage: quiz --blocks <quiz.json> --out <dir> [--title …] [--excalidraw] [--no-excalidraw]");
    process.exit(2);
  }
  // Relative paths resolve against the cwd — parity with the doc/recap/spec/atlas CLIs.
  const blocksPath = resolve(values.blocks);
  const outDir = resolve(values.out);

  const doc = JSON.parse(await readFile(blocksPath, "utf8")) as QuizDocFile;
  if (!Array.isArray(doc.blocks)) {
    console.error(`${blocksPath}: expected a { "blocks": [...] } object`);
    process.exit(2);
  }

  await mkdir(outDir, { recursive: true });
  const warnings: string[] = [];
  const opts: QuizOpts = {
    title: values.title ?? doc.title ?? "Quiz",
    source: doc.source,
    intro: doc.intro,
    outDir,
    excalidraw: values["no-excalidraw"] ? false : (values.excalidraw ?? doc.excalidraw),
    generator: doc.generator ?? "visual-skills · quiz",
    onWarn: (m) => warnings.push(m),
  };

  const html = await assembleQuiz(doc.blocks, opts);
  const htmlPath = join(outDir, "quiz.html");
  await writeFile(htmlPath, html);
  await writeFile(join(outDir, "quiz.json"), JSON.stringify(doc, null, 2));

  for (const w of warnings) console.warn(`⚠ ${w}`);
  console.log(`wrote ${htmlPath}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Add the package script**

In `package.json`, after `"atlas": "tsx bin/atlas.ts",` add:

```json
    "quiz": "tsx bin/quiz.ts",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/quiz-cli.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add bin/quiz.ts package.json test/quiz-cli.test.ts
git commit -m "feat(quiz): render-only CLI — quiz.json -> quiz.html, cwd-relative path parity"
```

---

### Task 6: `skills/quiz/SKILL.md` + registrations

**Files:**
- Create: `skills/quiz/SKILL.md`
- Modify: `test/skill-docs.test.ts` (add quiz reads + one test case)
- Modify: `scripts/install-skills.ts:14` (SKILLS array)
- Modify: `test/install-skills.test.ts` (both expected-link lists)
- Modify: `README.md` (skills table + skill count)

**Interfaces:**
- Consumes: the CLI contract from Task 5; block model from Task 1.
- Produces: the user-facing skill. The sync test requires SKILL.md to contain the backtick-quoted
  literals `` `quiz-question` `` and `` `quiz-group` `` (the discriminants in `src/quiz-blocks.ts`).

- [ ] **Step 1: Extend the sync test (failing first)**

In `test/skill-docs.test.ts`, after the `const atlasReviewSkill = …` line add:

```ts
const quizBlocks = read("../src/quiz-blocks.ts");
const quizSkill = read("../skills/quiz/SKILL.md");
```

After the `atlasBlockTypes` declaration add:

```ts
// Exclude "diagram"/"annotated-code"/"prose": embedded shared primitives, not QuizBlock members.
const quizBlockTypes = [...new Set([...quizBlocks.matchAll(/\btype:\s*"([^"]+)"/g)].map((m) => m[1]))]
  .filter((t) => t === "quiz-question" || t === "quiz-group");
```

Inside the `describe` block add:

```ts
  it("documents every quiz block type in the quiz skill", () => {
    expect(quizBlockTypes.length).toBeGreaterThanOrEqual(2);
    for (const t of quizBlockTypes) {
      expect(quizSkill, `quiz SKILL.md must document quiz block type \`${t}\``).toContain(`\`${t}\``);
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/skill-docs.test.ts`
Expected: FAIL — `../skills/quiz/SKILL.md` not found.

- [ ] **Step 3: Write the skill**

Create `skills/quiz/SKILL.md`:

````markdown
---
name: quiz
description: Use when the user asks to be quizzed on — or to verify their understanding of — a PR, commit, branch, diff, spec, plan, or a generated visual-skills doc. Generates a comprehension-check HTML quiz grounded in the real source, and optionally grades free-text answers live in the terminal.
---

# Quiz

Turn a change, spec, or generated doc into an on-demand **comprehension check** — a
self-contained HTML quiz page — and optionally grade the user's answers live. The other skills
in this family present understanding; this one verifies it.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/home/srogener/visual-skills

## The standard — what makes a question good

**The dividing line is recall-without-understanding, not depth.** Banned: anything answerable by
ctrl-F or re-reading one line ("which file…", "how many…", "did we test…"). Wanted: questions
that require a mental model. The test:

> If the reader could answer it correctly while still being unable to explain the change to a
> colleague, the question is bad.

Every question belongs to exactly **one family**:

1. **system-fit** — where this sits in the architecture, what it touches, what depends on it.
2. **rationale** — why this approach over the alternative; what tradeoff was accepted.
3. **mechanism** — how the important code actually works: the algorithm, the ordering, the
   invariants. "Walk through what happens when X arrives", "why must A run before B", "what
   breaks if these two steps swap". Attach the real snippet via `code` so the question renders
   beside the code it interrogates.

**Count scales with the material — the floor is fixed, the ceiling moves:**

| Material | Questions | Mix |
|---|---|---|
| One-file fix | 2–3 | mechanism + rationale (skip system-fit if trivial) |
| Medium PR / short spec | 4–6 | all three families |
| Large spec / multi-domain change | 8–12, in `quiz-group` themes | all three families |

**Proportionality is YOUR job, not the linter's** — the renderer can't see the source. If the
source has many sections/diffs/domains and you wrote a handful of questions, the quiz
under-covers the material: go back and add questions.

Every question carries a **model answer** (bold takeaway + bullets) and **≥1 citation**
grounding it in the source.

### Red flags — you stopped too early

- A question a reader could answer by searching the diff text. Delete or deepen it.
- A model answer that restates the question instead of explaining the why/how.
- A citation-free answer, or one grounded in "the PR" instead of a file:lines or doc section.
- 3 questions for a 20-file change. Proportionality is the standard.
- The tool printed warnings — fix `quiz.json` and re-render until the output is clean.

## Workflow

1. **Identify the source** and the output folder (`--out` is a *directory*, absolute path:
   `<target-repo>/.visual/quizzes/<short-label>`).

2. **Ground yourself in the source** (this step is most of the work):
   - **Git target** (PR / commit / branch / working tree): gather raw material with
     `cd "$VISUAL_SKILLS_DIR" && npx tsx bin/recap.ts --repo <ABS_REPO> <target flag> --emit-blocks <ABS_OUT>/raw-blocks.json`,
     then read the changed code. **For `--commit` and `--branch`, the working tree is NOT the
     target snapshot — read files with `git show <headRef>:<path>`, never from the working
     directory.** For `--pr`, the gather runs `gh pr checkout`, which switches the user's
     checkout to the PR branch — tell the user this happened.
   - **Spec / plan markdown**: read the file, then the code it references.
   - **Generated visual-skills doc**: read its JSON sidecar — the narrative the user actually
     read — plus the underlying code:

     | Doc | Sidecar | Shape |
     |---|---|---|
     | recap.html / doc output | `blocks.json` | bare `Block[]` array |
     | spec.html | `spec.json` | `{ blocks: [...] }` envelope |
     | atlas.html | `atlas.json` | envelope |
     | domain-\<slug\>.html | `domain-<slug>.json` | envelope |

     If no sidecar exists, quiz from the HTML itself plus the repo.

3. **Author `quiz.json`** — a `QuizDoc`: `{ "kind": "quiz", "title": "Quiz — <label>",
   "source": "<what was quizzed>", "intro": "<one-paragraph markdown>", "blocks": [...] }`.
   Order questions broad → specific. Group into `quiz-group` themes when there are 7+.

4. **Render and open:**

       npx tsx bin/quiz.ts --blocks <ABS_OUT>/quiz.json --out <ABS_OUT>
       open <ABS_OUT>/quiz.html

5. **Close the warnings.** The renderer lints the blocks (question floor, missing
   answers/citations, trivia patterns, single-family medium quizzes, dangling fragments).
   Edit `quiz.json` and re-render until clean.

6. **Offer live mode:** "Want me to quiz you live instead of (or after) the page?"

## Block catalog

`quiz-question` — the core block:

    { "type": "quiz-question", "id": "q-order", "family": "mechanism",
      "title": "Migration ordering",
      "question": "Why must the schema migration land **before** the router change deploys?",
      "code": { "type": "annotated-code", "id": "q-order-code", "title": "capture()", "lang": "ts",
        "code": "const row = await db.order.update(...)", "annotations": [{ "line": 1, "note": "reads the new column" }] },
      "answer": { "takeaway": "**The router selects the new column** — reversed order 500s on every capture.",
        "points": ["`capture` selects `paidAt`, added by the migration", "deploy order: migration → app"] },
      "citations": [{ "label": "src/router.ts:12-30", "file": "src/router.ts", "lines": "12-30" }] }

- `family`: `"system-fit" | "rationale" | "mechanism"` — exactly one.
- `title`: optional short sidebar label (defaults to "Question N").
- `code` / `diagram`: optional attached `annotated-code` / `diagram` primitives.
- `citations`: **text, not links** — `label` is required; `file`+`lines` for code, or a doc
  section name. `fragment` may name another block id in THIS quiz doc (the only linkable form).

`quiz-group` — a theme wrapper for large quizzes:

    { "type": "quiz-group", "id": "theme-capture", "title": "The capture path",
      "description": "The core mechanism.", "blocks": [ …quiz-question/prose blocks… ] }

`prose` — freeform markdown (context, instructions), same as the other skills.

## Live mode — grading free-text answers

When the user wants to be graded (they say so, or accept the offer), use the authored
`quiz.json` — same questions, same model answers:

- Ask **one question at a time**; the user answers free-text in the terminal.
- Judge each answer against the model answer. **Push back on shallow or wrong answers** with
  one follow-up probe before scoring — never accept vibes:
  - A restatement of the question is not an answer.
  - Require the *why* for rationale questions, the actual *sequence/invariant* for mechanism
    questions — "it handles the ordering" is a miss; "the migration must land first because
    the router selects the new column" is a hit.
- After the last question, give a per-question verdict — **got it / partial / missed** — and
  for each partial/miss, point back to the exact source (file:lines or doc section) to reread.
- Do not lecture between questions; grade at the end.

## Scope

- On-demand only — never auto-generate a quiz as part of another skill's run.
- No scoring persistence or gamification.
- Sources: code changes, specs/plans, and this repo's generated docs — not general documents.
````

- [ ] **Step 4: Run the sync test to verify it passes**

Run: `npx vitest run test/skill-docs.test.ts`
Expected: PASS (all cases, including the new quiz case).

- [ ] **Step 5: Register with the installer (failing test first)**

In `test/install-skills.test.ts`, add to BOTH expected lists:
- In the first test's `toEqual` array, append after the atlas-review line:

```ts
      { source: "/repo/skills/quiz", target: "/home/me/.claude/skills/quiz" },
```

- In the "honors a custom claude root" test's array, append:

```ts
      "/custom/cc/skills/quiz",
```

Run: `npx vitest run test/install-skills.test.ts` — expected: FAIL (5 links, expected 6).

In `scripts/install-skills.ts` change:

```ts
const SKILLS = ["visual-recap", "visual-doc", "visual-spec", "visual-atlas", "atlas-review"];
```

to:

```ts
const SKILLS = ["visual-recap", "visual-doc", "visual-spec", "visual-atlas", "atlas-review", "quiz"];
```

Run: `npx vitest run test/install-skills.test.ts` — expected: PASS.

- [ ] **Step 6: README**

In `README.md`:
- Change `It ships as **five [Claude Code](https://claude.com/claude-code) skills**` to `It ships as **six [Claude Code](https://claude.com/claude-code) skills**`.
- Add a row to the skills table after the visual-doc row:

```markdown
| **quiz** | "quiz me on this PR / spec / doc" | A comprehension check that verifies you understood a change before acting on it |
```

- After the table's closing line, add:

```markdown
The first five skills present understanding; **quiz** is their verification counterpart — it
tests it, with reveal-style questions on the page and optional live grading in the terminal.
```

- [ ] **Step 7: Commit**

```bash
git add skills/quiz/SKILL.md test/skill-docs.test.ts scripts/install-skills.ts test/install-skills.test.ts README.md
git commit -m "feat(quiz): SKILL.md (question standard, grounding, live mode) + registrations"
```

---

### Task 7: Full verification

**Files:** none new.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: clean exit, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all suites pass, including the 6 new/modified test files.

- [ ] **Step 3: End-to-end smoke**

```bash
mkdir -p /tmp/claude-1000/-home-srogener-visual-skills/quiz-smoke && cd /tmp/claude-1000/-home-srogener-visual-skills/quiz-smoke
cat > quiz.json <<'EOF'
{ "kind": "quiz", "title": "Quiz — smoke", "source": "smoke test",
  "blocks": [
    { "type": "quiz-question", "id": "q1", "family": "mechanism",
      "question": "Why must A land before B?",
      "answer": { "takeaway": "**B reads A's output**", "points": ["deploy order matters"] },
      "citations": [{ "label": "src/a.ts:1-3" }] },
    { "type": "quiz-question", "id": "q2", "family": "rationale",
      "question": "Why this approach over the alternative?",
      "answer": { "takeaway": "**Simplest thing that works**" },
      "citations": [{ "label": "spec §2" }] } ] }
EOF
npx tsx /home/srogener/visual-skills/bin/quiz.ts --blocks quiz.json --out .
```

Expected: `wrote …/quiz.html` with no warnings. Open `quiz.html` in a browser: TL;DR fold, two numbered questions with family badges, working `<details>` reveals, citations as text chips.

- [ ] **Step 4: Commit anything outstanding & wrap up**

```bash
cd /home/srogener/visual-skills && git status
```

Expected: clean (all work committed in Tasks 1–6). If the smoke test surfaced fixes, commit them:

```bash
git add -A && git commit -m "fix(quiz): smoke-test fixes"
```

Then use superpowers:finishing-a-development-branch (note: repo works directly on main; follow its existing convention).
