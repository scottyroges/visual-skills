# Semantic Color in Diagrams — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorming)

## Goal

Give every diagram one canonical, meaningful color vocabulary so a glance reads the story —
"what changed" leaps out, and actors / external systems / datastores are distinguishable by role.
Consolidates today's drift (the `dep-graph` producer fills "changed" light-green while
`api-diagram` uses yellow) into a single source of truth, and extends color to more roles.

This is spec 2 of 2 from the "great lead summary + colored diagrams" idea (spec 1 = the `overview`
block, shipped).

## Background

- d2 renders via `d2 --sketch --theme 0 --pad 24` (`src/render-diagram.ts:renderViaD2`). Theme 0
  is neutral, so today most diagrams are near-monochrome.
- An emergent, inconsistent palette already exists: `src/dep-graph.ts` fills changed nodes
  `#e6ffec` (d2 `style.fill` + a mermaid `classDef changed`); `src/api-diagram.ts` has its own
  `FILL` map (added `#e6ffec`, removed `#ffebe9`, changed `#fffdf3`) + mermaid classDefs. The two
  disagree on "changed".
- **Verified during brainstorming (real renders):**
  - A d2 `classes { … }` prelude coexists with plain / `sequence_diagram` / `sql_table` (ERD) /
    `class` shapes — sequence lifelines and ERD tables pick up `class:` fills.
  - Mermaid `classDef fill/stroke` + `class X role;` **carry into the editable Excalidraw scene**:
    the converted scene elements get real `backgroundColor`/`strokeColor` (not a flat image) and the
    exported SVG contains the palette hexes. So color survives on BOTH the d2 floor and the
    Excalidraw upgrade.

## Decisions (locked during brainstorming)

1. **Shared class library** — one canonical vocabulary, a d2 `classes` prelude injected at render
   time (+ a matching mermaid classDef set), not per-recipe inline fills.
2. **Palette: bold focus, soft rest** — the `changed` role is vivid so the subject pops; supporting
   roles are soft so they don't compete.
3. **Single `PALETTE` constant** generates both the d2 prelude and the mermaid classDefs (no drift).
4. **Base theme stays `--theme 0`** — the classes are the color signal, not theme noise.
5. **Color carries on both render paths** — d2 floor (via prelude + `class:`) and editable
   Excalidraw (via mermaid `classDef` + `class X role;`). A colored editable diagram must carry
   both representations.
6. **`prisma-schema` ERD gets color too** (changed/added tables) — on-theme and cheap.

## The vocabulary (6 roles)

| role | meaning | fill | stroke |
|---|---|---|---|
| `changed` | modified / the subject / focus (bold) | `#ffd43b` | `#f08c00` (stroke-width 2) |
| `added` | new | `#d3f9d8` | `#37b24d` |
| `removed` | deleted | `#ffe3e3` | `#f03e3e` |
| `actor` | user / initiator | `#d0ebff` | `#4dabf7` |
| `external` | third-party system / dependency | `#f1f3f5` | `#adb5bd` |
| `store` | datastore (db / cache / queue) | `#e5dbff` | `#9775fa` |

## Component 1 — `src/diagram-colors.ts` (new)

Single source of truth. Exports:

- `PALETTE: Record<Role, { fill: string; stroke: string; bold?: boolean }>` — the table above.
- `D2_CLASS_PRELUDE: string` — a `classes { … }` block derived from `PALETTE`, e.g.:

      classes: {
        changed: { style: { fill: "#ffd43b"; stroke: "#f08c00"; stroke-width: 2 } }
        added: { style: { fill: "#d3f9d8"; stroke: "#37b24d" } }
        …
      }

- `MERMAID_CLASSDEFS: string` — matching mermaid lines derived from the same `PALETTE`, e.g.:

      classDef changed fill:#ffd43b,stroke:#f08c00,stroke-width:2px;
      classDef added fill:#d3f9d8,stroke:#37b24d;
      …

Both strings are generated from `PALETTE` by small pure helpers (so a palette edit updates both).

## Component 2 — Inject the d2 prelude

