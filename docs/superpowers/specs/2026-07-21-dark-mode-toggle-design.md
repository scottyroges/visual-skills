# Dark mode toggle for generated pages — design

**Date:** 2026-07-21
**Status:** Approved (brainstorm)

## Goal

Every self-contained HTML page produced by the visual skills (recap, doc, spec,
review, atlas) gets a light/dark theme toggle in the top-right corner. The page
defaults to the viewer's OS preference and remembers an explicit choice.

## Scope

**In:** toggle control + OS detection + persistence; dark theming of all page
chrome; dark syntax highlighting for code blocks; committed `example/` pages
regenerated to include the toggle.

**Out (this pass):** dark-native diagrams. d2/Excalidraw SVGs keep their baked
light colors and sit on a light "card" in dark mode (an intentional, common
pattern), rather than being re-themed.

## How pages are built today

All four assemblers inline CSS into `<head><style>` and append a viewer script:

| Assembler | CSS layered (in order) | Viewer JS |
|---|---|---|
| `src/assemble.ts` (recap/doc) | `template.css` | `viewer.js` |
| `src/assemble-review.ts` | `review.css` | `review-viewer.js` |
| `src/assemble-spec.ts` | `review.css` + `spec.css` | `review-viewer.js` |
| `src/assemble-atlas.ts` | `review.css` + `spec.css` + `atlas.css` | `review-viewer.js` |

Each builds `<!doctype html><html><head>…<style>${css}</style></head><body>…<script>${viewer}</script></body></html>`.
The CSS files already use `:root` variables (`--ink`, `--paper`, `--line`, …)
but also carry ~117 hardcoded hex colors mixed into rules.

Code blocks are Shiki-highlighted with a single `github-light` theme
(`src/highlight.ts`, `const THEME = "github-light"`), which bakes colors as
inline `style="color:#…"` on each token — invisible to a CSS toggle.

## Design

### 1. Behavior

- On load, before body paint: read `localStorage["vs-theme"]`. If set
  (`"light"`/`"dark"`), apply it. Else apply `matchMedia("(prefers-color-scheme:
  dark)")`. Sets `data-theme` on `<html>`.
- The apply step runs as an **inline `<head>` script** so there is no
  light-to-dark flash on load.
- Toggle: a small fixed circular **icon button** (sun in dark mode, moon in
  light mode), top-right. Click flips the theme and writes
  `localStorage["vs-theme"]`.
- If the OS theme changes while the page is open **and** the user has not made an
  explicit choice, follow it (a `matchMedia` change listener that no-ops once a
  choice is stored).
- Two states only. "System" is the initial default, not a third toggle state.

### 2. New shared assets

- `assets/theme-toggle.js` — apply/persist/click logic + button injection. Two
  parts: a tiny synchronous apply snippet (goes in `<head>`) and the
  button-wiring (runs with the body).
- `assets/theme.css` — a single `:root[data-theme="dark"]{…}` override block
  covering every themable variable, plus the toggle button styles and the
  Shiki dark-flip selector. Appended **last** in every assembler so its
  overrides win regardless of the base CSS layered before it.

### 3. Wiring the assemblers

Each of the 4 assemblers gets the same edit:
- `readFile` `theme.css`, append it after the existing CSS in the `<style>`.
- Emit the inline apply snippet at the top of `<head>`.
- `readFile` `theme-toggle.js`, append it near the existing `<script>`.

### 4. CSS work

Audit the ~117 hardcoded hex across `template.css`, `review.css`, `spec.css`,
`atlas.css`. Promote the ones that carry meaning into variables (block/card
backgrounds, status pills, diff-line tints `#e6ffec`/`#ffebe9`, annotation
panels, `shiki-plain` background). Give each a dark value in `theme.css`.
Semantic add/del greens and reds get dark-friendly tints rather than the bright
light-mode fills. Pure structural hex that reads fine in both modes can stay.

### 5. Code blocks (Shiki)

Change `src/highlight.ts` from a single theme to Shiki **dual-theme**
(`{ light: "github-light", dark: "github-dark" }`). Shiki then emits CSS custom
properties (`--shiki-dark` / `--shiki-dark-bg`) alongside the light values. Add
the documented flip selector to `theme.css`
(`:root[data-theme="dark"] .shiki, :root[data-theme="dark"] .shiki span { color: var(--shiki-dark) … }`).
Both `codeToHtml` call sites and the per-line highlight path use the same
highlighter, so this is one change. `shiki-plain` fallback gets a dark bg var.

### 6. Diagrams

Add a light-card wrapper class so SVGs read as intentional light panels in dark
mode instead of raw white rectangles. No change to diagram rendering itself.

### 7. Examples

Regenerate the committed `example/` pages (one per skill type) so they ship with
the toggle. Larger diff, but keeps the README demos honest.

### 8. Testing

- Unit: assert each assembler's output contains the `data-theme` apply snippet,
  the toggle button markup/class, and the appended `theme.css` marker.
- Unit: assert `highlight.ts` output carries the dual-theme `--shiki-dark` var.
- Manual: regenerate one example of each type; spot-check light and dark.

## Risks / notes

- **Atlas stamps / drift checker** (`assets/atlas-check.mjs`): confirm CSS/JS
  changes don't invalidate content stamps. Stamps are content-grounding, not
  style, so expected to be unaffected — verify during implementation.
- Injecting the same snippet four times: keep it in shared assets, not
  duplicated inline, so it stays single-source.
- Diagrams on light cards are a deliberate compromise, documented for users.
