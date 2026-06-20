---
name: visual-atlas
description: Use when the user asks to map, document, or "make sense of" a whole codebase's domains and architecture as a standing self-contained HTML atlas — an onboarding map of the system plus per-domain deep-dive/reference pages. For orienting newcomers and as a lookup reference; not a single change (visual-recap), proposal (visual-spec), or plan (visual-plan), but the architecture that already exists.
---

# Visual Atlas

Turn a codebase into a standing, self-contained **map of its domains and architecture** — and open
it. The output is **two levels** of HTML in the established app-shell language:

- **`atlas.html`** — one narrative onboarding map of the whole system.
- **`domain-<slug>.html`** — one deep-dive + reference page per domain, linked from the atlas.

**The deliverable is an onboarding-to-reference map, never a flat file/folder listing.** A newcomer
with zero context must grasp *what the system is and how it's carved up* in ~60 seconds from the
atlas, then drill into a domain page to actually understand it: what it owns, how its pieces wire up,
what it exposes, what it depends on. **Onboarding first** — when onboarding and reference conflict,
favor the newcomer.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

Unlike `visual-spec` (pure authoring), the atlas is **hybrid**: a mechanical scanner walks the repo
and emits *draft* JSON; you **enrich** the drafts (write the meaning) and render. The scanner does
the inventory; your judgment does the domains, the "why", and the connections.

## The standard — definition of done

A finished atlas **always** has, regardless of repo size:

- **`atlas.html` with:** an **`atlas-tldr`** ("Start here") — what the system does in one line + a 3–5
  item primer of what to hold in your head; the **`domain-map`** (all domains + cross-domain edges);
  and the **`domain-index`** — a grid of domain tiles, each with a real **`purpose`** and (where the
  page exists) a link. Usually also a **`diagram-section`** (the "spine": the runtime loop).
- **Each `domain-<slug>.html` with:** a **`domain-tldr`** (what it owns, why it exists); **`components`**
  cards (every module/service, scannable, each linking to its deep section); a **`diagram-section`**
  (internal-arch) when the domain is large; a **`depth`** block (one full section per component — Key
  files, Key exports, connections, optional diagrams); **`owns`** (the data it owns); and **`seams`**
  (what it exposes / depends on, with neighbor links).

**Size scales the ceiling, never the floor.** A small repo may have just the atlas + one or two domain
pages — but each page still gets its lead, its map/components, and its seams. See "Scaling by repo
size".

### Red flags — you stopped too early

If any of these is true, the atlas is **not done** — keep going:

- `atlas.json` has no `atlas-tldr`, no `domain-map`, or no `domain-index`.
- A domain **tile has no `purpose`** (the scanner left it blank and you didn't fill it).
- A domain page is just `components` cards with **no `depth` deep-dive** behind them — cards alone are
  too sparse to understand a domain.
- A domain page has no **`seams`** — the reader can't see how it connects to its neighbors.
- Connections / detail prose is still the empty placeholders the scanner emitted.
- The tool printed completeness warnings. **Those mean below standard — enrich the JSON and re-render
  until they are gone.**

## Workflow (three modes)

`bin/atlas.ts` has three operation modes. The artifact set lives in `--out` (a *directory*, absolute
path — e.g. `<repo>/.atlas`), all committable and re-renderable:

- `atlas.domains.json` — the grouping config (human-owned source of truth).
- `atlas.json` + `domain-<slug>.json` — the page blocks.
- `atlas.html` + `domain-<slug>.html` — the rendered, cross-linked output.

### 1. Full scan (the main path)

1. **Scan.** From the tool dir so deps resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/atlas.ts --repo <ABSOLUTE_SUBJECT_REPO> --out <ABSOLUTE_OUT_DIR>

   This walks the repo, creates `atlas.domains.json` from a **folder first-guess** if absent (or
   **reconciles drift** against your edits if present — reporting unassigned modules / stale paths /
   empty domains), emits draft `atlas.json` + `domain-<slug>.json` *only where absent* (it never
   clobbers your authored prose), and renders.

2. **Curate the grouping (optional but encouraged).** Open `atlas.domains.json`. The scanner's
   first-guess is one domain per top-level dir — merge, split, or rename domains by editing each
   domain's `globs` (the human lever) and re-run the scan. Regrouping is deterministic.

3. **Read the code, then enrich the drafts.** Open the actual modules — don't work from the draft
   skeleton alone. Fill, per the **catalog**:

       $VISUAL_SKILLS_DIR/skills/shared/atlas-components.md

   - the `atlas-tldr` heading + primer;
   - every tile `purpose` (and the `domain-tldr` + `bigIdea` on each domain page);
   - each `depth` component's `detail`, Key files, Key exports, and **connections** (link neighbor
     pages by anchor);
   - the `owns` rows and the `seams` exposes/depends.

   The exact JSON field shape of every block is defined and commented in
   `$VISUAL_SKILLS_DIR/src/atlas-blocks.ts` — **read it as you author.** Short text fields are inline
   markdown.

