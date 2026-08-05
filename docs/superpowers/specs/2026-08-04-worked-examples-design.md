# Design: worked examples as a first-class block across the visual skills

**Date:** 2026-08-04
**Status:** Approved design, pre-implementation

## Problem

Every visual-skills surface explains mechanisms **abstractly**. Decisions carry a *why*, diagrams
show flow, reference drawers hold type definitions — but no surface ever shows **one concrete
instance going through the mechanism**. A reader is asked to trust that "the roll-call contract
enforces completeness" or "the merge dedups by exact identity" without ever seeing a real input,
the steps applied to it, and the output that falls out.

That gap matters because examples are how a reader *verifies* their understanding instead of
nodding along. A page that says "anchor-quote mismatches are a recall leak" is an argument. A page
that shows the sentence a model quoted, the transcript text it failed to match character-for-
character, and the boundary that silently died is a proof. Algorithms, contracts, validation rules,
merge semantics, and rejected alternatives all land harder with one worked instance.

Three example shapes carry that weight:

1. **Worked example** — one real input walked stage by stage to its output.
2. **Contrast example** — the *same* input under old vs new behavior, side by side. The natural
   form for recaps and for specs that change existing behavior.
3. **Counterexample** — the instance that made a rejected alternative or a validation rule
   necessary. Gives teeth to `rejected:` tags and risk cards.

## Constraints discovered in the codebase

These shaped the design and are worth stating up front, because two of them contradict the
original brief.

- **There is no single shared block union.** `SpecBlock` (`src/spec-blocks.ts`) and `AtlasBlock`
  (`src/atlas-blocks.ts`) are independent unions that only *import* `DiagramBlock`, `DiagramKind`,
  and `TabsBlock` from `src/blocks.ts`. Adding a member to the shared `Block` union trips
  `test/review-block-coverage.test.ts`, which is exhaustive by construction (`Record<Block["type"],
  Block>`) and therefore forces recap and doc renderers in the same change.
- **`TabsBlock` is not a viable base for the contrast layout.** `review.css` has no tab switcher;
  `renderDiagramLike` in `src/review/sections.ts` flattens tabs to stacked cards. Only
  `template.css` (visual-doc) ships a real switcher, and it is a pure-CSS radio pattern
  (`.vs-tabs`) — that pattern, not the block, is the thing worth reusing.
- **The light-mode CSS token vocabularies are nearly disjoint.** spec/recap/atlas load
  `review.css`; visual-doc loads only `template.css`. `theme.css`'s dark block defines a superset
  of both, so only light mode forks:

  | role | `review.css` | `template.css` |
  |---|---|---|
  | surface | `--panel`, `--panel-deep` | `--card` |
  | hairline | `--border` | `--line` |
  | muted ink | `--ink-muted` | `--ctx` |
  | red | `--remove` | `--del` |
  | gold | `--change`, `--change-bg` | `--warn-bg` only |
  | type / radius | `--font-mono`, `--text-xs`, `--radius` | *not defined* |

- **`test/skill-docs.test.ts` mechanically enforces doc sync.** It greps `type: "…"` discriminants
  from each blocks file and asserts each appears backtick-quoted in the matching SKILL.md.

## The block model

Defined in `src/blocks.ts` so every surface can import one definition.

```ts
export type ExampleStageKind = "input" | "step" | "output" | "counter";

export interface ExampleStage {
  label: string;              // "Input — window 2 of burn-unit-wanderer"
  kind?: ExampleStageKind;    // default "step"; drives the tint
  body: string;               // block markdown (fences + tables OK)
  note?: string;              // one-line aside under the card
  side?: "a" | "b";           // contrast only; omit → shared context, full width
  reveal?: boolean;           // mode:"reveal" — this stage starts collapsed
}

export interface ExampleBlock {
  type: "example";
  id: string;
  title: string;                          // "One window through the roll-call"
  badge?: string;
  intro?: string;
  variant?: "walkthrough" | "contrast";   // default "walkthrough"
  mode?: "static" | "reveal" | "step";    // default "static"
  columns?: [string, string];             // contrast headers, default ["Before", "After"]
  source: string;                         // REQUIRED — provenance
  stages: ExampleStage[];
  lesson: string;                         // REQUIRED — what this instance proves
}
```

### Modelling decisions

