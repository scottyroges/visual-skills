# Visual Plan & Recap — Engineering Spec

> Working name. Two Claude Code skills that turn a written spec into a reviewable
> visual **plan**, and a branch/PR/commit into a visual **recap** — as
> self-contained, hand-drawn-styled HTML, grounded in the real repo, with **no
> hosted service or external connector** in the loop.

---

## 1. Summary

Build two user-level Claude Code skills:

- **`visual-plan`** — takes an existing spec (a markdown file or pasted text),
  grounds it in the real repository, and produces a single self-contained HTML
  document of typed visual blocks (diagrams, schema, API, file map, annotated
  code, open questions). The document is the approval gate before code is
  written.
- **`visual-recap`** — takes a branch, PR, commit, or working diff and produces
  the same kind of document in reverse: a high-altitude view of what changed
  (schema diff, API diff, file map, annotated diff, architecture deltas) so a
  reviewer sees the *shape* of the change before reading raw lines.

Both render through a shared block model and a shared dual diagram renderer:
**D2 sketch mode as the dependable floor, `mermaid-to-excalidraw` as an editable
upgrade for flowchart-class diagrams.** Output is a static file the user owns —
committable or git-ignored — with optional `.excalidraw` sidecars for diagrams
the user may want to hand-edit.

This is a deliberate, self-hosted reimplementation of the useful ideas in
BuilderIO's `visual-plan`/`visual-recap` skills, minus their hosted Plan MCP
connector, database, and collaboration layer.

---

## 2. Goals

1. **Own the whole pipeline.** No hosted service, no MCP connector, no account,
   no third-party database. Every artifact is a local file.
2. **Hand-drawn aesthetic by default.** Diagrams render in a sketch style (the
   look of Excalidraw / D2 `--sketch`), not Mermaid's default chrome.
3. **Editable where it helps.** Flowchart-class diagrams also emit an
   `.excalidraw` scene the user can reopen and drag around.
4. **Grounded, not invented.** Plans and recaps name real files, symbols,
   schema, and routes from the actual repo — never placeholder architecture.
5. **Self-contained output.** A single HTML file that opens in any browser with
   no build step and no network dependency at view time.
6. **Composable with the existing toolkit.** Fits the user's current Claude Code
   command/skill framework (e.g. alongside `/plan-create`, `/plan-review`) and
   single-session workflow.

---

## 3. Non-goals (explicitly out of scope for v1)

- No hosted/shared review surface, comments, or multi-user collaboration.
- No in-document live editing, wireframe canvas, or clickable UI prototypes.
  (This codebase is backend-first; product wireframes are not the use case.)
- No automatic PR posting in v1 (a `gh pr comment` integration is a later
  milestone, not part of v1).
- No attempt to match BuilderIO's full block catalog or fidelity. We implement a
  small, backend-relevant subset.
- No Mermaid→D2 transpilation. Where both dialects are needed, the agent authors
  both (see §6.1).

---

## 4. Context & prior art

BuilderIO's `visual-plan`/`visual-recap` skills (repo: `BuilderIO/skills`) carry
a genuinely good planning rubric and block taxonomy, but the rendered artifact is
produced by a hosted app reached over the **Agent-Native Plan MCP connector**
(`plan.agent-native.com`): plan content is written to their database and rendered
by their React app. That couples the workflow to a third-party service and sends
repo structure off-machine. We keep the rubric and the block idea; we replace the
renderer with a local, static one.

Diagram aesthetic: Mermaid is code-driven but visually weak and secretly needs
headless Chromium to render. **D2** is code-driven, renders straight to SVG from
a single binary, has real layout engines, and ships a `--sketch` mode (hand-drawn
via rough.js) that covers flowcharts, sequence diagrams, and ERDs.
**`@excalidraw/mermaid-to-excalidraw`** converts Mermaid into real, editable
Excalidraw elements — but only flowchart-class diagrams convert natively; other
types silently rasterize. Hence the routing in §6.2.

---

## 5. Design principles

Carried over from the good parts of the prior-art rubric; these are instructions
to the agent, enforced by the skill text.

- **Research before drafting.** Inspect real files, schema, routers, and symbols
  first. Name actual files and data shapes; check existing code before proposing
  new endpoints.
- **Lead with reuse.** For each step, state what it reuses (existing actions,
  schema, components) before what it adds, so the plan describes the genuine
  delta.
- **Decide hard-to-reverse bets first.** Call out wire format, public IDs,
  data-model shape, auth/ownership boundaries — get those right in the plan even
  if most of the feature ships later.
- **Commit to one option.** Present a chosen approach, not a menu. Unresolved
  decisions go in a single Open Questions block with a recommended default.
