# Design: `quiz` skill — comprehension check for PRs, specs, and generated docs

**Date:** 2026-07-22
**Status:** Approved design, pre-implementation (revised after spec review)

## Problem

The existing skills (visual-recap, visual-spec, visual-doc, visual-atlas) all serve the repo's
success metric — *"a reviewer understands what changed, why, and where the risk is"* — by
**presentation**: making the material easier to absorb. But easier-to-read doesn't prove absorbed.
A reader may skim sections, get distracted, or vibes-approve. The `quiz` skill serves the same
metric by **verification**: an on-demand comprehension check that makes the reader pause and prove
to themselves they got the full context before they act on it (merge, approve, sign off).

## Positioning & name

- A sixth skill: `skills/quiz/SKILL.md`, skill name **`quiz`**. No `visual-` prefix — it is a
  verification tool, not a reading surface.
- Trigger phrasing: "quiz me on this PR / spec / recap / branch / doc."
- README positions it as the verification counterpart to the presentation skills.
- **On-demand only.** It never runs automatically and existing skills' outputs are unchanged. The
  user opts into the pause when stakes warrant it.

## The question standard (the heart of the skill)

This is the SKILL.md's equivalent of recap's "definition of done."

### The dividing line

The ban is **recall-without-understanding, not depth**. Nothing answerable by ctrl-F or re-reading
a single line ("which file…", "how many…", "did we test…"). Deep code questions are explicitly
wanted. The stated test:

> If the reader could answer the question correctly while still being unable to explain the change
> to a colleague, the question is bad.

### Three question families

1. **System fit** — where this change sits in the overall architecture, what it touches, what
   depends on it.
2. **Rationale** — why this approach over the alternative, what tradeoff was accepted, why a
   decision went the way it did.
3. **Mechanism** — how the important code actually works: the algorithm, the ordering, the
   invariants. E.g. "walk through what happens when X arrives", "why must A run before B",
   "what breaks if these two steps run in the other order", "what state makes this branch fire".
   Mechanism questions should quote the real code — an attached `annotated-code` block renders
   the question alongside the actual snippet it interrogates.

A medium-or-larger quiz mixes all three families. **Small quizzes (2–3 questions) are exempt from
the mix**: prioritize mechanism and rationale, and skip system fit when the change is small enough
that its place in the system is self-evident. A question may not carry multiple family tags — pick
the family the question primarily tests.

### Count scales with the material

