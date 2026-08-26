# Atlas-Component Catalog

Reusable layout components for a **visual atlas** — a standing, self-contained map of a codebase's
current architecture. The atlas is a recursive page tree: `atlas.html` orients the whole system,
domain pages orient bounded contexts, and conceptual topic pages provide focused depth. Sibling to the
[Diagram Catalog](diagrams.md) (the d2/mermaid diagrams the renderer compiles) and the
[Spec-Component Catalog](spec-components.md) (whose card vocabulary the domain pages reuse).

**Base worked reference:** [`example/atlas-ppgl/`](../../example/atlas-ppgl/) — `atlas.json →
atlas.html` plus a `domain-<slug>/` folder per domain (`domain-<slug>.json → domain-<slug>.html`). It
demonstrates the shared system/domain visual language; topic recipes below describe the recursive
renderer added after that example.

**Layout.** The atlas page sits at the top of the out dir; each domain lives in a
`domain-<slug>/` folder, and each recursive topic adds a `<topic-slug>/` directory below its parent.
Every folder holds that page's JSON, HTML, and diagram sidecars. The renderer derives relative links
from this conceptual tree.

> **Vocabulary is generic.** The component/section names here (`spine`, `domain-map`, tiles,
> `seams`, "Key files", "Key exports") are the reusable atlas grammar and stay generic on every
> atlas. Only the *authored content* of an instance is subject-specific (real identifiers like
> `simSeason`, layer names like "Intelligence"). Never bake a subject's flavor into a section name.

## How it assembles

A visual atlas reuses the recap's **app shell** verbatim (`header.topbar` → `div.layout` with
`nav.sidebar` + `main.main`, plus the sidebar-overlay, zoom-overlay, and the sidebar/scrollspy/zoom
`<script>`). It loads three stylesheets, in order:

1. `assets/review.css` — the design system (tokens, topbar, sidebar, chips, code blocks, diagrams,
   progress rail, responsive shell). **Do not redefine these.**
2. `assets/spec.css` — the shared card / big-idea vocabulary (the domain pages reuse it).
3. `assets/atlas.css` — the atlas-specific components in this catalog (tile grid, layer chips,
   primer, depth deep-dive, seams, nested sidebar dots).

The shipped artifact **inlines all three** into one `<style>` so it stays self-contained over
`file://`. `assets/atlas.css` is the source of truth; the example inlines a snapshot.

**Input vs output.** The snippets below show the **rendered HTML** each component produces (the shape
+ classes). You don't write that HTML by hand: you author **typed JSON blocks** in an `atlas.json`,
`domain-<slug>.json`, or `<topic-slug>.json`, and `assemble-atlas.ts` generates the HTML. The exact JSON field shape of every
block is defined and commented in [`src/atlas-blocks.ts`](../../src/atlas-blocks.ts) — **read it as
you author.**

**Hybrid generation.** Unlike the spec (pure authoring), the atlas starts from a **mechanical scan**:
`atlas --repo <abs> --out <dir>` walks the codebase, groups modules into domains, resolves labeled
topic evidence from committed `atlas.domains.json`, and emits missing recursive drafts. You then
author purposes, current-truth explanations, connections, and diagrams. The scanner inventories and
checks; it never creates, moves, or mutates the authored topic tree.

## Page options

Top-level fields of the JSON doc (NOT blocks—they drive page chrome). Their shapes are in
`src/atlas-blocks.ts` (`AtlasOpts`, `DomainOpts`, and `TopicOpts`). Breadcrumbs, current branch,
children, siblings, related pages, owner-scoped reading paths, and search are derived from
`PageNavigation`; do not copy them into authored prose.

**Atlas page** (`atlas.json`):

    { "kind": "atlas",
      "title": "System Atlas · <repo>",   // topbar title
      "stack": "Next.js · TypeScript",     // topbar chip
      "count": "7 domains",                // topbar chip
      "date":  "generated 2026-06-20",     // topbar chip
      "note":  "in-memory state",          // topbar chip (optional)
      "meta":  [{ "key": "Source", "value": "…" }],   // sidebar Meta
      "blocks": [ … ] }

