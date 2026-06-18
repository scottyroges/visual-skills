# Diagram Catalog Expansion — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming)

## Goal

Expand the diagram vocabulary available to the `visual-plan` and `visual-recap` skills
from today's narrow guidance (sequence + state machine only) to a curated catalog covering
the full taxonomy — structure, behavior, boundaries, data flow, operations, C4, and journey
shapes — backed by valid, tested d2/mermaid recipes. Add a CSS-only multi-view container so a
document can present 2–3 complementary diagrams as switchable tabs, and widen Excalidraw
editability to every kind the converter natively supports.

## Background

The renderer is already kind-agnostic for *drawing*: every `DiagramBlock` compiles through
the same `d2 --sketch` path (`src/render-diagram.ts:renderViaD2`). The `kind` field is used
in exactly two places — the Excalidraw editability gate (`EXCALIDRAW_EDITABLE`) and as a
carried label that is **not** shown to the reader (the block `title` carries meaning). So the
diagram taxonomy is ~95% *agent knowledge* (when to pick each type + a valid recipe) and ~5%
typing/UI plumbing. This design reflects that split: most of the work is a shared reference
doc; the only code changes are the editable-set bump and one new block type.

## Decisions (locked during brainstorming)

1. **Scope: curated set.** Cover the distinct, high-value types well; fold near-duplicates
   (ETL → data-flow variant, decision-tree → state-machine variant, C4-code → skipped) into
   "variant of…" notes rather than separate entries.
2. **Catalog home: one shared reference doc**, read via the absolute `$VISUAL_SKILLS_DIR`
   constant the skills already define (NOT a relative sibling path — the install symlinks
   only link the per-skill dirs, so a sibling `../shared/...` would not resolve at runtime).
3. **`DiagramKind` stays at the existing 5** (`flowchart | architecture | sequence | erd |
   class`). New types map onto an existing kind via the catalog; no union growth, no
   coverage-test churn.
4. **Recipes are tested.** A standing test extracts every fenced `d2` (and `mermaid`) block
   from the catalog and compiles it, asserting it renders (`<svg` present, "failed to render"
   absent) — the existing verification idiom.
5. **Multiple diagrams are allowed**, organized by a new CSS-only `tabs` block. visual-recap
   drops its "pick exactly ONE" rule.
6. **Excalidraw editability widens** to every natively-supported converter type.

## Component 1 — Shared diagram catalog

**File:** `skills/shared/diagrams.md` (in the repo; read by both skills via
`$VISUAL_SKILLS_DIR/skills/shared/diagrams.md`).

Two parts:

### 1a. Selection guide

Organized by the six lenses plus the C4 zoom ladder. Each entry is a one-line "reach for this
when…" plus the tie-breakers that actually decide between near-neighbors:

- **Structure** — module/dependency graph (cross-ref: this is the existing `where-it-fits`
  producer, `src/dep-graph.ts`); deployment/infra.
- **Behavior** — sequence; state machine.
- **Boundaries** — bounded-context map (DDD); API surface (cross-ref: existing
  `src/api-diagram.ts` producer); module-boundary.
- **Data flow** — data-flow (sources → transforms → sinks; ETL/pipeline is a *variant* note);
  event/pub-sub topology.
- **Operations** — CI/build pipeline (commit → deploy); blast-radius / failure-mode.
- **C4 ladder** — context; container; component. *Code* level: skipped (use the existing
  `class` kind directly if ever needed). *Deployment* / *Dynamic*: cross-ref to Deployment /
  Sequence rather than separate entries.
- **Journey** — decomposition (happy path + one diagram per major edge case — the most-used);
  swimlane/activity (lanes by actor); state machine (cross-ref). *Decision tree* is a
  state-machine *variant* note.

Tie-breakers explicitly stated, e.g.: *branching driven by handoffs → swimlane; branching by
bounded state → state machine; genuinely tree-shaped with no rejoin → decision tree.*

### 1b. Catalog entries

For each type in the curated set, a compact entry with:

