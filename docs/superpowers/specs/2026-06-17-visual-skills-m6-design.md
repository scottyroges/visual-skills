# Visual Skills M6 — Contextual Recaps Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** M0–M4 (CLIs, renderers, producers, skills)

## Goal

Make recaps explain a change, not just list it: a brief summary, a "where it fits" diagram,
and — via the skill — a "how it's used" behavioral diagram selected for the specific change.
A bare `recap` gives no context today (no summary, nothing showing where the change sits or
how it runs); this fixes that mechanically and adds agent intelligence on top.

## Key finding

The renderer already compiles every diagram type in the broader taxonomy via the d2 floor
(verified: `shape: sequence_diagram` and state-transition graphs both compile). So this is
**not** a rendering feature — it is an intelligence + plumbing feature. No renderer or
`Block`/`DiagramKind` changes are required; behavioral diagrams are authored as ordinary
`diagram` blocks (kind `sequence` for sequence diagrams — already in `DiagramKind` — and
`architecture` for state/transition graphs), rendered by the existing d2 floor.

## Decisions

1. **Hybrid generation.** The bare `recap` CLI gains mechanical, always-on context (a richer
   summary + a dependency-neighborhood "where it fits" diagram). The `visual-recap` skill
   adds the agent-selected, agent-authored behavioral diagram.
2. **First slice = fit + behavior core.** Summary + dependency-neighborhood graph
   (mechanical) + ONE agent-selected behavioral diagram (sequence OR state machine). The
   long-tail catalog (C4, DDD context maps, data-flow, event topology, CI/blast-radius,
   BPMN, journey maps) is deferred to later milestones on the same framework.
3. **Merge via `--emit-blocks`.** `recap` gains a mode that writes the gathered `Block[]` as
   JSON; the skill augments that array and renders it with the existing `plan --blocks`.
   Recap stays deterministic; the agent enriches in the middle; `assemble` renders.

## Architecture

### Layer 1 — mechanical (in the recap pipeline, no agent)

**Richer summary — `src/recap-summary.ts`.**
- `summaryMarkdown(scope, files, procedures): string` — pure. Synthesizes a short Markdown
  summary from data already gathered:
  - scope label + totals (files, +added/−deleted);
  - the top-level areas/dirs touched (e.g. `src/server/routers`, `prisma`), derived from the
    changed file paths;
  - procedures added / removed / changed (names), from the api-diff `procedures` with a
    `change`;
  - a one-line note when the Prisma schema changed (added/removed fields), if a schema block
    was produced.
