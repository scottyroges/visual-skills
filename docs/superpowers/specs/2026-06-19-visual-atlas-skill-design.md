# Visual Atlas (`visual-atlas` skill) — Design

**Date:** 2026-06-19
**Status:** Approved (brainstorming)

## Goal

A fourth visual skill that produces **standing maps of a codebase** — not a single change
(`visual-recap`), a single proposal (`visual-spec`), or a plan (`visual-plan`), but the
architecture and domains that *already exist*. The output is a two-level set of self-contained
HTML pages in the established app-shell language:

- **`atlas.html`** — one narrative onboarding map of the whole system.
- **`domain-<slug>.html`** — one deep-dive + reference page per domain, linked from the atlas.

Optimized for **onboarding first** (a newcomer with zero context gets oriented fast), with the
domain pages doubling as a **lookup reference** for people who already know the system. When the
two goals conflict, favor the newcomer.

## Decisions (locked during brainstorming)

1. **Two-level scope** — an atlas page that links down to per-domain deep-dive pages (the union of
   "system overview" and "per-domain detail").
2. **Hybrid generation** — a mechanical scanner emits a draft; the agent names domains, writes the
   "why", curates, and picks diagrams; the tool renders. Mirrors recap's `--emit-blocks`
   enrich-then-render flow. Domains are conceptual groupings, so the conceptual part is the agent's.
3. **Agent groups a structural inventory** — the scanner provides modules, routers, models, and
   import edges with a folder-based *first guess*; the agent assigns each module to a named domain.
4. **The grouping is persisted as `atlas.domains.json`** — a committed, human-owned config artifact.
   The agent produces it; a human can edit it (move/merge/split/rename) and regeneration respects
   it deterministically. It is simultaneously the agent's output and the human's input.
5. **Three operation modes** — full scan, single-domain update, and render-only (reproduce).
6. **Onboarding-first** — atlas reads as a narrative map; domain pages are the reference detail.
7. **New skill, own generator** (not an extension of `visual-spec`) — keeps the "map of what
   exists" mental model, chrome, and lint floor separate from the "proposal for a change" model.
8. **Canonical subject: `sports-rpg`** — a real Prisma + tRPC codebase with genuine multiple
   domains (the same source pool the `visual-spec` canonical came from).

## Background — what already exists to reuse

The repo has three generators that all share infrastructure; the atlas is the fourth in the same
mold. Reused as-is:

- **App shell** — topbar → sidebar + main, sidebar overlay, zoom overlay, scrollspy + progress
  rail, inlined `review.css` + `review-viewer.js`. (`assemble-review.ts` / `assemble-spec.ts` are
  the precedents.)
- **`spec.css` component cards** — the component-card, big-idea, and tile vocabulary built for
  `visual-spec` is directly reusable for domain-page components and atlas tiles.
- **Diagram pipeline** — `renderAll(diagramBlocks, opts)` (`render-diagram.ts`),
  `renderDiagramCard` (`review/sections.ts`), the shared color vocabulary
  (`diagram-colors.ts`), and the catalog (`skills/shared/diagrams.md`). d2 is the render floor;
  flowchart/architecture/sequence/class additionally carry `mermaid` for editable Excalidraw.
- **Markdown** — `renderInlineMarkdown` / `renderMarkdown` (`src/renderers/markdown.ts`).
- **Mechanical extractors for the scanner** — `trpc-parse.ts` (routers/procedures),
  `prisma-schema.ts` (models/relations), `imports.ts` + `dep-graph.ts` (import edges), used by
  the recap's mechanical `where-it-fits` graph today.
- **Spec block model conventions** — `assertUniqueSpecIds`, `chapterLabel`, `isChapter`,
  `collectSpecDiagrams` in `spec-blocks.ts` are the template for `atlas-blocks.ts`.

Genuinely **new** vs. all prior skills:
- A **domain-map** block (all domains + cross-domain edges, aggregated from the import graph).
- A **domain-index / tile** block and a **runtime-topology** block.
- **Multi-file, cross-linked output** (atlas ↔ domain pages over relative `file://` links). Every
  prior skill emitted a single HTML file.
- The **inventory scanner** (`gather-atlas.ts`) and the **`atlas.domains.json`** config + drift
  reconciliation.

## Operation modes (CLI)

`bin/atlas.ts` — `atlas --repo <abs> --out <abs dir> [--domain <slug>] [--blocks <atlas.json>]`.