**Domain page** (`domain-<slug>.json`):

    { "kind": "domain", "slug": "brain",
      "title": "brain",                     // the domain name (topbar)
      "layer": "intelligence", "layerLabel": "Intelligence",  // tier accent + chip
      "path":  "lib/brain",                 // topbar chip
      "count": "~76 files",                 // topbar chip
      "depends": "sim · world · profiles",  // topbar "depends on" chip
      "backHref": "atlas.html",             // the "← Atlas" link (default atlas.html)
      "meta":  [{ "key": "Layer", "value": "Intelligence" }],   // sidebar Meta
      "blocks": [ … ] }

**Topic page** (`<topic-slug>/<topic-slug>.json`):

    { "kind": "topic",
      "title": "Context building",
      "purpose": "How stored state becomes ordered model input.",
      "shape": "mechanism",
      "backHref": "../domain-conversation-engine.html",
      "backLabel": "Conversation Engine",
      "blocks": [ … ] }

## The three section ladders

The renderer derives the sidebar + progress rail from the block order; the rail auto-places right
after the `*-tldr` lead. Author blocks top-to-bottom in these orders.

**Atlas page** (onboarding map):

1. `atlas-tldr` — the "Start here" lead.
2. `domain-map` — the hero: all domains + cross-domain edges.
3. `diagram-section` ("spine") — the runtime loop, one illustrating diagram.
4. `domain-index` — the grid of domain tiles (the map + the reference index).

**Domain page** (orientation → choices → boundary):

1. `domain-tldr` — what this domain owns, why it exists.
2. `diagram-section` ("internal-arch") — the load-bearing domain flow or architecture.
3. Derived child page cards — concise questions/outcomes that link to canonical topic pages.
4. `owns` — the data/models the domain owns.
5. `seams` — what it exposes and depends on from neighbors.
6. Optional compact `components`/`depth` reference for details that do not merit topic pages.

**Topic page** (plain-language understanding → evidence):

1. `topic-tldr` — what it does, when it runs, inputs, and outputs.
2. `diagram-section` and/or `topic-flow` — the main mechanism, algorithm, or lifecycle.
3. `topic-rules` — guarantees plus condition → behavior failures and fallbacks.
4. `example` — one grounded path when movement through the mechanism matters.
5. Derived child cards — nested algorithms or submechanisms with independent homes.
6. `implementation-reference` — a collapsed, labeled source index.

Shape adapts this ladder: `mechanism`, `algorithm`, `data-model`, `lifecycle`, and `integration` are
editorial guides, not rigid templates.

## Shape-specific teaching contracts

Progressive disclosure moves the complete explanation from a parent into a focused child. A topic
is not finished when it merely has the standard four blocks. Build it from a page teaching brief:
the reader question, mental model, transformed state, non-obvious decisions, representative case,
failures/outcomes, and supporting evidence. The reader should be able to predict a new case after
reading it.

### Mechanism

Explain inputs, ordered transformations, outputs, state changes, collaborators, and why the order
matters. For multi-stage behavior, include a diagram or grounded worked trace that follows one input
through the transformations and externally visible result.

### Algorithm

Explain the objective, inputs, thresholds or priorities, decision branches, invariants, edge cases,
and fallback behavior. Include a worked example with concrete values or records that exercises a
meaningful branch; do not replace the example with a restatement of the steps.

### Lifecycle

Explain states or phases, entry triggers, legal and rejected transitions, guards, terminal states,
cancellation, and recovery. Include a state/sequence diagram or worked trace through a normal path
and an abnormal state transition.

### Integration

Explain both sides of the boundary, request and response shape, ordering, deadlines, retry or
idempotence behavior, cancellation, and reconciliation. Include a sequence or representative
exchange that makes the protocol observable.

### Data model

Explain entities, relationships, ownership, constraints, mutation paths, lifecycle, and the queries
or invariants the model exists to support. Include a representative record or state transition when
it clarifies why the schema has its shape.

