# Visual Skills M3 — Editable Diagrams (Excalidraw Upgrade) Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** M0 (D2 floor + plan CLI), M1 (recap gatherer), M2 (renderer completion + Shiki)

## Goal

Activate the dormant per-block Excalidraw "editable upgrade" so flowchart/architecture
diagrams can be opened and hand-edited as real `.excalidraw` scenes — while keeping the
default install lean and every output self-contained. Add two producers so editable
diagrams actually appear: an API-surface diagram in recaps, and promotion of authored
`mermaid` fences in plans.

## Scope & decomposition

Three sequential, independently-shippable slices, all specified here, phased in the plan:

- **M3.1 — Activation machinery.** Make the existing dormant Excalidraw path work as an
  opt-in upgrade (heavy deps outside the default install; an offline esbuild-built
  browser bundle; graceful fallback to the D2 floor when absent).
- **M3.2 — Producer A: recap tRPC API-surface diagram.** A new `architecture`-kind
  diagram emitting both `d2` (floor) and `mermaid` (upgrade) from one model.
- **M3.3 — Producer B: plan mermaid-fence promotion.** Promote ` ```mermaid ` fences in
  plan markdown to diagram blocks, synthesizing a `d2` floor via a small mermaid→d2
  converter.

The producers (M3.2, M3.3) are pure data transforms — fully testable here and valuable
immediately via the D2 floor, even before M3.1 is installed. M3.1's browser bundle is the
only piece that cannot be exercised in this environment; it ends with a manual
verification on the user's machine.

## Decisions

1. **Opt-in deps.** `@excalidraw/excalidraw`, `@excalidraw/mermaid-to-excalidraw`,
   `playwright`, `react`, `react-dom`, and `esbuild` are NOT in the default install. A
   `setup:excalidraw` script installs pinned versions (`npm install --no-save`), runs
   `playwright install chromium`, and esbuild-bundles the libraries into one offline IIFE.
2. **Offline bundle via esbuild.** The libraries are partly ESM-only, so we bundle them
   ourselves into `assets/excalidraw-bundle.js` (gitignored) that sets
   `window.ExcalidrawLib` / `window.MermaidToExcalidrawLib`. A committed
   `assets/excalidraw-bundle.html` loads that one file. This makes the `file://` page work
   offline regardless of the packages' module format.
3. **Graceful by default.** With nothing installed, `excalidrawReady()` returns false (no
   bundle file / no playwright) and rendering falls back to the D2 sketch — unchanged
   current behavior. No code path may crash when the upgrade is unavailable.
4. **One model, two emitters.** Each producer builds an internal node/edge model and emits
   `d2` and `mermaid` from it, so the floor and the editable scene never diverge.
5. **Promote only convertible flowchart-class fences.** A mermaid fence is promoted to a
   diagram block only if the mermaid→d2 converter succeeds; otherwise it stays inline and
   renders as a Shiki code block (graceful, never breaks).

## Architecture

### M3.1 — Activation machinery

**Opt-in install.** New file `scripts/setup-excalidraw.mjs` (run via `npm run
setup:excalidraw`):
1. `npm install --no-save` the pinned versions of `@excalidraw/excalidraw`,
   `@excalidraw/mermaid-to-excalidraw`, `react`, `react-dom`, `playwright`, `esbuild`
   (versions are constants in the script).
2. `npx playwright install chromium`.
3. esbuild-bundle `scripts/excalidraw-entry.mjs` (IIFE, bundle:true) →
   `assets/excalidraw-bundle.js`.

