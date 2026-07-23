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