### Objective floor and editorial judgment

Every topic lead has a summary, input, and output. Every ordered flow has at least two meaningful
steps. Rules name a guarantee plus a failure/fallback, or explain why no material failure branch
exists. The implementation reference contains the actual source files and says what each contributes.
These are objective integrity requirements; the checker refuses to stamp an untouched scaffold.

Short-page, missing-trace, and algorithm-without-example messages are advisories. Inspect the source
and improve the explanation; never satisfy an advisory by padding words or inventing a diagram.

## Color / role vocabulary

Domains are tagged by **layer** — a coarse architectural tier that tints the tile, the topbar accent,
and the nested sidebar dot. Six generic layers (`LAYER_DOTS` in `src/atlas-blocks.ts`), each a
`fill;stroke` pair:

| `layer` | `layerLabel` (example) | fill / stroke |
|---|---|---|
| `foundation` | Foundation | `#e5dbff` / `#9775fa` |
| `engine` | Engine | `#d0ebff` / `#4dabf7` |
| `intelligence` | Intelligence | `#ffd43b` / `#f08c00` |
| `narrative` | Narrative | `#d3f9d8` / `#37b24d` |
| `surface` | Surface | `#eff4ff` / `#2563eb` |
| `harness` | Harness | `#f1f3f5` / `#adb5bd` |