- **When to use** / **When NOT to** (the anti-pattern).
- **kind:** the existing `DiagramKind` to stamp.
- **editable:** yes/no — whether to author a mermaid alongside the d2 (see Component 2).
- **Recipe:** a valid d2 block, plus a mermaid block when `editable: yes`.

Kind mapping for the curated set:

| Catalog type | `kind` | editable |
|---|---|---|
| module/dependency graph, deployment, C4 (context/container/component), bounded-context map, module-boundary, data-flow, event/pub-sub, blast-radius, **state machine** | `architecture` | yes (mermaid `graph`/`flowchart`) |
| CI/build pipeline, decomposition, swimlane/activity | `flowchart` | yes (mermaid `graph`/`flowchart`) |
| sequence | `sequence` | yes (mermaid `sequenceDiagram`) |
| API surface (existing producer) | `architecture` | yes |
| schema/ERD (existing producer) | `erd` | no (ER → image fallback) |

**Editable-mermaid constraint.** Only `flowchart`/`graph`, `sequenceDiagram`, and
`classDiagram` mermaid headers convert to *editable* Excalidraw elements; `stateDiagram` and
`erDiagram` rasterize. So for any `editable: yes` entry the mermaid must use a supported
header. In particular, a **state machine** is authored as a mermaid `flowchart`/`graph`
(states as nodes, transitions as labeled edges) — matching its plain-graph d2 floor — **not**
as `stateDiagram` (which would silently fall back to a non-editable image).

### Explicitly out of scope

Journey map (UX phases/emotions), BPMN gateways, and event storming — stakeholder/discovery
formats, not engineering deliverables. The catalog names them as out-of-scope so the agent
does not attempt them.

## Component 2 — Excalidraw editability