- Returns Markdown; `gather-recap` wraps it in the existing `summary` prose block (replacing
  today's one-liner). Always present, deterministic.

**"Where it fits" diagram — `src/dep-graph.ts`.**
- `dependencyNeighborhood(changedPaths, repoRoot, opts?): Promise<DiagramBlock | null>`.
- Considers only changed source files (`.ts/.tsx/.js/.jsx`). Returns `null` if none.
- **Outgoing edges (imports):** parse each changed file with the TypeScript compiler API
  (already a dependency, used in `trpc-parse.ts`); collect import module specifiers; resolve
  relative specifiers to repo-relative paths; keep both relative-internal and bare-package
  imports (packages shown as leaf nodes).
- **Incoming edges (importers):** a bounded scan of repo source files (under common source
  roots, e.g. `src/`) for import specifiers that resolve to a changed file. Best-effort
  relative-import resolution.
- **Bounds:** 1 hop; cap total nodes (default 15); when a changed file has more neighbors
  than the cap allows, collapse the overflow into a single `+N more` node. Skip the whole
  diagram (return `null`) if no edges resolve.
- **Output:** d2 (kind `architecture`): changed files as highlighted nodes (fill), neighbors
  plain, directed edges (`importer -> changed`, `changed -> import`). All keys quoted (paths
  contain dots/slashes). Title "Where it fits".
- TS/JS only (the target stack). Other stacks simply get no dep-graph (graceful).

**Wiring — `src/gather-recap.ts` (`buildBlocks`).** Gather schema + api first (as today),
then compose ordered blocks: **summary** (rich), file-tree, **where-it-fits** (dep-graph,
if non-null), schema, api-surface diagram, api tables, diffs. Each new producer is wrapped
in the existing warn-and-skip degradation so a failure never aborts the recap.

### Plumbing — `bin/recap.ts`

Add `--emit-blocks <path>`: write the gathered `Block[]` as JSON to that path. Independent
of `--out`:
- `--out` only → HTML (today's behavior, now richer).
- `--emit-blocks` only → JSON block array, no HTML.
- both → write both.
The JSON is exactly the array `assemble`/`plan --blocks` consumes, so it round-trips.

### Layer 2 — intelligence (in `skills/visual-recap/SKILL.md`)

Add a **"Add context (smart enrichment)"** section describing the workflow and the selection
guide:

**Workflow:**
1. `cd "$VISUAL_SKILLS_DIR" && npx tsx bin/recap.ts --repo <abs> <target> --emit-blocks <abs.json>`.
2. Read the emitted block array (it already contains the mechanical summary, file-tree,
   where-it-fits graph, schema/api, diffs) **and** the diff itself.
3. Optionally improve the summary prose, and **author ONE behavioral diagram** selected per
   the guide below, inserting it near the top (after the summary / where-it-fits).
4. Render the combined array: `npx tsx bin/plan.ts --blocks <abs.json> --title "<...>" --out <abs.html>`.
5. Open it.

**Selection guide (scoped to what renders now):**
- **Sequence diagram** (`kind: "sequence"`) — when the change adds or alters a
  multi-collaborator runtime path (a new request/response flow, an external integration
  call chain). Collaborators on lifelines, time downward, one scenario.
- **State machine** (`kind: "architecture"`, transition graph) — when the change alters a
  bounded lifecycle: statuses, subscription/checkout/signup stages, anything where "the
  entity is in one of N states" with labeled transitions.
- If the change is purely structural (no clear runtime flow or lifecycle), the mechanical
  where-it-fits graph already covers it — the agent may skip the behavioral diagram rather
  than force one.
- The guide explicitly notes the broader taxonomy (C4, DDD context maps, data-flow, event
  topology, CI/blast-radius, BPMN, journey maps) as **future** options not yet in scope, so
  the agent does not attempt them.

**Authoring recipes** — copy-paste-valid d2 for each supported behavioral type:
- Sequence:
  ```
  shape: sequence_diagram
  client -> api: captureOrder(id)
  api -> paypal: capture(id)
  paypal -> api: ok
  api -> client: order
  ```
- State machine:
  ```
  direction: right
  PENDING -> PAID: capture
  PENDING -> FREE: cancel
  ```
  with quoting rules (quote any key/value containing a dot or space).

## Error handling

Every new producer degrades: the dep-graph returns `null` (skipped) on parse failure, no
resolvable edges, or a non-TS/JS change; the summary always renders (pure string build); a
behavioral diagram the agent authors compiles through the d2 floor and degrades to a visible
placeholder if invalid — never breaking the document. `--emit-blocks` failures surface as a
normal CLI error.

## Testing

- **recap-summary:** synthesizes areas/dirs, lists added/removed/changed procedures, notes a
  schema change; handles an empty/no-procedure change (totals only).
- **dep-graph:** parses outgoing imports of a changed file; finds an importer via the repo
  scan; bounds the node count (overflow → `+N more`); returns `null` for a non-source change
  and when nothing resolves; emitted d2 **compiles via the d2 binary** (assert `<svg>` and
  NOT "failed to render").
- **gather-recap:** the rich summary and (for a TS change) the where-it-fits diagram appear,
  ordered before schema/api; degradation still holds when a producer throws.
- **recap `--emit-blocks`:** writes a JSON array that parses as `Block[]` and renders through
  `plan --blocks` to self-contained HTML with no `<script>`.
- **skill-docs guard (extended):** assert `visual-recap/SKILL.md` mentions `sequence` and
  `state` (the selection guide is present and names both behavioral types).
- **Regression:** ppgl `--commit 3559f61` — recap shows a real multi-line summary and a
  where-it-fits diagram, still self-contained, 0 `<script>`, 0 "failed to render".

## Risks

- **Importer scan cost/noise** on large repos → bounded to source roots, 1 hop, node cap,
  best-effort resolution; overflow collapsed.
- **Relative-import resolution edge cases** (path aliases, index files) → best-effort; an
  unresolved import is simply omitted rather than wrong. The dep-graph is a navigational aid,
  not a proof.
- **TS/JS-only** dependency analysis → other stacks get summary-only context (no dep-graph);
  acceptable for the target stack, extensible later.
- **Agent diagram quality** depends on the guide + recipes → mitigated by compile-on-render
  degradation and a deliberately small, well-specified behavioral set.
