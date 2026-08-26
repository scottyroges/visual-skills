---
name: visual-atlas
description: Use when the user asks to map, document, or make sense of a whole codebase as a standing self-contained HTML atlas. Produces orientation-first system and domain pages plus recursive conceptual topics for focused technical depth.
---

# Visual Atlas

Turn a codebase into a standing, self-contained explanation of its current architecture — and open
it. The output is a recursive topic tree in the established app-shell language:

```text
System
├── Domain
│   └── Topic
│       └── Nested topic
└── Root-level topic
```

System and domain pages orient the reader; topic pages explain one mechanism in depth. The page
hierarchy follows the reader's mental model, not the filesystem. A newcomer should grasp what the
system is in about 60 seconds, choose a relevant domain, and open only the depth they need.

**Tool location** (resolved through the installer's `~/.claude/visual-skills` symlink — re-run `npm run skills:install` if the repo moves):

    VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"

**Required language guide.** Before writing user-facing text, read
`$VISUAL_SKILLS_DIR/skills/shared/plain-language.md`. Apply it to every authored field and live
reply.

Unlike `visual-spec` (pure authoring), the atlas is **hybrid**: a mechanical scanner inventories the
repo and emits draft JSON; you author the reader-owned hierarchy, write the meaning, and render. The
scanner may suggest extraction candidates, but the scanner never creates, moves, or mutates a page
or the recursive topic tree.

Read the component catalog at `$VISUAL_SKILLS_DIR/skills/shared/atlas-components.md`, the diagram
catalog at `$VISUAL_SKILLS_DIR/skills/shared/diagrams.md`, and exact JSON shapes in
`$VISUAL_SKILLS_DIR/src/atlas-blocks.ts` while authoring.

## Editorial contract

1. **Orientation before depth.** A landing page helps someone choose what to open; it does not copy
   every child explanation.
2. **One home per fact.** Explain a mechanism fully on one canonical page. Parents summarize and
   link to that home.
3. **Current truth, not project history.** Remove task narration, PR and review-round history,
   superseded behavior, migration chronology, and cumulative “then we changed…” prose.
4. **Reader structure is not file structure.** A topic may be grounded in one file, one folder, or
   evidence spread across folders and domains.
5. **Progressive disclosure without dead ends.** Every page works on direct entry and links clearly
   to its parent, children, siblings, and related pages. Curated reading paths appear on the system
   or domain landing page that owns them, where they help readers choose a route through the atlas.

## The standard — definition of done

A finished atlas **always** has, regardless of repo size:

- **`atlas.html` with:** an **`atlas-tldr`** ("Start here") — what the system does in one line + a 3–5
  item primer of what to hold in your head; the **`domain-map`** (all domains + cross-domain edges);
  and the **`domain-index`** — a grid of domain tiles, each with a real **`purpose`** and (where the
  page exists) a link. Usually also a **`diagram-section`** (the "spine": the runtime loop).
- **Each domain landing with:** a **`domain-tldr`**; purpose, responsibilities, and boundaries; one
  useful architecture or runtime view; child page cards; owned data; important **`seams`**; and a
  compact implementation index. When children exist, the domain is orientation-first and a
  monolithic **`depth`** dump is not required.
- **Each topic page with:** a plain-language **`topic-tldr`**; the applicable flow or algorithm;
  guarantees and failures; a grounded example or diagram for multi-stage behavior; child cards; and a collapsed
  **`implementation-reference`**.

**Size scales the ceiling, never the floor.** A small repo may have just the atlas and one or two
domain pages. The system still gets its lead/map/index, each domain gets orientation and seams, and
each authored topic gets a direct-entry lead plus evidence appropriate to its shape.

### Red flags — you stopped too early

If any of these is true, the atlas is **not done** — keep going:

- `atlas.json` has no `atlas-tldr`, no `domain-map`, or no `domain-index`.
- A domain **tile has no `purpose`** (the scanner left it blank and you didn't fill it).
- A large domain explains every mechanism inline instead of giving substantial mechanisms their own
  child pages.
- A child page only repeats its purpose through empty or one-sentence scaffold blocks.
- Every topic uses the same four-block outline without shape-specific decisions, invariants, or evidence.
- A multi-stage mechanism has no grounded worked trace or diagram.
- A domain page has no **`seams`** — the reader can't see how it connects to its neighbors.
- A domain page describes a pipeline or flow in prose but shows nothing moving through it.
- Connections / detail prose is still the empty placeholders the scanner emitted.
- The tool printed completeness warnings. **Those mean below standard — enrich the JSON and re-render
  until they are gone.**
- You enriched pages but never ran `atlas-check.mjs --stamp` — unstamped system, domain, and topic
  pages fail the drift check in any repo that wires it into pre-commit.

## Discover behavior before choosing pages

The page tree is the result of source-grounded discovery, not the starting guess. After the
mechanical scan and before editing `atlas.domains.json` or page JSON, build a temporary discovery
brief. Keep it as working output for the run; the configured tree and rendered pages remain the
durable artifacts.

### Journey traces

Inventory user-facing adapters, runtime entrypoints, routes, jobs, and central orchestrators. Choose
the smallest representative set of user or system journeys that exposes the domain's meaningful
behavior, then follow each journey from its earliest meaningful preparation through externally
visible effects, termination, or recovery. Cross directory and domain boundaries when the calls,
data, or state do.

Each **journey trace** records:

- its trigger, entrypoint, boundary crossings, and central orchestrators;
- ordered phases, state transitions, and admission guards such as leases, budgets, or deadlines;
- asynchronous branches, their purposes, and the barrier or convergence point that joins them;
- durable writes and other externally visible effects;
- failure, cancellation, terminal signaling, recovery, and cleanup behavior;
- repository-relative source evidence for every claim.

Read complete orchestration functions and their material callees; filenames and import counts are
leads, not explanations. Search for companion entrypoints and variants that change the journey. A
trace that starts at an internal service despite earlier preparation, or ends at the first visible
response despite later settlement, is incomplete.

### Responsibility ledger

Convert the traces and source inventory into a de-duplicated **responsibility ledger**. Every row
contains the responsibility in reader language, why it matters, its evidence, the journey or invariant
that exposed it, and its **documentation disposition**. Assign each significant row to exactly one
of these outcomes:

- summarize it on the domain landing page;
- explain it on a topic or nested topic page;
- link to its canonical home in another domain or cross-cutting topic;
- omit it with a concrete reason, such as generated code or an incidental implementation detail.

"Not selected as a topic" is not an omission reason. Before choosing pages, challenge the ledger
against the central orchestrators: account for their meaningful phases, branching and convergence,
durable writes, terminal paths, and cleanup. A large domain is not covered merely because one
well-understood mechanism received a child page.

Close the brief with a coverage decision:

- make page source groups cover the evidence actually used during discovery;
- add related and reading-path links that preserve important cross-domain journeys;
- confirm every significant ledger row has a visible home, canonical link, or supported omission;
- include the discovery brief in the final handoff so the user can see what was considered and how
  it was dispositioned.

## Choose the page tree before writing prose

Use the completed responsibility ledger to start with reader questions. The domain landing gives a
high-level end-to-end account of its primary journeys, and every significant ledger row has a
visible home or link. Keep a subject on its domain landing when a concise summary is enough. Extract
a child when it has its own flow, rules, failure behavior, worked example, or implementation
evidence. Use a nested child when an internal algorithm deserves independent treatment, such as
`domain -> pricing -> discount selection`. A root-level topic belongs directly beneath the system
page when it crosses domains and has no natural domain owner.

Prefer at most two topic levels beneath a domain. Deeper authored trees remain valid, but warn so
you reconsider whether the branch should become a domain or cross-cutting topic. Do not split merely
to satisfy a word count: every page needs one coherent question and useful destination.

Choose an optional shape to guide the page ladder:

- `mechanism` — inputs, stages, outputs, safeguards;
- `algorithm` — objective, ordered logic, thresholds, edge cases, worked example;
- `data-model` — entities, relationships, ownership, lifecycle, constraints;
- `lifecycle` — states or phases, transitions, triggers, recovery;
- `integration` — boundary, protocol, request/response flow, failure behavior.

The shape is guidance, not permission to pad irrelevant sections.

## Earn every child page

Progressive disclosure moves explanation into a child page; it does not remove the explanation.
Before authoring each topic, derive a temporary **teaching brief** from the discovery evidence:

- the reader question and mental model the page will teach;
- the inputs, outputs, and state transformed;
- the decisions, invariants, thresholds, or transitions that make the behavior non-obvious;
- one grounded trace or representative case, including failure and externally visible outcome;
- the source evidence supporting each part.

Use the shape-specific teaching contracts in `skills/shared/atlas-components.md`. A page earns its
place when a reader can predict what the system will do in a representative case, not when every
block type exists. Clear every **hard integrity** problem before rendering or stamping. Treat each
substance **advisory** as a prompt to add explanation, a worked example, or a diagram—never word-count
padding.

## Authored configuration

`atlas.domains.json` owns both domain module grouping and the conceptual topic tree. These are
different relationships: domains own modules, while topics cite evidence without claiming ownership.

```json
{
  "repo": "shop-app",
  "srcRoots": ["apps", "packages"],
  "topics": [
    {
      "slug": "one-checkout",
      "title": "One checkout",
      "purpose": "How one purchase crosses the system.",
      "shape": "lifecycle",
      "aliases": ["checkout lifecycle"],
      "sources": [
        { "label": "Entry and orchestration", "include": ["apps/api/src/**/*checkout*.ts"] }
      ],
      "related": ["order-processing/pricing"]
    }
  ],
  "readingPaths": [
    {
      "title": "Understand one checkout",
      "pages": ["one-checkout", "order-processing/pricing"]
    }
  ],
  "domains": [
    {
      "slug": "order-processing",
      "name": "Order processing",
      "purpose": "Prices, accepts, and fulfills a purchase.",
      "globs": ["apps/api/src/orders/**"],
      "modules": [],
      "topics": [
        {
          "slug": "pricing",
          "title": "Pricing",
          "purpose": "How cart state becomes the final quoted total.",
          "shape": "mechanism",
          "aliases": ["quote", "cart total"],
          "sources": [
            {
              "label": "Quote assembly",
              "include": ["apps/api/src/pricing/**/*.ts"],
              "exclude": ["**/*.test.ts", "**/*.spec.ts"]
            },
            {
              "label": "Catalog prices",
              "include": ["packages/db/src/**/*price*.ts"]
            }
          ],
          "topics": [
            {
              "slug": "discount-selection",
              "title": "Discount selection",
              "purpose": "How eligible discounts are combined or rejected.",
              "shape": "algorithm",
              "sources": [
                {
                  "label": "Discount policy",
                  "include": ["apps/api/src/pricing/**/*discount*.ts"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Authors control slug, title, purpose, order, source scopes, children, related pages, and reading
paths. Slugs are stable page identities; moving or renaming one is explicit.

Each source group has a reader-facing label, one or more `include` globs, and optional `exclude`
globs. A source scope can span folders and domains. Scopes may overlap between pages and between
groups; every dependent page includes the shared file in its own fingerprint. All matching files
contribute at file granularity. An empty group is an integrity failure.

## Workflow (three modes)

`bin/atlas.ts` has three operation modes. The artifact set lives in one absolute `--out` directory,
all committable and re-renderable. Paths mirror the conceptual hierarchy:

    .visual/atlas/
      atlas.domains.json        # the grouping config (human-owned source of truth)
      atlas.json  atlas.html    # the atlas page blocks + rendered output
      <atlas diagrams>.excalidraw
      domain-<slug>/
        domain-<slug>.json  domain-<slug>.html
        <that domain's diagrams>.excalidraw
        <topic-slug>/
          <topic-slug>.json  <topic-slug>.html
          <nested-topic-slug>/
            <nested-topic-slug>.json  <nested-topic-slug>.html

The renderer derives stable relative links, breadcrumbs, a current-branch sidebar, child page card
navigation, parent/sibling links, related pages, owner-scoped reading paths on landing pages, and
structured search. Search uses titles, purposes, aliases, source paths, and breadcrumbs—not every
prose token.

### 1. Full scan (the main path)

1. **Scan.** From the tool dir so deps resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/atlas.ts --repo <ABSOLUTE_SUBJECT_REPO> --out <ABSOLUTE_OUT_DIR>

   This walks the repo, creates `atlas.domains.json` from a folder first-guess if absent, reconciles
   domain drift, resolves topic evidence, emits configured recursive drafts only where absent, and
   renders. It never clobbers authored prose unless `--force` is explicit.

2. **Discover behavior, then curate the grouping — usually required, not optional.** Build the
   journey traces and responsibility ledger above before you choose the reader hierarchy. Then open
   `atlas.domains.json`. The
   first-guess is one domain per top-level dir, which on a **layered** codebase (a `routers/` +
   `services/` + `repositories/` split, or `app/` + `lib/` + `server/`) produces exactly the flat
   folder grouping this skill forbids — one giant "server" tile is not a domain. For anything beyond
   a small or already feature-foldered repo, **rewrite the domains as feature/bounded-context slices**
   with file-precise `globs` (e.g. `["src/server/routers/picks*.ts", "src/server/services/pick*.ts"]`)
   and re-run the scan. Regrouping is deterministic; the `globs` are the human lever. After a
   regroup, **delete any orphaned `domain-<slug>/` folder** for domains you renamed or removed — the
   scan warns about them (it never deletes files), and a stale one would still render a dead page.
   You may write `atlas.domains.json` by hand; the scanner fills in resolved domain `modules` but
   never invents or rearranges `topics`.

3. **Enrich the drafts from the discovery and teaching briefs.** Open the actual modules again as needed — don't
   work from the draft skeleton alone. Replace generated structure and text with reader-owned units
   and current truth. Ensure every significant responsibility has the landing summary, child page,
   or canonical link assigned by its disposition.
   Fill, per the **catalog**:

       $VISUAL_SKILLS_DIR/skills/shared/atlas-components.md

   - the `atlas-tldr` heading + primer;
   - every tile and child purpose;
   - domain purpose, boundaries, ownership, seams, and useful next questions;
   - topic summary, shape-specific flow, decisions, guarantees, failure behavior, grounded trace,
     and source references.

   The exact JSON field shape of every block is defined and commented in
   `$VISUAL_SKILLS_DIR/src/atlas-blocks.ts` — **read it as you author.** Short text fields are inline
   markdown.

4. **Author the diagrams.** The scanner drafts an editable `architecture` domain-map and a stub
   internal-arch; upgrade them (and add per-component flows) using the **diagram catalog** recipes +
   color vocabulary — carry `mermaid` so editable kinds stay editable. Optionally replace the
   domain-map with a hand-authored `svg` for a curated layout.

       $VISUAL_SKILLS_DIR/skills/shared/diagrams.md

5. **Render and review signals.** Re-render and open `atlas.html`. Close every hard integrity error.
   Treat readability warnings as editorial prompts: shorten, restructure, remove history, or
   deliberately extract a child. Treat substance warnings as evidence that a child is still an
   outline. The linter never auto-splits or pads content.

6. **Stamp what you just verified.** Every scan/render also emits `atlas-check.mjs` into the out
   dir (see "Keeping the atlas honest" below). Finish by stamping — this records a per-page hash of
   the evidence it was verified against:

       node <ABSOLUTE_OUT_DIR>/atlas-check.mjs --stamp

   Only stamp pages whose prose you actually wrote or reviewed this run. Stable IDs are slash-joined
   paths such as `order-processing/pricing/discount-selection`.

### 2. Single domain

Refresh one configured domain subtree after its code changed:

    npx tsx bin/atlas.ts --repo <ABSOLUTE_SUBJECT_REPO> --domain <slug> --out <ABSOLUTE_OUT_DIR>

Refresh the journey traces and responsibility ledger before re-enriching, including upstream or
downstream boundary evidence when the changed behavior crosses domains. Then stamp only the pages
actually reviewed. A child topic has an independent stamp;
do not stamp its parent merely because it rendered in the same run. Independent does not mean
disjoint: overlapping evidence may legitimately make parent and child stale together.

### 3. Render-only (reproduce)

Re-render committed JSON with no scan — the recap/spec reproducibility pattern:

    npx tsx bin/atlas.ts --blocks <ABSOLUTE_OUT_DIR>/atlas.json --out <ABSOLUTE_OUT_DIR>   # one page
    npx tsx bin/atlas.ts --all   <ABSOLUTE_OUT_DIR>          --out <ABSOLUTE_OUT_DIR>      # every recursive page
    open <ABSOLUTE_OUT_DIR>/atlas.html

## Keeping the atlas honest (drift + verification)

Every scan and `--all` render copies **`atlas-check.mjs`** — a self-contained, tool-owned Node
script — into the out dir. Target repos commit it and run it from pre-commit/CI with plain Node
(no visual-skills checkout needed). It checks recursive integrity and freshness:

1. **Structure and coverage** — configured JSON/HTML pages, source groups, local links, page-tree
   identities, reading paths, search links, domain module coverage, and derived counts agree.
2. **Grounding** — named files, exports, and routes still exist in the page's evidence.
3. **Independent stamps** — each system, domain, and topic page carries `verifiedAgainst`. Topic
   fingerprints cover explicit sources plus child title/purpose summaries; domains cover owned
   modules plus child summaries; the system covers the authored tree and system summaries.
4. **Advisories** — density and historical-language observations print separately and do not make
   the checker fail by themselves.

Commands (from the subject repo):

    node .visual/atlas/atlas-check.mjs                 # check — wire this into pre-commit/CI
    node .visual/atlas/atlas-check.mjs --stamp         # re-stamp every page
    node .visual/atlas/atlas-check.mjs --stamp <page/id>  # re-stamp one page

**The maintenance loop this creates:** a failing stamp is a *review request*, not a formality.
Re-read only the stale page's evidence against its page, rewrite the smallest coherent current
explanation, then re-render and re-stamp. Never stamp a page you haven't just read against the
current code—the stamp's only value is that someone actually looked.
Grounding and stamps verify structured claims and attention; only that review verifies prose.

That review loop is its own skill: **atlas-review** (`skills/atlas-review/SKILL.md`). Use it —
not a full rescan — when an existing atlas fails the check or the user asks to re-verify the
atlas against the code. Stamps record the git commit they were made at, so atlas-review can diff
precisely from the last verified state.

## The block model

Each JSON doc is `{ "kind": "atlas"|"domain"|"topic", …page options…, "blocks": [ … ] }`. Page
options drive page chrome; derived navigation is supplied at render time. The block types:

- **Atlas page:** `atlas-tldr`, `domain-map`, `diagram-section`, `domain-index`.
- **Domain page:** `domain-tldr`, `components`, `diagram-section`, `depth`, `owns`, `example`, `seams`.
- **Topic page:** `topic-tldr`, `topic-flow`, `topic-rules`, `implementation-reference`, plus
  `diagram-section` and `example` when useful.

The catalog (`skills/shared/atlas-components.md`) shows what each renders to and when to use it; the
field shapes are in `src/atlas-blocks.ts`.

## Scaling by repo size

The floor is the same; only the ceiling moves.

| Element | Small repo (≤3 domains) | Large repo |
|---|---|---|
| `atlas-tldr` + primer | **required** | **required** |
| `domain-map` | **required** | **required** |
| `domain-index` (tiles w/ purpose) | **required** | **required** |
| spine `diagram-section` | usually | **yes** |
| per-domain page | the central 1–2 | **all domains** |
| `domain-tldr` + child choices | **required** | **required** |
| internal-arch `diagram-section` | if the domain is large | **yes** |
| recursive topic pages | when a mechanism merits depth | **expected** |
| `owns` (data) | if it owns models | **yes** |
| `seams` | **required** | **required** |

Don't pad — but a repo with several real domains warrants a page per domain. A "page pending" tile
(no `href`) is the honest way to name a domain you haven't deep-dived yet.

## Readability gate

The linter warns, but does not auto-transform, when prose is likely to overload a reader:

- child page card purpose around 40 words or fewer;
- paragraph at most four sentences or roughly 100 words;
- three or more parallel facts usually become a list or structured group;
- domain landing warning around 1,200 visible prose words;
- topic warning around 2,000 visible prose words;
- warnings for project history or multiple independently explainable mechanisms.

The remedy may be deletion, rewriting, restructuring, or an authored extraction. Do not silence a
warning by moving historical prose to another page.

## Fallbacks

- **`d2` missing:** diagrams degrade to visible placeholders (the atlas still produces) — tell the
  user to `brew install d2` for proper rendered diagrams.
- **d2 vs Excalidraw:** diagrams render as static D2 images by default and **stay that way unless you
  explicitly opt in** — the editable Excalidraw upgrade is off by default even after
  `npm run setup:excalidraw` is installed. To promote editable-eligible diagrams to `.excalidraw`
  scenes for a run, set **`"excalidraw": true`** in the atlas/domain JSON (or pass **`--excalidraw`**
  on `recap`, `spec`, and `doc`). `--no-excalidraw` (or `"excalidraw": false`) is still accepted as
  an explicit off, but it is now the default.
  Excalidraw support is **beta and export-only**: the atlas pages inline a static snapshot SVG, so
  editing a `.excalidraw` sidecar does not change the rendered page and re-rendering overwrites it —
  to change a diagram, edit its `d2`/`mermaid` source in the JSON and re-render.
- The `domain-map` can be the scanner's editable `architecture` diagram OR a hand-authored `svg`
  block — either satisfies the standard.

## Example

    cd "$VISUAL_SKILLS_DIR"
    # 1. scan
    npx tsx bin/atlas.ts --repo /Users/me/Projects/app --out /Users/me/Projects/app/.visual/atlas
    # 2-4. curate atlas.domains.json; read the code; enrich the draft JSON per the catalog
    # 5. re-render + open, fix warnings
    npx tsx bin/atlas.ts --all /Users/me/Projects/app/.visual/atlas --out /Users/me/Projects/app/.visual/atlas
    open /Users/me/Projects/app/.visual/atlas/atlas.html

The bundled base atlas/domain reference build:

    $VISUAL_SKILLS_DIR/example/atlas-ppgl/   (atlas.{json,html} + domain-<slug>/domain-<slug>.{json,html})