`layerLabel` is the human label (free text); `layer` is the fixed key that picks the color. Keep one
layer per domain; let the label carry the meaning. For the **diagrams** inside an atlas (the domain
map, spine, internal-arch), use the [diagram color vocabulary](diagrams.md#color-vocabulary) —
mark the entry/most-central node, tag datastores `store`, third-party systems `external`.

## Atlas-only component recipes

### Start-here lead (`atlas-tldr`)

The newcomer's first 60 seconds: one line on what the system is, a few rows of orienting facts, and a
numbered **primer** — the things to hold in your head before reading anything else.

    <section class="section"><div class="primer">
      <div class="primer-row"><span class="primer-n">1</span>
        <div><div class="primer-h">…</div><div class="primer-p">…</div></div></div>
    </div></section>

JSON: `{ "type": "atlas-tldr", "id": "tldr", "eyebrow": "Start here", "heading": "…",
"rows": [{ "key": "…", "value": "…" }], "primer": [{ "h": "…", "p": "…" }] }`. `heading`/`value`/`p`
are inline markdown. Keep the primer to 3–5 items — it is the load-bearing orientation.

### Domain map (`domain-map`)

The hero: every domain as a node, cross-domain dependencies as edges, the entry/most-central domains
color-coded. **Two ways to produce it:**

- **Scanner draft** — a `diagram-section` with id `"map"` whose `diagram` is an editable
  `architecture`-kind d2+mermaid graph, aggregated mechanically from the import edges. Renders + stays
  editable; good enough to ship.
- **Hand-authored upgrade** — a `domain-map` block carrying raw trusted `svg` (what the canonical
  does), when you want a curated layout. Shape: `{ "type": "domain-map", "id": "map", "title": "…",
  "intro": "…", "svg": "<svg…>", "legend": [{ "label","fill","stroke" }], "caption": "…" }`.

`lintAtlas` accepts either form as "the map is present".

### Spine / standalone diagram (`diagram-section`)

A titled section wrapping a single rendered diagram (no title printed above the SVG — the section
header gives context). On the atlas it's the **spine** (the runtime loop); on a domain page it's the
**internal-arch**. Shape: `{ "type": "diagram-section", "id": "spine", "title": "…", "intro": "…",
"diagram": { "id": "…", "kind": "flowchart|architecture|sequence|erd|class", "d2": "…", "mermaid": "…",
"legend": […], "caption": "…" }, "callout": "…" }`. Carry `mermaid` for editable kinds (see the
[diagram catalog](diagrams.md)).

### Domain tile grid (`domain-index`)

The grid that is simultaneously the onboarding map and the reference index. Each tile:

    <a class="domain-tile layer-engine" href="domain-sim/domain-sim.html">
      <div class="domain-tile-head"><span class="domain-tile-name">sim</span>
        <span class="layer-chip layer-engine">Engine</span></div>
      <div class="domain-tile-path">lib/sim</div>
      <div class="domain-tile-purpose">…</div>
      <div class="domain-tile-meta">…</div>
      <div class="domain-tile-deps"><span class="dep-chip">world</span>…</div>
    </a>

JSON: `{ "type": "domain-index", "id": "domains", "title": "Domains", "intro": "…", "tiles": [
DomainTile ] }`. A `DomainTile` is `{ name, path, layer, layerLabel, purpose, meta?: [{key?,value}],
deps?: string[], href? }`. **`purpose` is required content** — a tile with an empty purpose warns. An
absent `href` renders a "page pending" tile (a domain you've named but not yet deep-dived).

### Domain lead + big idea (`domain-tldr`)

The domain page's opener: `{ "type": "domain-tldr", "id": "tldr", "eyebrow": "Domain", "heading": "…",
"rows": [{key,value}], "bigIdea": { "label": "…", "line": "…", "sub": "…" } }`. The `bigIdea` is the
one load-bearing insight about the domain, pulled out as a headline.

### Derived child cards and reading paths

Child cards are generated from configured child `title` and `purpose`; do not author a second copy
inside the page JSON. Keep a purpose to roughly 40 words or fewer. It should answer the reader's
question “why would I open this?” rather than list internal identifiers. A parent summarizes; the
child page is the single home for detailed claims.

Reading paths are ordered configured page IDs, declared on the system or a domain. They reuse
canonical pages for goals such as “Understand one interview turn” instead of duplicating content.
Each path renders only on the system or domain landing page where it is declared; topic pages stay
focused on their own mechanism and nearby-page navigation.
Related-page IDs provide curated lateral links, including across domains.

### Topic lead (`topic-tldr`)

The direct-entry explanation:

    { "type": "topic-tldr", "id": "tldr", "heading": "Context building",
      "summary": "Builds the ordered input used for one model call.",
      "when": "Immediately before the model call",
      "inputs": ["stored messages", "stored summaries"],
      "outputs": ["ordered model context"] }

Use plain language in `summary`; names and file paths belong in the implementation reference.

### Ordered behavior (`topic-flow`)

    { "type": "topic-flow", "id": "flow", "title": "How it works",
      "steps": [
        { "title": "Load state", "body": "Read the durable conversation state." },
        { "title": "Fit the budget", "body": "Compact older content when needed." }
      ] }

Use for a mechanism, algorithm, or lifecycle with a meaningful order. Each stage states the action
and why it matters; avoid one stage per function call.

### Guarantees and failures (`topic-rules`)

    { "type": "topic-rules", "id": "rules", "title": "Guarantees and failures",
      "guarantees": ["Recent turns preserve their order."],
      "failures": [
        { "condition": "Input exceeds the context budget",
          "behavior": "Older content is compacted before assembly continues." }
      ] }

Keep guarantees distinct from fallbacks. A failure row is explicit condition → observable behavior.

### Collapsed source index (`implementation-reference`)

    { "type": "implementation-reference", "id": "reference",
      "title": "Implementation reference",
      "groups": [
        { "label": "Context assembly",
          "files": [{ "name": "apps/api/src/context/build.ts", "desc": "Orders input." }] }
      ] }

This renders as closed `<details>`. The narrative should remain understandable without expanding it.
Groups mirror reader-facing source labels from config. Topic source groups support `include` plus
optional `exclude`; they may span folders, overlap other groups/pages, and never claim ownership.
Every matched file participates in that page's independent fingerprint and is deduplicated within
the page before hashing. Independent pages can still become stale together when their scopes
overlap; independent means each is reviewed and stamped on its own.

### Component cards → deep dives (`components` + `depth`)

These remain useful for a compact implementation inventory. Do not use them to avoid extracting a
coherent mechanism into its own topic page. When present, each card links to its matching deep
section.

`components`: `{ "type": "components", "id": "components", "title": "Components", "cards": [
{ name, purpose, exports?: [{name, deputy?}], exportsLabel?, href: "#c-gm" } ] }`. Each card's `href`
jumps to its deep section.

`depth`: `{ "type": "depth", "id": "depth", "title": "In depth", "components": [ ComponentDeep ] }`.
A `ComponentDeep` is the heart of the reference layer:

    { "id": "c-gm", "name": "gm", "path": "lib/brain/gm",
      "detail": ["… paragraph (inline md) …"],          // the prose
      "files":   [{ "name": "gm/plan/types.ts", "desc": "…" }],   // "Key files"
      "exports": [{ "name": "computeGMAssessment()", "desc": "…" }], // "Key exports"
      "connections": [{ "dir": "produces|calls|reads|consumes", "body": "… inline md, link neighbors …" }],
      "diagrams": [ AtlasDiagram ],   // 0..n, optional
      "codeHtml": "…" }               // optional raw highlighted code block

Connections are where a domain page earns its keep — link to neighbor pages by anchor, e.g.
`[sim](../domain-sim/domain-sim.html#c-contracts)` (each domain is its own folder, so cross-domain
links go up one level: `../domain-<other>/domain-<other>.html#anchor`).

### Data owned (`owns`)

The models/tables the domain owns: `{ "type": "owns", "id": "data", "title": "Data it owns",
"intro": "…", "rows": [{ "name": "GMProfile", "desc": "…" }], "note": "…" }`. `name` renders mono;
`desc`/`note` are inline markdown. (Model→domain attribution is a judgment call — the scanner leaves
this for you to author.)

### Worked trace (`example` block)

One real request/record walked through a domain or topic — the shared `example` block (see the
[spec catalog](spec-components.md#worked-example-input--stages--lesson) for the full recipe and
rendered-HTML shape). `source` and `lesson` are required, same as everywhere else it's used. Use it
on a domain or topic with a meaningful runtime/data path (the reader needs to see something move);
skip it for pure utilities or static configuration where there is no interesting trace.

### Seams (`seams`)

The bounded-context edges — what the domain exposes and what it leans on:

    { "type": "seams", "id": "seams", "title": "Seams", "intro": "…",
      "exposes": [{ "api": "computeGMAssessment()", "note": "…" }],
      "depends": [{ "name": "sim", "path": "lib/sim", "href": "../domain-sim/domain-sim.html" }],
      "note": "…" }

A `depends` entry with an `href` links to that neighbor's page; without one it renders flat (a
neighbor with no page yet).

### Hierarchical navigation and search (automatic)

Every page derives breadcrumbs, a sidebar with only the current branch expanded, child cards,
parent/sibling footer, related links, reading paths, and an embedded structured search index. Search
matches page titles, purposes, aliases, identifiers, source paths, and breadcrumb labels; results show
breadcrumb and purpose. It does not index every prose token. Existing depth components can still
render as a nested in-page outline.

## The standard (lint floor)

`lint-atlas.ts` reports editorial warnings separately from hard checker integrity failures:

- **Atlas:** no `atlas-tldr`; no domain map (neither a `domain-map` block nor a `"map"`
  diagram-section); no `domain-index`; a tile with an empty `purpose`.
- **Domain:** no `domain-tldr`, useful diagram, clear child purposes, or `seams`. A domain with child
  topics is orientation-first and does not require `depth`.
- **Topic:** no `topic-tldr` or the structured flow/rules appropriate to its configured shape.
- **Readability:** child purpose over roughly 40 words, paragraph over roughly 100 words, domain over
  about 1,200 visible prose words, topic over about 2,000, multiple independently explainable
  mechanisms, or project-history language.

Close every hard integrity error. Inspect every readability warning and shorten, restructure, remove
history, or author a child extraction when that makes the page clearer. The renderer never auto-splits.
