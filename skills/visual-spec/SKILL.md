---
name: visual-spec
description: Use when the user asks to visualize, render, or "make readable" a design spec / design doc / RFC / proposal as a self-contained HTML page — to get a reader up to speed fast and let them approve it. Covers superpowers specs (docs/superpowers/specs), design docs, and RFCs grounded in the real document.
---

# Visual Spec

Turn a design spec (a markdown design doc / RFC / proposal) into a single self-contained HTML
**page that gets a reader up to speed fast — then lets them approve it** — and open it.

**The deliverable is an orientation-to-approval narrative, never a flat re-render of the markdown.**
A cold reader must grasp *what this is and why* in ~60 seconds, then drill down far enough to **sign
off**: the load-bearing decisions (with their rationale), the scope, what "done" means, the risks,
and what approval commits to. Re-typesetting the doc's headings is **not** the job — *reframing* it
into the component ladder is.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

You author a `spec.json` (page options + an ordered array of blocks) and render it. There is no
mechanical gather step — the spec's prose is the raw material; your judgment turns it into blocks.

## The standard — definition of done

A finished visual spec **always** has, regardless of spec size:

- **An authored title + topbar chips** — `phase`, `status`, `date`, `complexity`.
- **A `tldr` block, placed FIRST** — `heading` + rows (What / Why / Closes / Size). For anything but
  a tiny spec, also the **big-idea line**: the single load-bearing insight pulled out as a headline.
- **Key `decisions`** — the load-bearing choices, each with a one-line **`why`** (the rationale an
  approver scrutinizes), and a **`rejected`** alternative on the 2–3 most contested ones.
- **A `scope` block** — in / out (anti-goals). Boundaries are approval-critical.
- For a **larger** spec, also: a **hero `diagram`** (one architecture/flow picture — *new vs
  preserved*), a gated **`rollout`**, a **definition of done** (`done`: targets, before→after), and
  a **`approve`** band (what sign-off commits to · the riskiest seam · open questions).
- **Reference depth in collapsed drawers** (`reference`) — full type defs, tables, algorithms — out
  of the orientation layer.

**Size scales the ceiling, it never lowers the floor.** A small spec may drop the hero, rollout, and
approval band — but it still gets the TL;DR, the decisions *with why*, and the scope. See
"Scaling by size".

### Red flags — you stopped too early

If any of these is true, the page is **not done** — keep going:

- `spec.json` has no `tldr`, or the TL;DR has no big-idea line on a non-trivial spec.
- There is no `decisions` block, or decisions list choices with **no `why`**.
- No decision names a **rejected** alternative on a large/contested spec.
- There is no `scope` block.
- A large spec has no hero diagram, no `rollout`, or no `approve` band.
- The reference depth (type defs, big tables) is dumped into the orientation flow instead of
  collapsed `reference` drawers.
- The tool printed completeness warnings. **Those mean below standard — fix `spec.json` and
  re-render until they are gone.**

## Workflow (one required path)

1. **Identify** the spec file (absolute path) and the output folder (`--out` is a *directory*, e.g.
   `<repo>/.visual/specs/<short-label>` or alongside the spec, absolute path).

2. **Read the whole spec AND the code/specs it references.** Open the referenced source modules and
   sibling specs so every section is grounded in what the change actually does — do not work from the
   spec's prose alone. Note its predecessor/consumer specs (for *where it fits*).

3. **Decide the reframing.** Map the spec onto the section ladder (below). Identify: the one-line
   *what/why*, the single big idea, the new-vs-preserved picture, the peer components, the locked
   decisions (which 2–3 were contested), the scope boundaries, the phases + gates, the success
   targets, the risks, and the open questions.

4. **Author `spec.json`** — page options + the ordered blocks (shape in "The `spec.json` shape"
   below). The **spec-component catalog** shows what each component looks like and when to use it:

       $VISUAL_SKILLS_DIR/skills/shared/spec-components.md

   The catalog's snippets are the rendered **HTML output**; you author typed **JSON blocks** and the
   renderer produces that HTML. The exact JSON field shape of every block is defined and commented in
   `$VISUAL_SKILLS_DIR/src/spec-blocks.ts` — **read it as you author.** Fill the floor first (tldr +
   big idea, decisions with why + rejected, scope), then the size-scaled surfaces. Short text fields
   are **inline markdown** (`code`, **bold**, *em*, `[link](#id)`); cross-link the approval band's
   "scrutinize" to a reference drawer by id (e.g. `#ref-sites`).

5. **Author the hero diagram** as a `diagram` block (kind `architecture`/`flowchart`/`sequence`),
   using the **diagram catalog** recipes + color vocabulary — mark the new subject `changed`, leave
   preserved layers `external`, tag datastores `store`. Carry `mermaid` so it stays editable.

       $VISUAL_SKILLS_DIR/skills/shared/diagrams.md

6. **Render and open.** Writes `spec.html` (and re-writes `spec.json`) into the folder, so it stays
   self-contained and re-renders in place:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/spec.ts --blocks <ABSOLUTE_OUT_DIR>/spec.json --out <ABSOLUTE_OUT_DIR>
       open <ABSOLUTE_OUT_DIR>/spec.html

