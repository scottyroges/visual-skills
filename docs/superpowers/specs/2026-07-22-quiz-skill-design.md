# Design: `quiz` skill — comprehension check for PRs, specs, and generated docs

**Date:** 2026-07-22
**Status:** Approved design, pre-implementation

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

A well-sized quiz mixes all three:

1. **System fit** — where this change sits in the overall architecture, what it touches, what
   depends on it.
2. **Rationale** — why this approach over the alternative, what tradeoff was accepted, why a
   decision went the way it did.
3. **Mechanism** — how the important code actually works: the algorithm, the ordering, the
   invariants. E.g. "walk through what happens when X arrives", "why must A run before B",
   "what breaks if these two steps run in the other order", "what state makes this branch fire".
   Mechanism questions should quote the real code — the existing `annotated-code` block renders
   the question alongside the actual snippet it interrogates.

### Count scales with the material

No fixed cap — the floor is fixed, the ceiling moves (same philosophy as recap's "Scaling by
size"):

| Material | Questions |
|---|---|
| One-file fix | 2–3 |
| Medium PR / short spec | 4–6 |
| Large spec, multi-domain change | 8–12, grouped by theme in the sidebar |

### Per-question requirements

- A **model answer**: bold takeaway + bullets, the same idiom as recap's diff annotations.
- **At least one grounding link** — to a section of the source doc, or a `file:line` in the repo.
- Grounded the same way recaps are: Claude must read the actual change/spec/code, not just a
  summary of it.

## Inputs

Any of, with no prerequisite step:

- A git target — `--pr <n>`, `--commit <ref>`, `--branch <name>`, or working tree. Raw material
  comes from the existing `bin/recap.ts --emit-blocks` gather; Claude then reads the changed code.
- A spec / plan / design markdown file.
- An **existing generated doc** (recap/spec/atlas/doc HTML). Its sibling `blocks.json` is the
  primary source, since that narrative is what the user actually read.

## Artifact — the HTML half of the hybrid

- **New CLI `bin/quiz.ts`, render-only**: `--blocks <file> --title <t> --out <dir>` → `quiz.html`
  (re-writing `blocks.json` into the folder, same self-contained-folder convention as the other
  CLIs). No gather mode of its own — grounding is Claude's reading job, and git targets are
  covered by recap's gather.
- **New block type `quiz-question`** + renderer:
  - Question text prominent; a "think before revealing" affordance; model answer inside a native
    `<details>` — no-JS, `file://`-safe, per the repo's accessibility principles.
  - Optional attached `annotated-code` / `diagram` content for mechanism questions.
- Reuses the shared app shell: sidebar lists questions (grouped by theme when the quiz is large),
  TL;DR fold states what the quiz covers and how to use it.
- Existing `prose`, `diagram`, `annotated-code`, `group` blocks remain available inside quiz docs.
- **Output convention:** `<target-repo>/.visual/quizzes/<short-label>/quiz.html`, alongside
  `.visual/recaps/`.

### Lint floor (structural only — altitude is enforced by skill text)

Warnings, in the style of the existing lints:

- Fewer than 2 questions.
- **Proportionality**: question count clearly under-covers the material (e.g. many source
  sections/diffs but only a couple of questions).
- A question with no model answer or no grounding link.
- Question text matching trivia patterns (`which file`, `how many`, `what line`, `did we test`…).

## Live mode — the terminal half of the hybrid

Pure SKILL.md instructions; no code. Entered when the user asks ("quiz me live"), or offered after
the HTML render. Uses the **same authored `blocks.json`**:

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

- Vitest coverage matching existing patterns: renderer tests for `quiz-question`, lint tests for
  the floor rules, CLI path-resolution parity with the other CLIs (relative `--blocks`/`--out`
  resolved against cwd — the `ae2475a` convention).
- README: add the `quiz` row to the skills table and the verification-counterpart framing.
- Skill installer picks up the new `skills/quiz/` directory.

## Out of scope

- Automatic quiz generation as part of other skills' runs (explicitly rejected — on-demand only).
- Scoring persistence, streaks, or any gamification.
- General-purpose "quiz me on anything" learning tool — scope is code changes, specs, and this
  repo's generated docs.