**Counterexample is a stage kind, not a variant.** Structurally a counterexample is a walkthrough
whose terminal stage is the failure, so `kind: "counter"` takes the red tint and a standalone
counterexample is a two-stage walkthrough. Two variants instead of three, one renderer.

**Contrast reuses the single `stages` array.** Stages with no `side` render full-width as shared
context — typically the one input both columns receive. Stages tagged `a` / `b` fall into the two
columns in document order. No second array and no `TabsBlock` dependency.

**`lesson` is required alongside `source`.** The authoring rule is "if you can't write the one-line
takeaway, the example isn't teaching anything — pick a different instance." A required field
enforces that at authoring time rather than hoping a warning gets read.

**`mode: "reveal"` requires at least one stage flagged `reveal: true`.** The author picks which
stage is hidden — almost always the output — rather than the renderer guessing. Lint catches the
dead case.

**`mode` and `variant` compose partially.** `mode: "step"` applies to `walkthrough` only — stepping
through side-by-side columns defeats the point of a contrast, which is seeing both at once — so a
`contrast` block with `mode: "step"` renders static and lint warns. `mode: "reveal"` works in both:
in a contrast, flagging the "after" column's output stage is a natural predict-then-check.

**Interaction is a response to volume, not a page style.** `mode` defaults to `"static"`. The
escalation trigger is **stage count, not stage fatness**: many small stages justify stepping, while
few fat stages should be trimmed instead. Interaction must never become a license for verbosity —
the "one screenful, trim the input, elide with `…`" rule survives intact, and lint enforces both
directions (see Lint below).

## Rendering

### One renderer, four shells

`src/renderers/example.ts` exports `renderExample(b, opts)` returning inner HTML; each assembler
wraps it in its own section chrome. Spec and atlas already print their own `sectionHeader`, so the
renderer takes `{ ownHeader: boolean }` — `false` for spec/atlas (they supply title and badge),
`true` for doc/recap (it emits its own `vs-ex-head`). Stage bodies go through the existing shared
`renderMarkdown`, so fences and tables behave identically on every surface.

Class namespace is `vs-example` / `vs-ex-*`. `vs-` is visual-doc's existing namespace and collides
with nothing in `review.css`.

Block layout, top to bottom: title and badge (from whichever header owns them) → `intro` →
**`source` as a monospace provenance line directly under the intro, always visible, never
collapsed** → the stage rail or contrast columns → the `lesson` band, a distinct closing caption
styled like `.anatomy-caption` but terminating the block. Provenance sits above the content rather
than as a footnote so a reader knows what they are looking at before they read it.

### One stylesheet

`assets/example.css`, inlined by all four assemblers (one `readFile` each). Given the disjoint
light-mode vocabularies, every value resolves through a local `--ex-*` layer whose fallback chain
covers both vocabularies and then a literal:

```css
.vs-example {
  --ex-line:       var(--border,        var(--line, #d8d4c8));
  --ex-panel:      var(--panel,         var(--card, #ffffff));
  --ex-muted:      var(--ink-muted,     var(--ctx,  #57606a));
  --ex-radius:     var(--radius, 8px);
  --ex-input:      var(--accent,        var(--link, #2563eb));
  --ex-input-bg:   var(--accent-subtle, #eff4ff);
  --ex-out:        var(--change, #b45309);
  --ex-out-bg:     var(--change-bg,     var(--warn-bg, #fffdf3));
  --ex-counter:    var(--remove,        var(--del,     #cf222e));
  --ex-counter-bg: var(--remove-bg,     var(--del-bg,  #ffebe9));
}
```

Stage tints reuse the shared palette by role: input = blue (`actor`), step = neutral, output = gold
(`changed`), counter = red (`removed`). Dark mode needs no special casing because `theme.css`
already defines a superset of both vocabularies.

### The three modes

```
static                    reveal                    step
┌─ INPUT ──────┐          ┌─ INPUT ──────┐          [1][2][3][4][All]
│ …            │          │ …            │           ────
└──────┬───────┘          └──────┬───────┘
       ↓                         ↓                  ┌─ STEP 2 ─────┐
┌─ STEP ───────┐          ┌─ STEP ───────┐          │ …            │
│ …            │          │ …            │          └──────────────┘
└──────┬───────┘          └──────────────┘
       ↓                  ▸ Show what stage 3 emits  Lesson: …
┌─ OUTPUT ─────┐
│ …            │          Lesson: …
└──────────────┘
Lesson: …
```

