# Visual Skills — M0 (floor) + M1 (recap gatherer) Design

> Date: 2026-06-17
> Scope: first buildable slice of the `visual-skills` project. Derived from the
> full engineering spec at `reference/original-engineering-spec.md` (M0–M5) and a
> brainstorming session that pinned the open questions for this slice.

## 1. Purpose

Make written specs and code changes (PRs / diffs / commits) easier for a human to
read by turning them into a single, self-contained, hand-drawn-styled HTML
document grounded in the real repository. This slice delivers the **rendering
floor** and the **recap gatherer**. No Claude Code skill wiring yet (that is M4).

This is a **personal tool**, optimized first for the author's stack
(Next.js + tRPC + Prisma), but architected so other stacks can be added later
without changing the renderers.

## 2. Scope

In scope (M0 + M1):

- **M0 — floor:** block model, D2 sketch diagram renderer, HTML assembler +
  template, and a CLI that renders a hand-authored block array to a
  self-contained `plan.html`.
- **M1 — recap gatherer:** resolve a git target (branch / PR / commit / working
  tree) in *another* repo and produce a `recap.html` with a file map, an
  annotated diff, a tRPC API diff, and a Prisma schema-diff ERD.

Explicitly out of scope for this slice:

- Excalidraw / Playwright editable upgrade (M3). The code path is retained in
  `render-diagram` but stays **dormant** — gated off, always falls back to D2.
- Shiki syntax highlighting (M2). Diffs render as plain styled lines for now.
- `annotated-code` and `questions` *renderers* (M2). Their block **types** exist
  now; only the renderers are deferred.
- The two `SKILL.md` files and gate/self-review logic (M4).
- `gh pr comment` posting (M5).

## 3. Architecture

```
target (ppgl branch/PR) ──▶ gather-recap ──▶ block[] ──▶ render-diagram (D2) ──▶ assemble ──▶ recap.html
hand-authored block[] ─────────────────────▶ render-diagram (D2) ──▶ assemble ──▶ plan.html   (M0 test path)
```

Two entry points (`bin/plan.ts`, `bin/recap.ts`) feed the **same** block array
through the **same** renderer + assembler. The only M1-specific piece is
`gather-recap`, which produces the block array from a git target instead of
having it hand-authored.

## 4. Components

### 4.1 Block model — `src/blocks.ts`

TypeScript types per the original spec §6.1:

```ts
type Block =
  | DiagramBlock      // d2 (required) + optional mermaid; kind routes rendering
  | SchemaBlock       // ERD / data-model, incl. before→after for recaps (D2)
  | ApiBlock          // tRPC procedure / endpoint contract, incl. diffs
  | FileTreeBlock     // file map with +/- change badges
  | AnnotatedCodeBlock// code excerpt + prose annotations (type now, renderer M2)
  | DiffBlock         // raw hunk view with optional annotations
  | ProseBlock        // markdown narrative
  | QuestionsBlock;   // single Open Questions block (type now, renderer M2)
```

Renderers implemented in this slice: **diagram (D2), schema (ERD via D2),
api (table), file-tree, diff, prose**. `annotated-code` and `questions` types
are defined but throw "not implemented in this slice" if rendered.

### 4.2 Stack extensibility — `StackAdapter`

To satisfy "Prisma+tRPC first, generic later," the gatherer is built around a
small interface:

```ts
interface StackAdapter {
  name: string;
  detect(repoRoot: string): Promise<boolean>;
  schemaDiff(scope: Scope): Promise<SchemaBlock | null>;
  apiDiff(scope: Scope): Promise<ApiBlock[]>;
}
```

- `PrismaTrpcAdapter` — implemented now. Detects `prisma/schema.prisma` +
  `@trpc/server`.
- `GenericAdapter` — fallback when no adapter matches: file-tree + raw diff
  blocks only, no schema/api blocks.

Adding a new stack later = one new adapter; renderers are untouched.

### 4.3 Diagram renderer — `src/render-diagram.ts`

Port of the provided `reference/render-diagram.mjs` (logic preserved, typed):

- **Floor:** always compile the block's `d2` source with `d2 --sketch` → SVG.
  Requires the `d2` binary on PATH. No browser.
- **Upgrade (dormant):** the Excalidraw/Playwright path is retained but never
  activates in this slice (eligibility gating + graceful fallback to the D2 SVG).
- Result per block: `{ id, title, svg, editable: string|null, renderer }`.

### 4.4 Simple renderers — `src/renderers/*` (pure `string → HTML`, no browser)

- `file-tree` — nested list from `git diff --stat` / `--dirstat` with `+N/-N`
  badges and add/modify/delete markers.
- `diff` — hunk view; **plain styled red/green lines** in this slice (Shiki in
  M2). Optional per-hunk annotation text rendered in the margin when present.
