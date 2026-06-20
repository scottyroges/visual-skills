# Atlas-Component Catalog

Reusable layout components for a **visual atlas** — a standing, self-contained map of a codebase's
domains and architecture. The atlas is **two levels**: one `atlas.html` (the system onboarding map)
that links down to per-domain `domain-<slug>.html` deep-dive + reference pages. Sibling to the
[Diagram Catalog](diagrams.md) (the d2/mermaid diagrams the renderer compiles) and the
[Spec-Component Catalog](spec-components.md) (whose card vocabulary the domain pages reuse).

**Worked reference:** [`example/atlas-sports-rpg/`](../../example/atlas-sports-rpg/) — `atlas.json →
atlas.html` plus a `domain-<slug>/` folder per domain (`domain-<slug>.json → domain-<slug>.html`).
The canonical "what good looks like" build; every recipe below is lifted from it.

**Layout.** The atlas page sits at the top of the out dir; **each domain lives in its own
`domain-<slug>/` folder** holding its page, JSON, and diagram sidecars — so two domains' editable
`.excalidraw` scenes never collide. Cross-page links account for the nesting (see the recipes:
tiles link `domain-<slug>/…`, back-links and cross-domain links go `../`).

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
+ classes). You don't write that HTML by hand: you author **typed JSON blocks** in an `atlas.json` /
`domain-<slug>.json`, and `assemble-atlas.ts` generates the HTML. The exact JSON field shape of every
block is defined and commented in [`src/atlas-blocks.ts`](../../src/atlas-blocks.ts) — **read it as
you author.**

**Hybrid generation.** Unlike the spec (pure authoring), the atlas starts from a **mechanical scan**:
`atlas --repo <abs> --out <dir>` walks the codebase, groups modules into domains via the committed
`atlas.domains.json`, and emits *draft* `atlas.json` + `domain-<slug>.json` with the structure filled
and the prose blank. You then **enrich** the drafts (write the purposes, the "why", the connections,
pick diagrams) and render. The scanner does the inventory; your judgment does the meaning.

## Page options

Top-level fields of the JSON doc (NOT blocks — they drive the page chrome). Their shapes are in
`src/atlas-blocks.ts` (`AtlasOpts` / `DomainOpts`):

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

## The two section ladders

The renderer derives the sidebar + progress rail from the block order; the rail auto-places right
after the `*-tldr` lead. Author blocks top-to-bottom in these orders.

**Atlas page** (onboarding map):

1. `atlas-tldr` — the "Start here" lead.
2. `domain-map` — the hero: all domains + cross-domain edges.
3. `diagram-section` ("spine") — the runtime loop, one illustrating diagram.
4. `domain-index` — the grid of domain tiles (the map + the reference index).

**Domain page** (deep dive → reference):

1. `domain-tldr` — what this domain owns, why it exists.
2. `components` — the cards: every module/service, scannable, each linking to its deep section.
3. `diagram-section` ("internal-arch") — how the pieces wire up.
4. `depth` — one full section per component (files, exports, connections, optional diagrams).
5. `owns` — the data/models the domain owns.
6. `seams` — what it exposes and what it depends on from neighbors (with links).

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

### Component cards → deep dives (`components` + `depth`)

The cards are the scannable overview; the `depth` block is the full treatment each card links to.

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

### Seams (`seams`)

The bounded-context edges — what the domain exposes and what it leans on:

    { "type": "seams", "id": "seams", "title": "Seams", "intro": "…",
      "exposes": [{ "api": "computeGMAssessment()", "note": "…" }],
      "depends": [{ "name": "sim", "path": "lib/sim", "href": "../domain-sim/domain-sim.html" }],
      "note": "…" }

A `depends` entry with an `href` links to that neighbor's page; without one it renders flat (a
neighbor with no page yet).

### Nested sidebar (automatic)

The depth components render as a nested outline under the "In depth" chapter (`.outline-sub` /
`.outline-subitem` with a layer-colored `.os-dot`), and the atlas sidebar derives a "Domains" nav
from the tile index (`.nav-domains` / `.nav-domain`, pending tiles dimmed). You don't author these —
they fall out of the `depth` and `domain-index` blocks.

## The standard (lint floor)

`lint-atlas.ts` warns (never throws) when a page falls below the demo standard, surfaced through the
render's `onWarn`. The canonical renders clean; a bare or unenriched draft warns:

- **Atlas:** no `atlas-tldr`; no domain map (neither a `domain-map` block nor a `"map"`
  diagram-section); no `domain-index`; a tile with an empty `purpose`.
- **Domain:** no `domain-tldr`; no `components`; a large domain (many depth components) with no
  internal-arch `diagram-section`; no `seams`.

Close every warning before shipping — they double as a checklist for enriching the scanner draft.