7. **Read the tool's warnings and close them.** The renderer lints for the standard (missing
   TL;DR/big-idea, decisions without why, no scope, a large spec missing a hero/rollout/approve).
   Edit `spec.json` and re-run step 6 until the render is clean.

## The `spec.json` shape

A single JSON object: **page options at the top level**, then a `blocks` array. The page options
populate the topbar chips, the sidebar "Related" list, and the sidebar "Meta" list — they are NOT
blocks, so their shape is not in `spec-blocks.ts`:

    {
      "title":      "Spec · <name>",            // topbar title (required)
      "phase":      "Phase 2m",                  // topbar chip (optional)
      "status":     "Brainstormed → Ready for plan",  // topbar chip (optional)
      "date":       "2026-05-31",                // topbar chip (optional)
      "complexity": "Large · high blast-radius", // topbar chip (optional)
      "related":    [{ "kind": "Predecessor", "value": "cap-spend-value-model · shipped" }],
                                                 // sidebar "Related" — PLAIN STRINGS {kind, value}, no links
      "meta":       [{ "key": "Status", "value": "ready for plan" }],
                                                 // sidebar "Meta" — PLAIN STRINGS {key, value}
      "blocks":     [ … ordered SpecBlock objects (see src/spec-blocks.ts) … ]
    }

`related` and `meta` are arrays of plain-string pairs (`{kind, value}` / `{key, value}`) — **not
link objects**. Every block object's fields are in `src/spec-blocks.ts`.

## Scaling by size

The floor is the same for everyone; only the ceiling moves. **"Large" is measured by section count,
not the `complexity` chip:** once a spec carries **5+ chapter sections** (everything except `tldr`
and `reference`), the completeness lint expects the fuller treatment — a hero `diagram`, a `rollout`,
and an `approve` band — and a big-idea line on the TL;DR. A genuinely small spec stays under that and
those surfaces are optional. If you find yourself with 5+ sections, add them for real (grounded in
the doc), don't pad — a 5-section design almost always *has* a build order and warrants an approval
band.

| Element | Small spec | Medium | Large (multi-phase, high blast-radius) |
|---|---|---|---|
| `tldr` rows (What/Why/Closes/Size) | **required** | **required** | **required** |
| big-idea line | optional | **yes** | **yes** |
| `decisions` with `why` | **required** | **required** | **required** |
| `rejected` on contested decisions | optional | 1–2 | **2–3** |
| `scope` (in/out) | **required** | **required** | **required** |
| hero `diagram` | optional | usually | **yes** |
| `components` (+ anatomy) | if it has peer pieces | **yes** | **yes** |
| `fits` (predecessor → this → consumer) | optional | usually | **yes** |
| `rollout` (gated phases) | if phased | if phased | **yes** |
| `done` (targets, before→after) | if measurable | **yes** | **yes** |
| `risks` | optional | **yes** | **yes** |
| `approve` band | optional | usually | **yes** |
| `reference` drawers | as needed | **yes** | **yes** |

A small spec is still a finished page: a TL;DR, the decisions *with why*, and the scope — never just
the doc's prose reflowed.

## The section ladder (orientation → approval)

Author blocks top-to-bottom in this order (the renderer derives the sidebar + progress rail from
them; the rail auto-places after the TL;DR):

1. `tldr` (+ big idea) — the lead.
2. `diagram` — the hero: what's new vs what's preserved.
3. `components` (with optional `anatomy`) — the structure, made scannable.
4. `fits` — predecessor → this → consumer, plus the layer stack.
5. `decisions` — choice + **why**, with **rejected** on the contested ones.
6. `scope` (in/out) → `rollout` (gated) → `done` (targets) → `risks`.
7. `approve` — the reviewer's capstone.
8. `reference` — full depth, collapsed.

(`spec-prose` is an escape hatch — a markdown block for anything the modeled types don't cover.)

See the catalog for the exact field shape of every block.

## Fallbacks

- **`d2` missing:** the hero degrades to a visible placeholder (the page still produces) — tell the
  user to `brew install d2` for a proper rendered diagram.
- **d2 vs Excalidraw:** diagrams render as static D2 images by default; once the editable upgrade is
  installed (`npm run setup:excalidraw`) editable-eligible diagrams are **promoted to `.excalidraw`
  scenes automatically**. Pass **`--no-excalidraw`** (or set `"excalidraw": false` in the spec JSON)
  to force the static D2 floor.
- The reference drawers accept either `markdown` (fenced code + tables) or raw `html` (for
  syntax-highlighted code using the `.kw`/`.ty`/`.cm` token spans). Prefer `markdown`; use `html`
  only when you need the token coloring.

## Example

    cd "$VISUAL_SKILLS_DIR"
    # 2–5. read the spec + referenced code; author spec.json per the catalog
    # 6. render + open
    npx tsx bin/spec.ts \
      --blocks /Users/me/Projects/app/.visual/specs/auth-rework/spec.json \
      --out    /Users/me/Projects/app/.visual/specs/auth-rework
    open /Users/me/Projects/app/.visual/specs/auth-rework/spec.html
    # 7. fix any warnings the render printed, then re-render

The canonical reference build (what good looks like):

    $VISUAL_SKILLS_DIR/example/spec-gm-planning-brain/  (spec.json → spec.html)