**Bundle entry.** New file `scripts/excalidraw-entry.mjs`:
```js
import * as ExcalidrawLib from "@excalidraw/excalidraw";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
window.ExcalidrawLib = ExcalidrawLib;
window.MermaidToExcalidrawLib = { parseMermaidToExcalidraw };
```
esbuild inlines react/react-dom (excalidraw's peers) into the IIFE.

**Bundle page.** New committed file `assets/excalidraw-bundle.html` — a minimal page that
loads `excalidraw-bundle.js` (relative, same dir) so `window.ExcalidrawLib` /
`window.MermaidToExcalidrawLib` exist when `render-diagram.ts` calls `page.evaluate`.

**`.gitignore`.** Add `assets/excalidraw-bundle.js` (a generated artifact).

**render-diagram.ts.** The existing `excalidrawReady()` / `renderViaExcalidraw()` path is
already correct (gates on the bundle file + a dynamic `playwright` import, writes the
`${id}.excalidraw` scene, falls back to D2 on any error). The only change needed:
**testability** — extract the browser conversion behind an injectable seam so the
eligibility/fallback/scene-writing logic can be unit-tested without a browser. Specifically,
`renderDiagram` accepts an optional `deps` parameter:
```ts
interface RenderDeps {
  excalidrawReady?: () => Promise<boolean>;
  renderViaExcalidraw?: (mermaid: string) => Promise<{ svg: string; scene: unknown }>;
}
```
defaulting to the real implementations. Tests inject a fake `excalidrawReady` returning
true and a fake `renderViaExcalidraw` returning a known scene, then assert the
`.excalidraw` file is written and `renderer: "excalidraw"` is returned; and inject a
throwing fake to assert fallback to the D2 SVG + a warning. The real browser path is
covered by an integration test that **skips** when the real `excalidrawReady()` is false.

**README.** Document the opt-in: `npm run setup:excalidraw`, what it pulls (~Chromium +
React Excalidraw), that it's optional, and the manual verification command.

### M3.2 — Producer A: recap tRPC API-surface diagram

**New module `src/api-diagram.ts`:**
```ts
import type { ApiProcedure, DiagramBlock } from "./blocks.js";
export function apiSurfaceDiagram(
  procedures: ApiProcedure[],
  id?: string,
  title?: string,
): DiagramBlock | null;
```
- Returns `null` if `procedures` is empty (no diagram).
- Groups procedures by router = the segment of `name` before the first `.`
  (e.g. `league.captureOrder` → router `league`, proc `captureOrder`; a name with no dot
  → router `""`/`root`).
- Builds an internal model: a `client` node, one group per router, one node per procedure,
  edges `client → router`. Each procedure node carries its `change` (added/removed/changed/
  undefined).
- **Emits `d2`** (the floor): `direction: right`; a `client` node; one container per
  router; quoted keys/values throughout (the M0 lesson — names contain dots and must be
  quoted so D2 compiles); `client -> "<router>"` edges; changed procedures styled by fill
  (`added` #e6ffec, `removed` #ffebe9, `changed` #fffdf3).
- **Emits `mermaid`** (the upgrade): `graph LR`; `client --> <routerId>`; a `subgraph` per
  router containing procedure nodes with display labels; `classDef`/`class` for
  added/removed/changed coloring. Node/subgraph ids are sanitized to `[A-Za-z0-9_]`
  (mermaid forbids dots in ids); display labels keep the original names.
- `kind: "architecture"` (eligible for the Excalidraw upgrade).

**Integration in `src/gather-recap.ts` (`buildBlocks`):** collect the procedures from the
ApiBlocks returned by `adapter.apiDiff`, then — if any exist — push
`apiSurfaceDiagram(allProcedures, "api-surface", "API surface")` immediately **before** the
API tables (visual overview first, detail tables after). Wrapped in the same try/catch
degradation pattern as the other adapter steps: a failure warns and is skipped, never
aborts the recap.

### M3.3 — Producer B: plan mermaid-fence promotion

**New module `src/mermaid-to-d2.ts`:**
```ts
export function mermaidFlowchartToD2(mermaid: string): string | null;
```
Converts the common flowchart subset; returns `null` for anything outside it (signalling
"do not promote"). Supported:
- Header `graph TD|TB|BT|LR|RL` or `flowchart <dir>` → d2 `direction: down|up|right|left`
  (`TD`/`TB`→down, `BT`→up, `LR`→right, `RL`→left).
- Node labels: `A[Label]`, `A(Label)`, `A{Label}`, `A((Label))` → d2 `A: "Label"`.
- Edges: `A --> B`, `A --- B`, `A -.-> B`, `A ==> B`, optionally `A -->|Label| B` or
  `A -- Label --> B` → d2 `A -> B` (with `: "Label"` when present).
- Bare node ids without labels are allowed.
Anything else (e.g. `sequenceDiagram`, `erDiagram`, class diagrams, subgraphs, styling
directives) → `null`. All emitted d2 keys/labels are quoted.

**New module `src/promote-mermaid.ts`:**
```ts
import type { Block } from "./blocks.js";
export function promoteMermaidFences(blocks: Block[]): Block[];
```
- Passes through every non-prose block unchanged.
- For each `ProseBlock`, splits its markdown on fenced ` ```mermaid … ``` ` blocks (standard
  triple-backtick fences). For each segment, in order:
  - **text segment** (non-empty after trim) → a `ProseBlock` with that markdown, id
    `${proseId}` for the first text segment and `${proseId}-t<n>` for subsequent ones.
  - **mermaid segment** → run `mermaidFlowchartToD2`. On success, a `DiagramBlock`
    `{ type:"diagram", kind:"flowchart", id:"${proseId}-mermaid-<n>", title:"Diagram",
    d2:<converted>, mermaid:<fence content> }`. On `null`, leave the fence inline in the
    surrounding prose (it renders as a Shiki `mermaid` code block via M2) — i.e. do NOT
    split it out.
- Order is preserved exactly; ids remain unique (prose-id-derived).

**Integration in `bin/plan.ts`:** after parsing the blocks JSON and before `assemble`,
`const promoted = promoteMermaidFences(blocks);` and assemble `promoted`. The recap path is
unaffected (it builds its own diagram via Producer A).

## Data Flow

- **Recap:** `gatherRecap → buildBlocks` now also emits an `api-surface` architecture
  DiagramBlock (d2+mermaid). `assemble → renderAll → renderDiagram` compiles the d2 floor;
  if the Excalidraw upgrade is installed and the kind is eligible, it additionally writes a
  `.excalidraw` sidecar and inlines the Excalidraw SVG, surfacing the existing "open in
  Excalidraw" link.
- **Plan:** `bin/plan.ts` runs `promoteMermaidFences` over the authored blocks, turning
  convertible mermaid fences into eligible DiagramBlocks, then assembles as usual.

## Error Handling

- Excalidraw upgrade unavailable → D2 floor (existing graceful behavior; no crash).
- D2 floor itself fails → placeholder SVG + warning (existing M-hardening behavior).
- Producer A failure → warned and skipped in `buildBlocks`; recap still produced.
- Producer B: unconvertible fence → left inline as a code block; never throws.
- The setup script is best-effort; if a step fails it reports clearly and the tool keeps
  working in D2-only mode.

## Testing

Browserless, fully testable here:
- **mermaid-to-d2:** direction mapping; each node-label shape; each edge form incl. labels;
  returns `null` for `sequenceDiagram`/`erDiagram`/unsupported syntax; emitted d2 compiles
  (compile a sample through the `d2` binary, per the M0 regression lesson).
- **promote-mermaid:** a prose block with one convertible fence splits into prose +
  flowchart diagram (with both `d2` and `mermaid` set) + prose, order preserved; an
  unconvertible fence is left inline (no diagram block emitted); non-prose blocks pass
  through; ids are unique.
- **api-diagram:** empty input → `null`; grouping by router prefix; added/removed/changed
  reflected in both outputs; emitted `d2` compiles through the `d2` binary; `mermaid` ids
  are dot-free while labels keep dots; `kind === "architecture"`.
- **gather-recap:** when api procedures exist, an `api-surface` diagram block is present and
  ordered before the API tables; when none exist, no diagram is added.
- **render-diagram (injected seam):** eligible block + fake ready=true + fake conversion →
  writes `.excalidraw`, `renderer:"excalidraw"`; fake conversion throws → D2 fallback +
  warning; ineligible kind (e.g. `erd`) → never attempts the upgrade.

Integration (skipped when the optional toolchain is absent):
- A real end-to-end Excalidraw render of a small flowchart, guarded by `excalidrawReady()`;
  skipped in CI/this environment.

Manual verification (documented, run on the user's machine after `setup:excalidraw`):
- Generate a recap or a plan containing a flowchart, confirm a `.excalidraw` file is
  written, the inline SVG renders, and the file opens/edits in excalidraw.com or the VS
  Code Excalidraw extension.

Regression: the ppgl recap (`--commit 3559f61`) still produces a self-contained doc; it now
includes the API-surface diagram, still renders via the D2 floor with zero `<script>` tags
and no stderr warnings on valid input.

## Risks

- **The offline esbuild bundle may need iteration.** Whether esbuild cleanly bundles
  `@excalidraw/excalidraw` + `@excalidraw/mermaid-to-excalidraw` into a working IIFE, and
  whether `parseMermaidToExcalidraw`/`exportToSvg` run in a blank page, cannot be confirmed
  in this environment. Mitigation: the path degrades gracefully, so a non-working bundle
  never breaks output — it just falls back to D2. M3.1 ends with a manual verify where the
  bundle can be iterated if needed.
- **Heavy toolchain.** Mitigated by keeping it entirely opt-in and out of the default
  install.
- **mermaid→d2 converter scope.** Deliberately limited to the common flowchart subset;
  anything else falls back to an inline code block rather than producing a wrong diagram.
- **D2 compilation of generated source.** Mitigated by quoting all keys/values and by
  compile-through-`d2` regression tests (the M0 lesson).