`reveal` renders as `<details class="vs-ex-reveal"><summary>Show what this stage emits</summary>…`.
`review-viewer.js`'s existing hash-open walker already opens ancestor `<details>` when someone
deep-links to an id, so no new viewer code is needed.

`step` is **pure CSS**, lifted from the `.vs-tabs` radio switcher already in `template.css`. No JS
runs on any surface, so the worst failure mode is a plain stacked rail rather than a dead page:

```html
<div class="vs-example is-step">
  <input class="vs-ex-radio" type="radio" name="ex-rollcall" id="ex-rollcall-1" checked>
  <!-- one per stage, plus a final "All" -->
  <div class="vs-ex-steps"><label for="ex-rollcall-1">1</label><!-- … --><label>All</label></div>
  <div class="vs-ex-rail"><div class="vs-ex-stage" data-kind="input"><!-- … --></div></div>
</div>
```

Radios are natively arrow-key navigable, which makes this pattern better for accessibility than a
JS stepper as well as more robust — but the `.vs-tabs` pattern is copied **selectively**: it sets
`opacity: 0; pointer-events: none` on the radios and styles no focus state, which makes keyboard
position invisible. The stepper instead keeps radios focusable (visually hidden, no
`pointer-events: none`) and joins `review.css`'s existing `:focus-visible` outline convention via
the same written-out `:nth-of-type` pairing used for `:checked` (`.vs-ex-radio:nth-of-type(n):focus-visible
~ .vs-ex-steps label:nth-child(n)` → accent outline). Each label carries an `aria-label` of the
form "Stage 2 of 4: model returns a verdict per sentence" so the accessible name is the stage
label, not the digit.

It inherits the same structural cap as `.vs-tabs`: the `:nth-of-type` selectors must be written
out, so **step mode supports at most 8 stages**. (The existing tabs switcher caps at 6 for the
same reason.) Past the cap the renderer **falls back to the static rail** — all stages visible, no
radios emitted — plus a warning; a soft warning alone would knowingly ship unreachable content.

### Accepted limitations

- **Print and find-in-page, step mode:** solved. `@media print { .vs-ex-stage { display: block
  !important } .vs-ex-steps { display: none } }`, and the "All" label is a one-click escape for
  searching on screen.
- **Print, reveal mode:** not solved. Chrome and Firefox auto-expand `<details>` on find-in-page so
  search works, but a collapsed stage still prints collapsed. Accepted, given reveal is capped at
  roughly one per page by lint and the `lesson` line always renders.
- **Live or editable examples are out of scope** — no JS evaluation, no editable inputs. The
  fabrication risk and the breakage surface both argue against them.

## Inline example affordances

Beyond the dedicated block, one shared `example?: string` field is added to the item types where a
concrete instance most changes understanding, rendered uniformly as a quiet `e.g.` line that sits
dimmer than `.decision-alt`:

```
DecisionItem   { q, a, why?, rejected?, example? }     // spec-blocks.ts
RiskItem       { risk, mitigation, example? }          // spec-blocks.ts
PhaseItem      { tag, title, scope, gate, example? }   // spec-blocks.ts
ScopeBlock.outList[]  { text, defer?, example? }       // spec-blocks.ts
```

Four small schema additions, one `.vs-ex-inline` CSS rule, one catalog convention. This is for
one-liners; anything needing stages graduates to an `example` block. Risk cards and reference
drawers already accept markdown, so they need no schema change — the catalogs simply tell authors
to put a concrete instance in the riskiest drawer.

## Grounding discipline

The visual-skills ethos is "grounded in the real repo, never invented," and examples are the
easiest place to quietly fabricate.

- `source` names where the data came from — a fixture path, a test name, a run artifact, or a doc
  section (e.g. `test/fixtures/segmentation/burn-unit-wanderer.json, msgs 4–7`).
- Authors pull example inputs from **fixtures, tests, committed run artifacts, or the spec's own
  cited data**, in that preference order. A synthetic example is allowed only when nothing real
  exists yet, and must say `source: "synthetic — no fixture exists yet"`.
- Outputs shown must be *derivable* from the mechanism as specced. An example showing behavior the
  spec does not produce is worse than no example. When the mechanism is implemented, prefer running
  it and pasting real output.