In `src/render-diagram.ts:renderViaD2`, prepend `D2_CLASS_PRELUDE` to the source before writing
`in.d2` (e.g. `const full = D2_CLASS_PRELUDE + "\n" + source;`). Every diagram can now apply
`class: changed|added|removed|actor|external|store`; diagrams that don't are unaffected (unused
classes are harmless). Verified to coexist with all d2 shapes.

## Component 3 — Consolidate the producers onto the canonical classes

- **`src/dep-graph.ts`:** changed node → `class: changed` (d2) instead of `style.fill: "#e6ffec"`;
  mermaid uses `MERMAID_CLASSDEFS` + `class nX changed;` instead of its own inline `classDef`.
- **`src/api-diagram.ts`:** added/removed/changed procedures → canonical classes (`class: added`
  etc. in d2; `MERMAID_CLASSDEFS` + `class nX <role>;` in mermaid). Remove the local `FILL` map and
  hand-written classDefs.
- **`src/prisma-schema.ts`:** ERD tables — color changed tables `class: changed` and added tables
  `class: added` (d2-only; ERD isn't editable). (If the producer doesn't currently distinguish
  added vs modified tables, color what it knows — at minimum mark changed tables.)

## Component 4 — Catalog

In `skills/shared/diagrams.md`:
- Add a **"Color vocabulary"** section: the 6 roles + meanings, and how to apply
  (d2 `nodeName.class: <role>`; for editable kinds also `classDef`/`class X <role>;` in the
  mermaid — copy `MERMAID_CLASSDEFS`). Note the prelude is auto-injected, so recipes only *apply*
  classes, never define `classes {}` themselves.
- Update recipes with obvious roles to demonstrate color: data-flow (sources `actor`/sinks `store`),
  sequence (actor + external lifelines), deployment (datastores `store`), blast-radius (the failing
  dependency `changed`/`removed`), dependency graph (`changed` focus). The existing
  `diagram-catalog.test.ts` compiles every recipe through the render path (prelude injected), so
  colored recipes are validated automatically.

## Component 5 — Guidance

`skills/visual-recap/SKILL.md` and `skills/visual-plan/SKILL.md`: a short pointer to the catalog's
Color vocabulary — apply roles where they clarify (especially `changed` for the subject), and for
editable diagrams carry the mermaid classDefs so the Excalidraw scene stays colored.

## Component 6 — Testing

- **`test/diagram-colors.test.ts` (new):** `PALETTE` has the 6 roles; `D2_CLASS_PRELUDE` is valid
  d2 (a tiny `x: { class: changed }` diagram, rendered via `renderDiagram`, produces an SVG
  containing `#ffd43b`/`f08c00`); `MERMAID_CLASSDEFS` contains a `classDef changed` line whose hex
  matches `PALETTE.changed`. A pure-string test that both generated strings reference every role.
- **`test/render-diagram.test.ts`:** a block with `d2: "x: { class: changed }"` (no explicit
  `classes` block) renders an SVG containing the `changed` fill — proving prelude injection; a
  block with no class still compiles to `<svg`.
- **`test/dep-graph.test.ts`:** update — changed node now applies `class: changed` (replace the
  `#e6ffec` assertion); the rendered output still compiles. 
- **`test/api-diagram.test.ts`:** update to the canonical classes.
- **`test/prisma-schema.test.ts`:** a changed table carries `class: changed`.
- **`test/diagram-catalog.test.ts`:** still green (colored recipes compile via the injected
  prelude); optionally assert at least one recipe applies a `class:` so color coverage is real.

## Out of scope

- New diagram kinds or new block types (color is a rendering/authoring concern only).
- A dark-mode palette / theme switching.
- Recoloring the syntax-highlighted diff/code (Shiki) — this is diagram color only.

## Implementation sequencing (small commits)

1. `src/diagram-colors.ts` (`PALETTE` + generated `D2_CLASS_PRELUDE` + `MERMAID_CLASSDEFS`) + d2
   prelude injection in `renderViaD2` + `diagram-colors.test.ts` + the render-diagram injection test.
2. Refactor producers (`dep-graph`, `api-diagram`, `prisma-schema`) onto the canonical classes +
   update their tests.
3. Catalog Color-vocabulary section + colored recipes + skill guidance pointers.