`@excalidraw/mermaid-to-excalidraw` natively converts **flowchart, sequence, and class**
to editable elements; all other mermaid types fall back to a non-editable embedded *image*
(confirmed: https://deepwiki.com/excalidraw/mermaid-to-excalidraw/2.2-supported-diagram-types).

Change `EXCALIDRAW_EDITABLE` in `src/render-diagram.ts:57` from
`["flowchart", "architecture"]` to `["flowchart", "architecture", "sequence", "class"]`.

- `architecture` and `flowchart` were already in the set; our recipes author them as mermaid
  `graph`/`flowchart`, which the converter supports.
- `sequence` is newly editable — recipes must include a mermaid `sequenceDiagram` for the
  upgrade to fire (the converter reads mermaid; d2 remains the static floor).
- `class` is included for completeness (rarely authored today).
- `erd` stays out (ER → image fallback, not worth the heavy bundle).

Update the stale comment at `src/render-diagram.ts:13-15` and `blocks.ts:9`, both of which
currently claim sequence diagrams get rasterized — no longer true.

**Verification note:** the editable path requires the opt-in toolchain
(`npm run setup:excalidraw`), so confirming a sequence diagram converts to *editable elements*
(not a single rasterized image) is a manual check during implementation, not part of the
always-on test suite. The always-on catalog test (Component 4) only exercises the d2/mermaid
*compile* floor.

## Component 3 — Multi-view `tabs` block

A new block type lets a document present complementary diagrams as switchable views, honoring
the project's no-view-time-JS rule via a pure-CSS tab switcher.

### Type (`src/blocks.ts`)

```ts
export interface TabsBlock {
  type: "tabs";
  id: string;
  title?: string;
  tabs: { label: string; block: Block }[];  // one level deep; block must not be tabs/group
}
```

Add `| TabsBlock` to the `Block` union. `isDiagramBlock` is unchanged (a `tabs` block is not
itself a diagram; its children are collected recursively).

### Renderer (`src/assemble.ts`)

- `assertUniqueIds` recurses into `tabs` (each `tab.block`), same as it does for `group`.
- `collectDiagrams` recurses into `tabs` so nested diagrams are rendered in the up-front
  `renderAll` pass and get per-diagram Excalidraw sidecars.
- `renderBlock` gains a `case "tabs"`:
  - Guard: each `tab.block` must not be `type: "group"` or `type: "tabs"` (one level deep);
    throw a clear error otherwise (mirrors the existing group-nesting guard).
  - Emit hidden radio inputs (`name="vs-tabs-<id>"`, the first `checked`), a label per tab,
    and a panel per tab containing the child rendered via `renderBlock`.
  - The container is `<section class="vs-block vs-tabs">…` so `withAnchor` stamps its id; each
    child still gets its own anchor through `renderBlock`/`withAnchor`.

### CSS (`assets/template.css`)

`.vs-tabs` styles: radios visually hidden, labels as tab chrome, and
`#<id>:checked ~ .vs-tabpanels > .vs-tabpanel:nth-child(n)` reveals the matching panel — zero
JS. A `@media print { .vs-tabpanel { display: block } }` rule reveals all panels so PDF/print
export is not lossy.

**Known limitation (documented, not fixed):** an in-page `#cross-link` that targets a block
inside an inactive tab will jump to it but the tab won't auto-activate (no JS). The skill
guidance will steer authors to keep cross-link *targets* out of tabs where it matters.

## Component 4 — Tests

- **`test/diagram-catalog.test.ts` (new):** read `skills/shared/diagrams.md` and extract every
  fenced ` ```d2 ` block. Compile each through the real renderer path (`renderViaD2`) and
  assert `<svg` present and "failed to render" absent — this is the always-on rot detector.
  Mermaid blocks cannot be compiled in-test (no browser/mermaid lib), so the test instead
  structurally lints each ` ```mermaid ` block: non-empty and beginning with a recognized
  header (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`). The lint also enforces the
  editable-mermaid constraint: a mermaid block must NOT begin with `stateDiagram` or
  `erDiagram` (those rasterize — author states as a `flowchart`/`graph` instead). Each catalog
  entry marked `editable: yes` must pair its d2 with exactly one mermaid block; the test
  asserts that pairing so editable entries can't silently lose their mermaid.
- **`test/render-diagram` (extend):** assert `EXCALIDRAW_EDITABLE` contains `sequence` and
  `class`; an eligible `sequence` block with mermaid routes to the excalidraw path (via the
  injectable `RenderDeps` seam, no real browser).
- **`test/assemble` (extend):** a `tabs` block renders multiple panels with exactly one
  visible by default; `assertUniqueIds` throws on a duplicate id nested inside a tab;
  `collectDiagrams` finds a diagram nested in a tab; nesting a `group`/`tabs` inside a tab
  throws.
- **`test/skill-docs.test.ts` (extend):** add `tabs` to the block-coverage guard (must appear
  backtick-quoted in visual-plan); assert both SKILLs reference the catalog path; replace the
  stale visual-recap "not yet in scope" / "pick ONE" assertions with the new guidance markers.

## Component 5 — Skill wiring

- **`skills/visual-recap/SKILL.md`:** replace the "Which behavioral diagram to pick" section
  and the "not yet in scope" paragraph with: "consult the catalog
  (`$VISUAL_SKILLS_DIR/skills/shared/diagrams.md`) for diagram selection." New multi-diagram
  rule: prefer one strong diagram, but when 2–3 lenses each add distinct value, wrap them in a
  `tabs` block. Add a `tabs` authoring snippet.
- **`skills/visual-plan/SKILL.md`:** add a pointer to the catalog for structural / boundary /
  data-flow diagrams, and a `tabs` bullet in the content→block mapping.
- **`README.md`:** Scope line gains the catalog + `tabs` + widened Excalidraw note.

## Out of scope (this spec)

- No new `DiagramKind` literals.
- No renderer change beyond the `tabs` block and the editable-set constant.
- Journey map / BPMN / event storming diagram types.
- Auto-activating a tab when an in-page cross-link targets a block inside it (needs JS).

## Implementation sequencing (small commits)

1. Catalog doc + `diagram-catalog.test.ts`.
2. Excalidraw editable-set bump + comment fixes + render-diagram test.
3. `TabsBlock` type + assemble renderer/recursion + CSS + assemble tests.
4. Skill wiring + skill-docs test + README.