No fixed cap — the floor is fixed, the ceiling moves (same philosophy as recap's "Scaling by
size"):

| Material | Questions |
|---|---|
| One-file fix | 2–3 |
| Medium PR / short spec | 4–6 |
| Large spec, multi-domain change | 8–12, grouped by theme in the sidebar |

**Proportionality is an authoring rule enforced by the SKILL.md, not a renderer lint** (the
render-only CLI has no source inventory to judge coverage against). The SKILL.md red-flags section
states it: if the source has many sections/diffs/domains and the quiz has a handful of questions,
the quiz under-covers the material — go back and add questions.

### Per-question requirements

- A **model answer**: bold takeaway + bullets, the same idiom as recap's diff annotations.
- **At least one grounding citation** (see "Citations" under the document model below).
- Grounded the same way recaps are: Claude must read the actual change/spec/code, not just a
  summary of it.

## Document model

Defined in a new `src/quiz-blocks.ts` with its **own `QuizBlock` union**, like spec and atlas —
NOT added to the global `Block` union in `src/blocks.ts` (which would drag `quiz-question` into
visual-doc's documented surface via the skill-docs sync test).

```ts
/** Envelope — the file Claude authors (quiz.json). */
export interface QuizDoc {
  kind: "quiz";
  title: string;               // "Quiz — <human label>"
  source: string;              // human-readable description of what was quizzed (PR #, spec path, doc path)
  intro?: string;              // markdown: what this quiz covers, how to use it (feeds the TL;DR fold)
  generator?: string;          // default "visual-skills · quiz"
  blocks: QuizBlock[];
}

export type QuizBlock = QuizQuestionBlock | QuizGroupBlock | ProseBlock;

/** Optional theming for large quizzes; children are questions (and optional prose). */
export interface QuizGroupBlock {
  type: "quiz-group";
  id: string;
  title: string;               // theme, e.g. "The migration path"
  description?: string;        // markdown
  blocks: (QuizQuestionBlock | ProseBlock)[];
}

export interface QuizQuestionBlock {
  type: "quiz-question";
  id: string;
  family: "system-fit" | "rationale" | "mechanism";  // exactly one
  question: string;            // markdown; the prompt shown before the reveal
  code?: AnnotatedCodeBlock;   // reused primitive: real snippet the question interrogates
  diagram?: DiagramBlock;      // reused primitive: rendered above the question when present
  answer: {
    takeaway: string;          // bold one-line model answer
    points?: string[];         // markdown bullets expanding it
  };
  citations: Citation[];       // ≥1 — where the answer is grounded
}

/** Structured citation — rendered as styled text, NEVER as an href (safe-link policy:
 *  only #fragment and http(s) are linkable; relative/file links are stripped). */
export interface Citation {
  label: string;               // e.g. "src/git.ts:41–52" or "Recap §3 — The migration path"
  file?: string;               // repo-relative path, when citing code
  lines?: string;              // e.g. "41-52"
  fragment?: string;           // in-page anchor within THIS quiz doc only (e.g. a prose block id) —
                               // the only linkable form; validated against block ids at render time
}
```

`ProseBlock`, `AnnotatedCodeBlock`, and `DiagramBlock` are the existing primitives, reused by
composition (the way atlas embeds `DiagramBlock`), so the quiz union stays separate while sharing
renderers.

## Inputs

Any of, with no prerequisite step:

- **A git target** — `--pr <n>`, `--commit <ref>`, `--branch <name>`, or working tree. Raw
  material comes from the existing `bin/recap.ts --emit-blocks` gather. **Grounding rule:** for
  commit/branch targets the working directory is NOT the target snapshot — the SKILL.md requires
  reading changed files at `scope.headRef` via the existing `fileAtRef` mechanism (`src/git.ts:71`),
  never from the working tree. For PR targets, recap's gather runs `gh pr checkout`, which mutates
  the user's checkout — the SKILL.md documents this side effect (inherited recap behavior) and
  tells Claude to mention it to the user.
- **A spec / plan / design markdown file** — read directly.
- **An existing generated doc.** Sidecar discovery per artifact type — the sidecar is the primary
  source since that narrative is what the user actually read:

  | Doc | Sidecar | Shape |
  |---|---|---|
  | recap.html | `blocks.json` | `Block[]` |
  | doc output | `blocks.json` | `Block[]` |
  | spec.html | `spec.json` | `SpecDoc` (`{ blocks: [...] }` envelope) |
  | atlas.html | `atlas.json` | `AtlasDoc` envelope |
  | domain-\<slug\>.html | `domain-<slug>.json` | `DomainDoc` envelope |

  Claude reads the sidecar (normalizing envelope vs. bare array) plus the underlying repo code it
  references. **If no sidecar exists** next to the HTML, fall back to reading the HTML itself and
  the repo — the quiz is still grounded, just without the structured narrative.

## Artifact — the HTML half of the hybrid

- **New CLI `bin/quiz.ts`, render-only**: `--blocks <quiz.json> --out <dir>` (`--title` optional
  override) → `quiz.html`, re-writing `quiz.json` into the folder — the same self-contained-folder
  convention and cwd-relative path resolution as the other CLIs. No gather mode of its own.
- **New assembler `src/assemble-quiz.ts` (`assembleQuiz`)** — the review shell cannot be reused
  as-is: its walkthrough renders only `diff` children inside groups (`src/review/walkthrough.ts`)
  and its sidebar lists only groups/diffs (`src/review/sidebar.ts`); the generic assembler has no
  sidebar or TL;DR fold. `assembleQuiz` reuses the shared page chrome (styles, topbar, scrollspy
  script, diagram pipeline, markdown renderer) but owns:
  - a **sidebar** listing questions (numbered; nested under theme groups when present),
  - a **TL;DR fold** built from `QuizDoc.intro` + `source` + question count by family,
  - **group rendering** that renders quiz-question and prose children (not diff-filtered).
- **`quiz-question` renderer** (`src/renderers/quiz-question.ts`): question text prominent, family
  badge, optional attached code/diagram, then the model answer inside a native `<details>`
  ("Reveal answer") — no-JS, `file://`-safe, per the repo's accessibility principles. Citations
  render as styled text beneath the answer; a citation with a `fragment` renders as an in-page
  link only after validating the target block id exists.
- **Output convention:** `<target-repo>/.visual/quizzes/<short-label>/quiz.html`, alongside
  `.visual/recaps/`.

### Lint floor (structural only — altitude and proportionality are SKILL.md rules)

Warnings, in the style of the existing lints (`src/lint-*.ts` → new `src/lint-quiz.ts`):

- Fewer than 2 questions.
- A question with no `answer.takeaway` or empty `citations`.
- Question text matching trivia patterns (`which file`, `how many`, `what line`, `did we test`…).
- A `citation.fragment` that doesn't resolve to a block id in the doc.
- A medium+ quiz (≥4 questions) with all questions from a single family.

## Live mode — the terminal half of the hybrid

Pure SKILL.md instructions; no code. Entered when the user asks ("quiz me live"), or offered after
the HTML render. Uses the **same authored `quiz.json`**:

- One question at a time, free-text answers in the terminal.
- Claude evaluates each answer against the model answer and **pushes back on shallow or wrong
  answers** with a follow-up probe rather than accepting vibes. Rubric stated in SKILL.md: don't
  accept a restatement of the question; require the *why*; for mechanism questions require the
  actual sequence/invariant, not a gesture at it.
- Ends with a short per-question verdict (got it / partial / missed) and pointers back into the
  source for anything missed.

Mechanism questions are where live mode beats the reveal button by the widest margin ("walk me
through the algorithm"), which is part of why they're a first-class family.

## Testing & integration

- Vitest coverage matching existing patterns: renderer tests for `quiz-question` (reveal markup,
  citation rendering, fragment validation), lint tests for the floor rules, assembler test
  (sidebar/TL;DR/group rendering), CLI path-resolution parity with the other CLIs.
- **Skill-docs sync test**: extend `test/skill-docs.test.ts` with a quiz case scraping
  `src/quiz-blocks.ts` discriminants, requiring `skills/quiz/SKILL.md` to document each — same
  pattern as spec/atlas.
- **Registrations (all manual, none automatic):**
  - `scripts/install-skills.ts`: add `"quiz"` to the hard-coded `SKILLS` array.
  - `package.json`: add `"quiz": "tsx bin/quiz.ts"` to scripts.
  - README: add the `quiz` row to the skills table and the verification-counterpart framing.

## Out of scope

- Automatic quiz generation as part of other skills' runs (explicitly rejected — on-demand only).
- Scoring persistence, streaks, or any gamification.
- General-purpose "quiz me on anything" learning tool — scope is code changes, specs, and this
  repo's generated docs.
- Source-unit coverage bookkeeping in the doc model (proportionality stays an authoring rule).