- `api` — tRPC procedure contract as a compact table (input / output / auth /
  mutation|query); for recaps, added/removed/changed rows.
- `prose` — markdown → HTML.

### 4.5 Assembler + template — `src/assemble.ts`, `assets/template.css`

- Concatenates HTML fragments under a header block (title, source path/branch/PR/
  SHA, timestamp, one-line status) into a single self-contained `.html`.
- Inlines CSS and SVGs. Embeds **Excalifont** (OFL handwriting font, bundled
  woff2) for diagram labels; clean sans for body. Fixed light "paper" canvas.
- No view-time JS.

### 4.6 Recap gatherer — `src/gather-recap.ts`, `bin/recap.ts`

- **Scope resolution:** `git diff <base>...<head>`, `git show <sha>`,
  `gh pr diff <n>` (degrade gracefully if `gh` absent), or the working tree.
  Default base = merge-base with trunk. Excludes unrelated pre-existing dirty
  changes.
- **File map:** `git diff --stat` / `--dirstat` → `file-tree` block.
- **Schema diff:** compare `schema.prisma` across the two git revisions and
  render before→after as a D2 sketch ERD. Uses git revisions of the schema file
  rather than requiring a live DB for `prisma migrate diff` — simpler, offline.
- **API diff:** structurally locate changed tRPC routers and diff procedure
  signatures → `api` blocks.
- **Annotated diff:** per-file hunks as `diff` blocks; annotation text is
  optional and empty in this slice (the agent fills it once the skill exists in
  M4).

## 5. Data flow

1. Entry point produces or receives `Block[]`.
2. `render-diagram.renderAll` resolves every diagram/schema block to inline SVG
   (D2 floor).
3. Simple renderers turn the remaining blocks into HTML fragments.
4. `assemble` wraps fragments + header into one self-contained HTML file.
5. Written to `plans/<slug>/plan.html` (committed) or `.recaps/<slug>/recap.html`
   (git-ignored). `<slug>` = date + short title.

## 6. Error handling & degradation

- `d2` missing → hard error with the `brew install d2` instruction (D2 is the
  required floor).
- `gh` missing → PR-by-number scope unavailable; other scopes still work.
- No matching `StackAdapter` → `GenericAdapter` (file-tree + raw diff only); no
  broken blocks.
- Excalidraw path failure → silent fallback to the D2 SVG (already dormant here).
- A schema/api parse failure degrades that single block to a prose note rather
  than failing the whole document.

## 7. Testing & verification

- **Runtime:** TypeScript via `tsx`; unit tests with `vitest` (matches ppgl).
- **Unit:** snapshot tests on the pure renderers (`string → HTML`) and on the
  gatherer's diff / schema / api parsing against small committed fixtures.
- **End-to-end:** run `bin/recap.ts` against ppgl PR **#183**
  (`3559f61`, "replace Stripe with PayPal Checkout backend" — 23 files, touches
  `schema.prisma`, 4 tRPC files) and confirm `recap.html` opens offline with a
  file map, tRPC API-diff blocks, and a Prisma schema-diff ERD.
- **Prerequisite:** `brew install d2` on the dev machine.

## 8. Decisions (locked for this slice)

1. **Language/runtime:** TypeScript via tsx.
2. **Storage:** plans → committed `plans/<slug>/`; recaps → git-ignored
   `.recaps/<slug>/`. `<slug>` = date + short title.
3. **Theme:** fixed light Excalidraw-style canvas; no dark mode.
4. **Font:** Excalifont (OFL), bundled woff2.
5. **Schema diff source:** git revisions of `schema.prisma` (not live-DB
   `prisma migrate diff`).
6. **Diff rendering:** plain styled lines now; Shiki deferred to M2.
7. **Skill naming / BuilderIO collision:** deferred to M4.

## 9. Repo layout (this slice)

```
visual-skills/
  bin/{plan.ts, recap.ts}
  src/
    blocks.ts
    render-diagram.ts
    assemble.ts
    gather-recap.ts
    adapters/{stack-adapter.ts, prisma-trpc.ts, generic.ts}
    renderers/{file-tree.ts, diff.ts, api.ts, prose.ts}
  assets/{template.css, excalifont.woff2}
  test/                       # fixtures + vitest specs
  reference/                  # original spec + provided render-diagram.mjs
  docs/superpowers/specs/
```

## 10. Acceptance criteria (this slice)

- A hand-authored block array renders to a self-contained `plan.html` with at
  least one D2 sketch diagram and one ERD, openable offline.
- `bin/recap.ts` against ppgl PR #183 produces a `recap.html` with a file map,
  a tRPC API diff, and a Prisma schema-diff ERD — all rendered as D2 sketch where
  diagrammatic, no broken blocks.
- With `d2` present and the Excalidraw toolchain absent, everything still
  succeeds via D2.
- No network access required to open the output files.