| Mode | Invocation | Behavior |
|---|---|---|
| **Full** | `atlas --repo X --out DIR` | Scan repo → reconcile the live inventory against `DIR/atlas.domains.json` (create it from the folder first-guess if absent; flag drift if present) → emit/refresh `atlas.json` + every `domain-<slug>.json` draft → (agent enriches) → render `atlas.html` + all domain pages. |
| **Single domain** | `atlas --repo X --domain billing --out DIR` | Rescan only that domain's configured modules → refresh `domain-billing.json` → render `domain-billing.html` and refresh just that domain's tile on `atlas.html`. Other domains untouched. |
| **Render-only** | `atlas --blocks DIR/atlas.json --out DIR` | Re-render from existing source JSON, no scan. The recap/spec reproducibility pattern. (Domain pages render-only via their own `domain-<slug>.json`.) |

### Artifacts in the out dir (all committable, all re-renderable)

- `atlas.domains.json` — the grouping config (human-owned source of truth).
- `atlas.json` — atlas-page blocks.
- `domain-<slug>.json` — one per domain, that page's blocks.
- `atlas.html` + `domain-<slug>.html` — rendered, cross-linked output.

### Drift reconciliation

On a full scan with an existing `atlas.domains.json`, the scanner diffs live inventory vs. config
and reports, without overwriting human edits:
- **New modules** present in the repo but unassigned in the config (need an assignment).
- **Stale paths** in the config that no longer resolve in the repo (need removal).
Only the delta needs resolving — not the whole map each run. This keeps single-domain and repeat
runs cheap.

## Content model

### `atlas.domains.json` (config)

```jsonc
{
  "repo": "sports-rpg",
  "srcRoots": ["src", "packages/*/src"],
  "domains": [
    { "slug": "gm-brain", "name": "GM Brain", "globs": ["src/gm/**"],
      "modules": ["src/gm/planning.ts", "src/gm/perception.ts"] }
  ]
}
```

`globs` is the human-editable lever; `modules` is the resolved membership the scanner fills in.
Editing `globs` (or moving a path between domains) re-groups deterministically on the next run.

### `atlas.html` — atlas-page blocks (`atlas-blocks.ts`)

- **`atlas-tldr` / "Start here"** — what the system does in one line; the 3–5 things a newcomer
  must hold in their head; a pointer to the most central domain to read first. (Topbar chips: repo
  name, "System Atlas", stack chips, domain count, generated date — page options, not a block.)
- **`domain-map`** (hero) — all domains as nodes, cross-domain dependencies as edges, aggregated
  mechanically from the import graph to the domain level; entry/most-central domains color-coded.
  Reuses the diagram pipeline (architecture kind, editable).
- **`topology`** — the deployable runtime containers (web → API → DB → workers), C4-container
  style. Reuses the diagram pipeline.
- **`domain-index`** — a grid of domain tiles: name, one-line purpose, size (modules/entities),
  key models, link → its `domain-<slug>.html`. Both the onboarding map and the reference index.
- *(optional)* **`concerns`** — cross-cutting concerns (auth, logging) that span domains; and a
  key-concepts **glossary**.
- **`atlas-prose`** — escape hatch (block markdown), as `spec-prose` is for specs.

### `domain-<slug>.html` — domain-page blocks

Largely reuses spec block types (component cards, diagrams, prose); the page chrome adds a
"← Atlas" back link (page option). Section ladder:

- **`domain-tldr`** — what this domain owns, why it exists, its responsibilities.
- **`components`** — the modules/services/routers inside it (reuse the `visual-spec` component
  cards: name, purpose, key functions/fields).
- **`internal-arch`** (diagram) — how the pieces wire up (router → service → repo → store),
  feature-home style.
- **`data`** — the Prisma models the domain owns (ERD or entity cards).
- **`seams`** — what it exposes (API/router surface) and what it depends on from neighbors
  (bounded-context edges); links to neighbor domain pages.
- **`flows`** (diagram/tabs) — 1–2 authored sequence/decomposition diagrams for key runtime paths.

Where a domain-page section is structurally identical to a spec section, the block type is shared
from `spec-blocks.ts` rather than duplicated; atlas-only blocks live in `atlas-blocks.ts`.

## Components / files