**Required fields are a compile-time guarantee only.** A hand-authored `spec.json` is parsed, not
typechecked, so required fields in TypeScript stop programmatic construction but not a missing key
in JSON. The render path therefore guards each required field separately — never throwing (which
kills the whole page mid-iteration; `validateSpecOpts` sets the precedent of warning instead of
crashing), always leaving a **visible** mark in the artifact plus a warning, because an omission
that shows up in the page itself is a stronger honesty guarantee than a console line an author can
scroll past:

- missing/empty `source` → `⚠ no source given` rendered in the provenance slot.
- missing/empty `lesson` → `⚠ no lesson written` rendered in the lesson band.
- missing/empty/non-array `stages` → the block renders its header and provenance plus a visible
  `⚠ no stages` placeholder card; iteration is guarded so a malformed value cannot crash assembly.

Tests cover malformed hand-authored JSON for all three, not just a missing `source`.

## Lint

One shared `src/lint-examples.ts` exporting `lintExamples(examples): string[]`, called from
`lint-spec.ts`, `lint-blocks.ts` (recap + doc), and `lint-atlas.ts` so every surface gets identical
nudges. All are warnings, consistent with the existing "heuristics, not hard errors" tier.

| rule | fires when | message |
|---|---|---|
| missing source | `source` absent or empty | name the fixture, test, or run artifact it came from |
| missing lesson | `lesson` absent or empty | write the one-line takeaway, or pick a different instance |
| under-stepped | `mode: "step"`, fewer than 3 stages | stepping hides content that already fits — use static |
| under-walked | 5+ stages, static | long walkthrough rendered flat — consider `mode: "step"` |
| over cap | `mode: "step"`, more than 8 stages | exceeds the CSS switcher cap — rendered as a static rail; split it |
| fat stage | a `body` over ~1200 chars | trim to the minimum that exercises the mechanism; elide with `…` |
| dead reveal | `mode: "reveal"`, no stage flagged | nothing is hidden |
| reveal spam | more than 1 reveal block on a page | predict-then-check, not a click-fest |
| flat contrast | `variant: "contrast"`, no `side` tags | renders as a plain rail |
| stepped contrast | `variant: "contrast"` with `mode: "step"` | contrast is for seeing both at once — rendered static |
| synthetic | `source` contains "synthetic" | replace with a real fixture once one exists |
| no examples | spec only: 5+ chapters, zero example blocks | algorithm/contract specs land harder with one worked example |

The `no examples` rule lives in `lint-spec.ts` at the same soft tier as the existing
hero/rollout/approve expectations. Recap gets its own nudge in `lint-completeness.ts` (same tier
as its overview/annotation/grouping rules): **3+ non-trivial diffs and zero example blocks** →
"behavior-changing recaps land harder with one contrast example — mine the PR's tests for a
ready-made input/output pair". Doc and atlas get the per-block rules but no zero-examples nudge —
atlas is maintenance-checked by `atlas-review`, and doc inputs are too heterogeneous for a count
heuristic; both rely on the definition-of-done pressure below.

### Making the skills actually reach for it

A capable block that agents rarely author misses the point. Each skill's **definition of done**
and **red flags** sections gain an example expectation, scoped to when one applies (so the
pressure is real but not padding):

- **visual-spec** — already covered: ladder slot, scaling-table row (Medium: usually · Large:
  yes), red flag, lint.
- **visual-recap** — definition of done: "a behavior-changing PR shows one contrast example —
  same input, old vs new output, mined from the PR's tests". Red flag: "the PR changes behavior
  and no example shows a concrete before/after".
- **visual-doc** — definition of done: "any transformation or algorithm the doc explains carries
  one worked example". Red flag: "the doc describes an algorithm in prose only".
- **visual-atlas** — definition of done: "each domain page anchors on one worked trace — a single
  real request/input walked through the domain's stack". Red flag: "a domain page is a module
  list with no trace of anything moving through it".

## Per-surface integration