- **Plan is the approval gate.** `visual-plan` is read-only; no source edits
  until the user approves. Surfacing the plan and asking for sign-off *is* the
  approval step.
- **Recap is post-hoc and read-only.** `visual-recap` summarizes work that
  exists; it never edits.
- **Gate thoughtfully.** Skip both skills for trivial, single-file, obvious
  changes — they're review overhead. Never pad with filler or ship a single-step
  plan.
- **Self-review pass (high-stakes only).** For architecture/data/multi-file
  plans, run one skeptical pass over the drafted document before handoff: find
  implicit hard-to-reverse decisions, unanchored claims, and missing decisions;
  fix the clear ones, route real judgment calls to Open Questions.

---

## 6. Architecture

```
spec.md / diff ──▶ [agent: research + author blocks] ──▶ block[] (JSON)
                                                            │
                          ┌─────────────────────────────────┼───────────────────────────┐
                          ▼                                  ▼                           ▼
                  diagram renderer                  simple block renderers        assembler
              (D2 floor + Excalidraw upgrade)   (diff, file-tree, api, schema,   (HTML template)
                          │                       annotated-code, questions)          │
                          ▼                                  ▼                         ▼
                   svg + .excalidraw?  ────────────────────────────────────▶  plan.html / recap.html
```

### 6.1 Block model

The agent produces an ordered array of typed blocks (JSON). Each renders to an
HTML fragment; the assembler concatenates them under a header.

```ts
type Block =
  | DiagramBlock
  | SchemaBlock          // ERD / data-model, incl. before→after for recaps
  | ApiBlock             // endpoint / tRPC procedure contract, incl. diffs
  | FileTreeBlock        // file map with +/- change badges
  | AnnotatedCodeBlock   // code excerpt with agent prose annotations
  | DiffBlock            // raw hunk view with annotations (recap-centric)
  | ProseBlock           // markdown narrative between blocks
  | QuestionsBlock;      // single bottom Open Questions block (plan-centric)

interface DiagramBlock {
  type: "diagram";
  id: string;
  title: string;
  kind: "flowchart" | "architecture" | "sequence" | "erd" | "class";
  d2: string;            // REQUIRED — the floor + fallback (D2 source)
  mermaid?: string;      // OPTIONAL — only for editable-eligible kinds
}
```

**Authoring rule (load-bearing).** Because D2 and Mermaid are different dialects
and we do not transpile:

- For `flowchart` / `architecture` blocks: author **both** a `d2` source (floor)
  **and** a `mermaid` source (drives the editable Excalidraw upgrade).
- For `sequence` / `erd` / `class`: author **`d2` only**.

`SchemaBlock` is a `DiagramBlock` of `kind:"erd"` specialized to render the
Prisma model graph (and before→after for recaps); it always uses D2.

### 6.2 Diagram renderer (dual)