| File | Role |
|---|---|
| `src/atlas-blocks.ts` | Block model for atlas + domain pages; `assertUniqueIds`, `chapterLabel`, `collectDiagrams` analogues. Imports/reuses spec block types where identical. |
| `src/gather-atlas.ts` | The scanner: walk `srcRoots`, extract routers/models/modules/import-edges (reusing `trpc-parse`/`prisma-schema`/`imports`/`dep-graph`), produce/reconcile `atlas.domains.json`, aggregate import edges to the domain level for the `domain-map`, emit draft `atlas.json` + `domain-<slug>.json`. |
| `src/assemble-atlas.ts` | `assembleAtlas(blocks, opts)` and `assembleDomain(blocks, opts)` → self-contained HTML in the shell; inlines `review.css` + `spec.css` + `review-viewer.js`; wires the domain-map/topology/index renderers; cross-page links. |
| `bin/atlas.ts` | CLI for the three modes; reads/writes the artifact set; prints warnings + drift report. |
| `src/lint-atlas.ts` | The demo-standard floor (see below), surfaced through `onWarn`. |
| `skills/shared/atlas-components.md` | Catalog: how it assembles, the section ladders, color/role vocabulary, and reproducible recipes for the atlas-only components (domain map, tiles, topology, seams). Cross-linked with `diagrams.md` and `spec-components.md`. |
| `skills/visual-atlas/SKILL.md` | The skill: the standard, red flags, the workflow (scan → reconcile config → author per catalog → render → close warnings), the artifact set, the three modes, scaling by repo size. |
| `assets/atlas.css` *(only if needed)* | Atlas-only styles (domain map legend, tile grid) not already covered by `spec.css`. Prefer reusing `spec.css`. |

Wiring: register `visual-atlas` in `scripts/install-skills.ts` (`SKILLS` array) and add the
`visual-atlas` bin + `atlas` script to `package.json`.

## The standard (lint floor)

Following the lesson from the recap/spec rewrites — *the skill alone underdelivers; a mechanical
backstop holds the bar* — `lint-atlas.ts` warns (never throws) when an atlas/domain set falls
below the demo standard. Candidate rules (finalized with tests):

- Atlas: no `atlas-tldr` / "start here"; no `domain-map`; no `domain-index`; a domain tile with no
  purpose; a tile linking to a domain page that wasn't generated.
- Domain page: no `domain-tldr`; no `internal-arch` diagram for a domain above a size threshold;
  `seams` referencing a neighbor domain that doesn't exist.
- Config: modules in the repo unassigned in `atlas.domains.json` (drift); a domain with zero
  modules.

Clean on the canonical example; warns on a bare/incomplete set.

## Build phasing (small PRs)

1. **Canonical example** — hand-author `atlas.html` + 2–3 `domain-*.html` for `sports-rpg` via
   `impeccable`, to nail the look (domain map, tiles, topology, seams). The "what good looks like"
   reference. Commit.
2. **Block model + assembler + CLI (render-only)** — `atlas-blocks.ts`, `assemble-atlas.ts`,
   `bin/atlas.ts`; regenerate the canonical from JSON; multi-file cross-linked output. Commit.
3. **Inventory scanner + config** — `gather-atlas.ts`, full + single-domain modes, drift
   reconciliation, `atlas.domains.json`. Commit.
4. **Catalog + skill + lint + dogfood** — `atlas-components.md`, `skills/visual-atlas/SKILL.md`,
   `lint-atlas.ts`; then a blind dogfood on a different codebase/domain. Commit.

## Testing

- `test/assemble-atlas.test.ts` — self-contained page, shell/chips/nav/rail, domain-map + index
  render, cross-page links resolve, malformed page-options degrade to a warning (per the spec
  dogfood lesson).
- `test/gather-atlas.test.ts` — inventory extraction on a fixture repo; config creation from the
  folder first-guess; drift reconciliation (new module flagged, stale path flagged) without
  clobbering human edits.
- `test/lint-atlas.test.ts` — clean on a complete set; the specific warnings fire on an
  incomplete one.
- Extend `test/install-skills.test.ts` and `test/skill-docs.test.ts` for `visual-atlas` (skill
  registered; every atlas block type documented in the SKILL).

## Open questions / non-blocking

- **Atlas refresh on single-domain runs** — minimal behavior is to refresh only the changed
  domain's tile; whether to also recompute the `domain-map` (a cross-domain edge may have changed)
  is a judgment call deferred to implementation, behind an explicit note in the drift report.
- **`atlas.css`** — created only if `spec.css` proves insufficient for the tile grid / map legend.
- **Monorepo `srcRoots`** — globbed roots are in the config shape from day one, but the canonical
  is single-root; multi-root resolution is exercised only if the dogfood subject needs it.
