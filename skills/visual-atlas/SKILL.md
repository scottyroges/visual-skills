---
name: visual-atlas
description: Use when the user asks to map, document, or "make sense of" a whole codebase's domains and architecture as a standing self-contained HTML atlas — an onboarding map of the system plus per-domain deep-dive/reference pages. For orienting newcomers and as a lookup reference; not a single change (visual-recap), proposal (visual-spec), or plan (visual-doc), but the architecture that already exists.
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

**Tool location** (resolved through the installer's `~/.claude/visual-skills` symlink — re-run `npm run skills:install` if the repo moves):

    VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"

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
- You enriched pages but never ran `atlas-check.mjs --stamp` — unstamped pages fail the drift check
  in any repo that wires it into pre-commit.

## Workflow (three modes)

`bin/atlas.ts` has three operation modes. The artifact set lives in `--out` (a *directory*, absolute
path — e.g. `<repo>/.visual/atlas`), all committable and re-renderable. **Each domain gets its own
folder** so its diagram sidecars stay self-contained (no cross-domain collisions):

    .visual/atlas/
      atlas.domains.json        # the grouping config (human-owned source of truth)
      atlas.json  atlas.html    # the atlas page blocks + rendered output
      <atlas diagrams>.excalidraw
      domain-<slug>/
        domain-<slug>.json  domain-<slug>.html
        <that domain's diagrams>.excalidraw

Cross-page links follow the layout: an atlas tile → `domain-<slug>/domain-<slug>.html`; a domain's
"← Atlas" back-link → `../atlas.html`; a domain→domain link (seams/connections) →
`../domain-<other>/domain-<other>.html#anchor`.

### 1. Full scan (the main path)

1. **Scan.** From the tool dir so deps resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/atlas.ts --repo <ABSOLUTE_SUBJECT_REPO> --out <ABSOLUTE_OUT_DIR>

   This walks the repo (codegen, test trees, and co-located `*.test.*` / `*.spec.*` files are
   excluded — they aren't architecture), creates `atlas.domains.json` from a **folder first-guess**
   if absent (or **reconciles drift** against your edits if present — reporting unassigned modules /
   stale paths / empty domains), emits draft `atlas.json` + `domain-<slug>.json` *only where absent*
   (it never clobbers your authored prose), and renders.

2. **Curate the grouping — usually required, not optional.** Open `atlas.domains.json`. The
   first-guess is one domain per top-level dir, which on a **layered** codebase (a `routers/` +
   `services/` + `repositories/` split, or `app/` + `lib/` + `server/`) produces exactly the flat
   folder grouping this skill forbids — one giant "server" tile is not a domain. For anything beyond
   a small or already feature-foldered repo, **rewrite the domains as feature/bounded-context slices**
   with file-precise `globs` (e.g. `["src/server/routers/picks*.ts", "src/server/services/pick*.ts"]`)
   and re-run the scan. Regrouping is deterministic; the `globs` are the human lever. After a
   regroup, **delete any orphaned `domain-<slug>/` folder** for domains you renamed or removed — the
   scan warns about them (it never deletes files), and a stale one would still render a dead page.
   You may write `atlas.domains.json` by hand with just `slug` / `name` / `globs`; the scanner fills
   in the resolved `modules`.

3. **Read the code, then enrich the drafts.** Open the actual modules — don't work from the draft
   skeleton alone. The scanner groups `depth` components by immediate subdirectory; on a layered
   domain that can blob many files into one card, so **expect to rebuild the `components`/`depth`
   blocks into meaningful units** (e.g. "ESPN provider", "sync service", "cron orchestrator"), not
   just fill blanks. Fill, per the **catalog**:

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

6. **Stamp what you just verified.** Every scan/render also emits `atlas-check.mjs` into the out
   dir (see "Keeping the atlas honest" below). Finish by stamping — this records, per domain page,
   a hash of the source it was verified against:

       node <ABSOLUTE_OUT_DIR>/atlas-check.mjs --stamp

   Only stamp pages whose prose you actually wrote or reviewed this run — for a partial pass,
   stamp just those domains (`--stamp <slug> …`).

### 2. Single domain

Refresh one domain after its code changed — regenerates that page's draft and re-renders just it; the
atlas's `domain-map` is **not** recomputed (a tile-drift note is printed so you can trigger a full run
if a cross-domain edge changed):

    npx tsx bin/atlas.ts --repo <ABSOLUTE_SUBJECT_REPO> --domain <slug> --out <ABSOLUTE_OUT_DIR>

(`--domain` regenerates the draft — re-apply enrichment, or pass nothing and keep your committed page
and just re-render via mode 3.) After re-enriching, re-stamp that domain:
`node <ABSOLUTE_OUT_DIR>/atlas-check.mjs --stamp <slug>`.

### 3. Render-only (reproduce)

Re-render committed JSON with no scan — the recap/spec reproducibility pattern:

    npx tsx bin/atlas.ts --blocks <ABSOLUTE_OUT_DIR>/atlas.json --out <ABSOLUTE_OUT_DIR>   # one page
    npx tsx bin/atlas.ts --all   <ABSOLUTE_OUT_DIR>          --out <ABSOLUTE_OUT_DIR>      # atlas + every domain page
    open <ABSOLUTE_OUT_DIR>/atlas.html

## Keeping the atlas honest (drift + verification)

Every scan and `--all` render copies **`atlas-check.mjs`** — a self-contained, tool-owned Node
script — into the out dir. Target repos commit it and run it from pre-commit/CI with plain Node
(no visual-skills checkout needed). It checks three deterministic layers:

1. **Coverage** — every source module under the config's `srcRoots` is matched by a domain glob;
   no recorded module is stale; no domain is empty or missing its page.
2. **Grounding** — the structured claims on each domain page (`exports[].name`, depth
   `files[].name`, seams `exposes[].api` routes) still exist in that domain's source. Catches
   renamed exports, moved files, and changed routes even when file coverage is unchanged.
3. **Stamps** — each domain page carries `verifiedAgainst: { hash, date }` (sha256 over the
   domain's module contents when its prose was last verified). A mismatch means the code changed
   since anyone last read the page.

Commands (from the subject repo):

    node .visual/atlas/atlas-check.mjs                 # check — wire this into pre-commit/CI
    node .visual/atlas/atlas-check.mjs --stamp         # re-stamp every page
    node .visual/atlas/atlas-check.mjs --stamp <slug>  # re-stamp one page

**The maintenance loop this creates:** a failing stamp is a *review request*, not a formality.
Re-read the changed domain's diff against its page, fix the prose (and re-render) if the change
was architecturally meaningful, then re-stamp. Never stamp a page you haven't just read against
the current code — the stamp's only value is that it means a human/Claude actually looked.
Grounding and stamps verify structured claims and attention; only that review verifies prose.

That review loop is its own skill: **atlas-review** (`skills/atlas-review/SKILL.md`). Use it —
not a full rescan — when an existing atlas fails the check or the user asks to re-verify the
atlas against the code. Stamps record the git commit they were made at, so atlas-review can diff
precisely from the last verified state.

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

The canonical reference build (what good looks like):

    $VISUAL_SKILLS_DIR/example/atlas-ppgl/   (atlas.{json,html} + domain-<slug>/domain-<slug>.{json,html})