4. **Author the diagrams.** The scanner drafts an editable `architecture` domain-map and a stub
   internal-arch; upgrade them (and add per-component flows) using the **diagram catalog** recipes +
   color vocabulary — carry `mermaid` so editable kinds stay editable. Optionally replace the
   domain-map with a hand-authored `svg` for a curated layout.

       $VISUAL_SKILLS_DIR/skills/shared/diagrams.md

5. **Render and close warnings.** Re-render (render-only, below) and open `atlas.html`. The renderer
   lints for the standard (missing `atlas-tldr` / `domain-map` / `domain-index`, tiles without a
   purpose, a domain page missing `domain-tldr` / `components` / `seams` / a large domain's
   internal-arch). **Edit the JSON and re-render until the warnings are gone.**

### 2. Single domain

Refresh one domain after its code changed — regenerates that page's draft and re-renders just it; the
atlas's `domain-map` is **not** recomputed (a tile-drift note is printed so you can trigger a full run
if a cross-domain edge changed):

    npx tsx bin/atlas.ts --repo <ABSOLUTE_SUBJECT_REPO> --domain <slug> --out <ABSOLUTE_OUT_DIR>

(`--domain` regenerates the draft — re-apply enrichment, or pass nothing and keep your committed page
and just re-render via mode 3.)

### 3. Render-only (reproduce)

Re-render committed JSON with no scan — the recap/spec reproducibility pattern:

    npx tsx bin/atlas.ts --blocks <ABSOLUTE_OUT_DIR>/atlas.json --out <ABSOLUTE_OUT_DIR>   # one page
    npx tsx bin/atlas.ts --all   <ABSOLUTE_OUT_DIR>          --out <ABSOLUTE_OUT_DIR>      # atlas + every domain page
    open <ABSOLUTE_OUT_DIR>/atlas.html

## The block model

Each JSON doc is `{ "kind": "atlas"|"domain", …page options…, "blocks": [ … ] }`. Page options drive
the chrome (topbar chips, sidebar Meta, the domain page's layer accent + "← Atlas" back link); see
`AtlasOpts` / `DomainOpts` in `src/atlas-blocks.ts`. The block types:

- **Atlas page:** `atlas-tldr`, `domain-map`, `diagram-section`, `domain-index`.
- **Domain page:** `domain-tldr`, `components`, `diagram-section`, `depth`, `owns`, `seams`.

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
| `domain-tldr` + `components` | **required** | **required** |
| internal-arch `diagram-section` | if the domain is large | **yes** |
| `depth` deep-dive | **required** | **required** |
| `owns` (data) | if it owns models | **yes** |
| `seams` | **required** | **required** |

Don't pad — but a repo with several real domains warrants a page per domain. A "page pending" tile
(no `href`) is the honest way to name a domain you haven't deep-dived yet.

## Fallbacks

- **`d2` missing:** diagrams degrade to visible placeholders (the atlas still produces) — tell the
  user to `brew install d2` for proper rendered diagrams.
- Editable Excalidraw diagrams are an optional upgrade — see the tool's README
  (`npm run setup:excalidraw`). Without it, diagrams render as static D2 images.
- The `domain-map` can be the scanner's editable `architecture` diagram OR a hand-authored `svg`
  block — either satisfies the standard.

## Example

    cd "$VISUAL_SKILLS_DIR"
    # 1. scan
    npx tsx bin/atlas.ts --repo /Users/me/Projects/app --out /Users/me/Projects/app/.atlas
    # 2-4. curate atlas.domains.json; read the code; enrich the draft JSON per the catalog
    # 5. re-render + open, fix warnings
    npx tsx bin/atlas.ts --all /Users/me/Projects/app/.atlas --out /Users/me/Projects/app/.atlas
    open /Users/me/Projects/app/.atlas/atlas.html

The canonical reference build (what good looks like):

    $VISUAL_SKILLS_DIR/example/atlas-sports-rpg/   (atlas.json + domain-*.json → *.html)