| surface | code | docs |
|---|---|---|
| **visual-spec** | `SpecBlock` union · `chapterLabel` case · `renderBlock` case (examples are chapters, so they appear in the sidebar and progress rail) | ladder slot after `fits` and before `decisions`; scaling-table row; red-flag entry; definition-of-done bullet; catalog entry in `spec-components.md` |
| **visual-recap + visual-doc** | `Block` union → coverage-test sample forces both renderers · `assemble.ts` case (wrapped in `.vs-block`, incl. inside its `group` case) · `review/sections.ts` case · **`review/walkthrough.ts` `renderChapter`: render `diff` and `example` children in document order** (today it filters groups to diffs only, and `groupLooseDiffs` makes groups the *normal* recap shape — without this, an example placed beside the diff it explains silently disappears) | recap: definition-of-done + red-flag entries (below); gather guidance to mine the PR's *tests* for ready-made input/output pairs → contrast form. doc: a real "when to add an example" subsection — any transformation or algorithm the doc explains — not a one-liner |
| **visual-atlas** | `AtlasBlock` union · `atlasChapterLabel` case · `assemble-atlas` case | `atlas-components.md` entry plus definition-of-done + red-flag entries in the skill |

`skill-docs.test.ts` will force visual-doc to document `example` automatically (the discriminant
literal lives in `blocks.ts`). It will *not* force spec/atlas, because those unions import the type
rather than redeclaring the literal — the same reason `quiz-blocks.ts` is exempted. An explicit
assertion that all four skills document `example` closes that gap deliberately rather than leaving
it to accident.

## Authoring guidance (baked into the catalogs)

- **One example, the trickiest path.** A single instance exercising the subtle case — the overlap
  window, the borderline confidence, the duplicate sentence — beats three happy-path ones.
- **One screenful.** Trim the input to the minimum that still exercises the mechanism; elide with
  `…` and say so.
- **Real identifiers.** Quote actual fixture names, field names, and values — the same rule
  diagrams already follow.
- **End with the lesson.** It is a required field for a reason.
- **Counterexamples are load-bearing, not decoration.** Attach them to a rejected decision or a
  validation rule; never add a "gotcha" example that no design element needs.
- **Interaction follows stage count, not stage size.** Reach for `step` when an example has many
  small stages. When stages are fat, trim them — do not hide them.

## Example builds

- `example/spec-season-planner` — one static worked example, plus one inline `e.g.` on a decision,
  so the canonical "what good looks like" build demonstrates both affordances.
- One of `example/pr-190-season-stats` / `example/pr-194-estimated-purse` — one contrast example
  mined from the PR's tests, placed **inside a group** beside the diff it explains, so the
  canonical recap build exercises the nested-walkthrough path.
- `example/atlas-ppgl` — one domain trace ("one request walked through this stack").

All re-rendered and lint-clean. There is no visual-doc build under `example/`, so visual-doc ships
the renderer plus its skill line only.

## Testing

- `test/example-block.test.ts` — tints per stage kind; contrast columns plus shared full-width
  context; radio count, focus/aria attributes, and the 8-stage cap's static fallback; reveal
  `<details>`; markdown in bodies; HTML escaping in labels and the lesson band; the visible
  markers for missing `source`, missing `lesson`, and missing/empty/malformed `stages`.
- `test/lint-examples.test.ts` — every rule fires on a violating block and clears when fixed.
- `test/review-block-coverage.test.ts` — an `example` sample (compile-forced by the union).
- `test/review-walkthrough.test.ts` — an `example` nested inside a `group` renders in the chapter,
  in document order beside its diff (the path `groupLooseDiffs` makes the recap norm).
- `test/assemble-spec.test.ts` / `test/assemble-atlas.test.ts` — the block reaches the sidebar
  outline and progress rail as a chapter.
- `test/skill-docs.test.ts` — the explicit four-skill assertion described above.

## Delivery

Landing as **one PR across all four surfaces**, staged as reviewable commits on the branch:
foundation (type, renderer, CSS, lint), then per-surface wiring, then docs, then example builds.
This is a deliberate exception to the standing small-PR rule, chosen so no window exists where one
surface has examples and another does not.

## Out of scope

- Interactive or executable examples beyond `reveal` and `step` — no JS evaluation, no editable
  inputs.
- Auto-generation of examples from code. Authors write them, grounded by the `source` discipline.
  Recap may later mine tests mechanically; not in this pass.
- Quiz integration. Worked examples are ideal question seeds ("given this input, what does stage 3
  emit?") and quiz gather could prefer `example` blocks as source material, but no quiz generation
  changes ship here.