Implemented by `render-diagram.mjs` (already drafted — included with this spec;
adapt, don't rewrite from scratch). Contract:

- **Floor:** always compile the block's `d2` source with `d2 --sketch` → SVG. No
  browser. This is the guaranteed artifact.
- **Upgrade:** if the block is editable-eligible (`kind ∈ {flowchart,
  architecture}`), has a `mermaid` source, and the Excalidraw toolchain is
  available, run `parseMermaidToExcalidraw → convertToExcalidrawElements →
  exportToSvg`, write a `<id>.excalidraw` sidecar, and use that SVG for display.
- **Fallback:** any failure in the upgrade path returns the already-computed D2
  SVG. Output is never broken and never changes aesthetic.

Routing is **by diagram kind, decided up front** — not by "is the toolchain
available." Rationale: `mermaid-to-excalidraw` does not fail on an ERD/sequence
diagram; it rasterizes it, which is worse than D2's native sketch. So only the
kinds that convert to editable elements are ever eligible for the upgrade.

The Excalidraw path needs a DOM, so it runs in a Playwright page that loads a
static `assets/excalidraw-bundle.html` exposing the two UMD globals. The D2 path
needs only the `d2` binary.

Result per block: `{ id, title, svg, editable: string|null, renderer }`. The
assembler renders an "open in Excalidraw" link only where `editable` is set.

### 6.3 Other block renderers (string → HTML, no browser)

- **`schema` / ERD** → handled by the diagram renderer (`kind:"erd"`, D2). For
  recaps, render before→after as two D2 ERDs or a single annotated one. Source of
  truth for the model graph: `prisma migrate diff` (see §6.5).
- **`api`** → render a tRPC procedure / endpoint contract as a compact table
  (input, output, auth, mutation/query). For recaps, show added/removed/changed
  procedures by structurally diffing router definitions (TypeScript), not raw
  lines.
- **`file-tree`** → nested list from `git diff --stat` / `--dirstat` with
  `+N/-N` badges and add/modify/delete markers.
- **`annotated-code`** → syntax-highlighted excerpt with margin annotations.
  Highlight at build time (Shiki) so the HTML stays static (no client JS).
- **`diff`** → hunk view with agent annotations attached to hunks. Render
  server-side (Shiki on the `+`/`-` lines) rather than shipping diff2html's
  client JS, to keep output self-contained.
- **`prose`** → markdown → HTML.
- **`questions`** → the single Open Questions block (plan only): list of
  `{ question, recommendedDefault }`.

### 6.4 Document assembler / HTML template

- Single self-contained `.html` file. Inline the CSS. Inline diagram SVGs.
- Sketch-consistent visual theme (paper background, hand-drawn font for diagram
  labels via an embedded/`@font-face` handwriting font; clean sans for body).
- A header block: title, source (spec path / branch / PR / commit SHA),
  timestamp, and a one-line status (green/yellow/red — reuse the user's existing
  status convention if present).
- Decision: **prefer fully inlined assets** (fonts as base64 or a bundled woff2,
  CSS inline, SVG inline) so the file works offline and survives being moved.
  Syntax highlighting and diffs are pre-rendered, so no runtime JS is required.
- Dark mode: render on a fixed light "canvas" (like Excalidraw) rather than
  trying to invert hand-drawn ink. Decide explicitly (see Open Questions).

### 6.5 Recap input gatherer

A small module that turns a target into blocks' raw inputs:

- **Scope** the work unit: `git diff <base>...<head>`, `git show <sha>`,
  `gh pr diff <n>`, or the working tree. Default base = merge-base with the
  trunk. Exclude unrelated pre-existing dirty changes.
- **File map:** `git diff --stat`, `--dirstat`.
- **Schema diff:** `prisma migrate diff --from-* --to-*` (or compare
  `schema.prisma` revisions) → before/after model graph.
- **API diff:** locate changed tRPC routers; diff procedure signatures
  structurally.
- **Annotated diff:** per-file hunks with surrounding context for the agent to
  annotate.

---

## 7. The skills

Each skill is a `SKILL.md` plus references and the shared renderer/assembler. The
skill text encodes the §5 principles and the §6.1 authoring rule, and forbids
inline-only output (the deliverable is always the HTML file).

### 7.1 `visual-plan`

- **When:** multi-file, ambiguous, architecture-heavy, data-heavy, or risky
  work, or when an existing spec needs a richer review surface. Skip for trivial
  changes.
- **Workflow:** (1) read the spec source + research the repo; (2) ask 2–4
  high-leverage clarifying questions only if a real ambiguity would change the
  design; (3) author blocks (commit to one approach; hard-to-reverse decisions
  first; reuse before additions); (4) render → write `plans/<slug>/plan.html`
  (+ `.excalidraw` sidecars); (5) high-stakes self-review pass; (6) surface the
  file path and request approval. Read-only throughout.

### 7.2 `visual-recap`

- **When:** a PR/commit/branch is large, multi-file, or touches schema/API/
  architecture. Skip for small obvious diffs.
- **Workflow:** (1) resolve scope (§6.5); (2) gather raw inputs; (3) author
  blocks summarizing the *shape* of the change (schema diff, API diff, file map,
  annotated diff, architecture deltas); (4) render → write
  `.recaps/<slug>/recap.html`; (5) surface the path. Read-only.
- **Default renderer bias:** recaps favor D2 (faster, no browser, the user is
  reading not editing). Plans favor the Excalidraw upgrade for their
  architecture diagrams (the user may tweak before approving).

---

## 8. Output & storage

- Plans → `plans/<slug>/plan.html` + `plans/<slug>/<diagram-id>.excalidraw`.
- Recaps → `.recaps/<slug>/recap.html` (+ sidecars).
- `<slug>` = date + short title.
- Decision needed: committed vs git-ignored by default (see Open Questions).
  Provide a flag either way.

---

## 9. Tech stack & dependencies

- **Node 20+ / ESM.** TypeScript preferred (user's stack), output to JS or run
  via tsx.
- **`d2`** binary on PATH (single Go binary; document the install step).
- **`@excalidraw/excalidraw`**, **`@excalidraw/mermaid-to-excalidraw`**,
  **`playwright`** (chromium) for the editable upgrade path only.
- **`shiki`** for build-time syntax highlighting (annotated-code, diff).
- **`prisma`** CLI (already in the user's stack) for schema diffs.
- **`gh`** CLI for PR scope (optional; degrade gracefully if absent).
- View-time runtime deps: **none** (static HTML).

---

## 10. Repo layout

```
visual-skills/
  skills/
    visual-plan/
      SKILL.md
      references/{document-quality.md, authoring.md, exemplar.md}
    visual-recap/
      SKILL.md
      references/{recap-scope.md, exemplar.md}
  src/
    render-diagram.mjs        # dual renderer (provided)
    renderers/                # diff, file-tree, api, schema, annotated-code, prose, questions
    assemble.mjs              # block[] → html
    gather-recap.mjs          # target → raw inputs
    blocks.ts                 # Block types (§6.1)
  assets/
    excalidraw-bundle.html    # UMD globals for the Excalidraw path
    template.css, font.woff2
  bin/
    plan.mjs                  # CLI: spec → plan.html
    recap.mjs                 # CLI: target → recap.html
  test/
```

---

## 11. Build plan (phased — small PRs, single session)

- **M0 — D2 floor + assembler (no browser).** `blocks.ts`, `render-diagram.mjs`
  D2 path, `assemble.mjs`, `template.css`. CLI renders a hand-authored block
  array to `plan.html`. Acceptance: a flowchart + ERD render as sketch SVG in a
  self-contained file.
- **M1 — recap gatherer.** `gather-recap.mjs` + `bin/recap.mjs`. Produce a recap
  from a real branch using file-tree + annotated-diff + schema-diff blocks.
- **M2 — remaining renderers.** api, annotated-code (Shiki), file-tree badges,
  questions, prose.
- **M3 — Excalidraw upgrade.** `assets/excalidraw-bundle.html`, Playwright path,
  `.excalidraw` sidecars, "open in Excalidraw" links, runtime fallback verified.
- **M4 — the two SKILL.md files.** Wire the §5 principles and §6.1 authoring
  rule; gate logic; self-review pass.
- **M5 (optional) — PR integration.** `gh pr comment` posting a recap link/summary.

Ship M0–M2 before taking on the browser dependency in M3.

---

## 12. Locked decisions (do not re-litigate)

1. Fully self-hosted; no hosted service or MCP connector.
2. Diagram renderer is dual: **D2 sketch = floor/fallback; Excalidraw =
   editable upgrade for flowchart-class only.** Route by kind, not availability.
3. Editable-eligible kinds: `flowchart`, `architecture`. Everything else → D2.
4. Output is a single self-contained static HTML file with pre-rendered
   highlighting/diffs and no view-time JS.
5. Every diagram block carries a `d2` source; editable-eligible blocks also carry
   `mermaid`. No transpilation.
6. Schema diffs come from `prisma migrate diff`; API diffs from structural tRPC
   router comparison.

## 13. Open questions (decide during planning)

1. **Skill names** — `visual-plan`/`visual-recap` collide with BuilderIO's.
   Rename to avoid confusion (e.g. `sketch-plan`/`sketch-recap`)?
2. **Storage default** — commit artifacts (`plans/` in-repo, reviewable in PRs)
   or git-ignore (`.recaps/` ephemeral)? Per-skill default?
3. **Dark mode** — fixed light Excalidraw-style canvas (simplest), or a
   sketch-friendly dark theme?
4. **`class`/`sequence` Excalidraw** — `mermaid-to-excalidraw` support is
   partial/version-dependent. Keep them D2-only (current plan) or promote to
   editable behind a capability probe?
5. **Integration** — standalone CLI/skills, or fold the renderer into the
   existing `/plan-create` and `/plan-review` commands?
6. **Font** — which embedded handwriting font for diagram labels (license-clean,
   small woff2)?

## 14. Acceptance criteria (v1)

- `visual-plan` against a real spec produces a self-contained `plan.html` whose
  blocks name real repo files/symbols, with at least one sketch architecture
  diagram and (where the toolchain is present) an editable `.excalidraw` sidecar
  that opens in excalidraw.com.
- `visual-recap` against a real branch produces a `recap.html` with a file map,
  an annotated diff, and a Prisma schema diff rendered as a sketch ERD.
- With `d2` present but the Excalidraw toolchain absent, both still succeed,
  rendering every diagram via D2 sketch with no broken blocks.
- No network access is required to open either output file.

## 15. Appendix — renderer contract

See `render-diagram.mjs`. Key exports: `renderDiagram(block, opts)` and
`renderAll(blocks, opts)`; result `{ id, title, svg, editable, renderer }`;
`opts = { outDir, excalidraw?: boolean, onWarn? }`.
