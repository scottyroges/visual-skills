# Visual Skills M2 — Renderer Completion + Syntax Highlighting (Design)

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** M0 (D2 floor + plan CLI), M1 (recap gatherer), Hardening (H1–H4 graceful degradation)

## Goal

Make every `Block` type renderable and give code real syntax highlighting. Today
`annotated-code` and `questions` throw in `assemble.ts`; diffs and prose fences are
plain text. M2 completes the rendering layer and adds **build-time** syntax
highlighting that keeps the output self-contained with **zero view-time JS**.

## Scope

In:
- `shiki` syntax highlighting for **diffs**, **annotated-code**, and **prose fenced code**.
- New `annotated-code` renderer (two-column, right-margin notes).
- New `questions` renderer (cards).
- Prose/HTML sanitization via `sanitize-html` (closes deferred fast-follow #3).

Out (later milestones): Excalidraw editable upgrade (M3), the two `SKILL.md` files
(M4), `gh pr comment` integration (M5).

## Decisions

1. **Highlighting scope:** annotated-code + diffs + prose fenced code (all three).
2. **Sanitizer:** `sanitize-html` dependency (allowlist; robust, well-tested).
3. **annotated-code layout:** right-margin notes (two-column grid, stacks on mobile).
4. **Shiki theme:** single light theme (`github-light`) emitting **inline color
   styles**, so the document stays self-contained with no extra theme-CSS wiring.

## Architecture

### New dependencies

- **`shiki`** — build-time highlighter. `codeToHtml(code, { lang, theme })` returns
  static HTML with inline `style="color:…"` per token, wrapping each source line in
  `<span class="line">…</span>` inside `<pre class="shiki"><code>`. No runtime JS.
- **`sanitize-html`** — allowlist HTML sanitizer for prose output.

### New module: `src/highlight.ts`

Centralizes all Shiki use behind a small interface.

- A lazily-created **singleton** highlighter (created at most once per process),
  loaded with a curated language set: `ts, tsx, js, jsx, prisma, sql, json, bash,
  diff, css, html, markdown`, and theme `github-light`.
- `highlightCode(code: string, lang: string, onWarn?): Promise<string>` — returns
  the Shiki `<pre class="shiki">…</pre>` HTML.
  - **Graceful degradation** (consistent with H2/H3): if the language is not in the
    loaded set, or Shiki throws, return `<pre class="shiki-plain">${escapeHtml(code)}</pre>`
    and call `onWarn`. Highlighting must never crash a render.
- `highlightLines(code: string, lang: string, onWarn?): Promise<string[] | null>` —
  highlights `code` as one blob and returns the inner HTML of each `<span class="line">`,
  one array entry per source line (used by the diff renderer to zip syntax colors onto
  diff rows). Returns `null` if highlighting failed or the produced line count does not
  match the input line count, signalling the caller to fall back.
- `langFromPath(path: string): string` — maps a file extension to a Shiki lang id
  (`.ts`→`ts`, `.tsx`→`tsx`, `.prisma`→`prisma`, `.sql`→`sql`, `.json`→`json`,
  `.sh`→`bash`, `.css`→`css`, `.html`→`html`, `.md`→`markdown`, `.js`→`js`,
  `.jsx`→`jsx`); unknown → `"text"` (which triggers the plain fallback).

The singleton, language list, and theme live in this module only; renderers call
`highlightCode` / `highlightLines` and never touch Shiki directly.

### Diffs — `src/renderers/diff.ts` (becomes async)

Goal: syntax colors layered *under* the existing add/del/context backgrounds, without
losing multi-line context (template literals, block comments).

1. Determine language via `langFromPath(block.path)`.
2. For each hunk: strip the leading marker (`+`/`-`/space) from every line, join the
   stripped lines, and call `highlightLines(joined, lang, onWarn)`.
3. If it returns an array (line count matches): for each line, emit
   `<div class="vs-line ${addDelCtx}"><span class="vs-gutter">${marker}</span>${shikiLineHtml}</div>`.
   The `+`/`-`/` ` marker shows in `.vs-gutter`; the add/del background comes from the
   existing `vs-add`/`vs-del`/`vs-ctx` classes; syntax colors come from the Shiki spans.
4. If it returns `null`: fall back to today's behavior for that hunk — each raw line
   `escapeHtml`'d inside `<div class="vs-line ${addDelCtx}">` — and `onWarn`.

Hunk header and annotation rendering are unchanged.

### annotated-code — `src/renderers/annotated-code.ts` (new, async)

`AnnotatedCodeBlock { lang, code, annotations: {line, note}[] }`.

1. `highlightLines(code, block.lang, onWarn)`; on `null`, fall back to per-line
   `escapeHtml`.
2. Build a two-column CSS grid (`.vs-annotated`):
   - Left column: line number + highlighted line, one grid row per source line.
   - Right column: for each annotation whose `line` is in range, its `note` (plain,
     `escapeHtml`'d) placed in the matching grid row with a `◀` lead marker.
   - **Multiple annotations on the same line:** stack their notes within that row's
     right cell.
   - **Out-of-range `line`** (`< 1` or `> lineCount`): skip that annotation and
     `onWarn`.
3. On narrow viewports, CSS stacks each note directly beneath its code line
   (media query in `template.css`).

### questions — `src/renderers/questions.ts` (new, sync)

`QuestionsBlock { questions: {question, recommendedDefault}[] }`.

Render each question as a card in `.vs-questions`: the question text, then a
`Recommended:` label with `recommendedDefault`. All text `escapeHtml`'d. No
highlighting.

### prose — `src/renderers/prose.ts` (becomes async)

1. Configure `marked` with an async `walkTokens` pass that, for each `code` token,
   calls `highlightCode(token.text, token.lang || "text", onWarn)` and stores the
   resulting HTML on the token; a synchronous custom `code` renderer returns that
   stored HTML. (Standard marked + Shiki integration pattern.)
2. Run the full rendered HTML through **`sanitize-html`** configured to **preserve
   Shiki output**:
   - `allowedTags`: the prose set (headings, p, ul/ol/li, blockquote, pre, code, span,
     a, em, strong, del, hr, table/thead/tbody/tr/th/td, img) — explicitly **excluding**
     `script` and `style`.
   - `allowedAttributes`: `class` on `pre`/`code`/`span`, `href`/`title` on `a`,
     `src`/`alt` on `img`.
   - `allowedStyles`: `color` and `background-color` (matching `#rrggbb`/`rgb()`) on
     `span`/`code`/`pre` — so Shiki's inline token colors survive.
   - `allowedSchemes`: `http`, `https`, `mailto` — drops `javascript:` URLs.
   - Default sanitize-html behavior strips `on*` event-handler attributes.

This closes fast-follow #3: agent-authored markdown containing `<script>`, `onclick`,
or `javascript:` URLs can no longer produce live HTML, while normal markdown and
highlighted fences render correctly.

### `assemble.ts`

- The per-block `fragments` mapping becomes **async**: build it with `Promise.all`
  over `blocks`, preserving order. Diagram SVGs remain pre-rendered into `svgById`
  up front (unchanged).
- Remove the `annotated-code` / `questions` `throw`; call the new async
  `renderAnnotatedCode(block, onWarn)` and sync `renderQuestions(block)`.
- `renderDiff` and `renderProse` calls become awaited (now async), threading `onWarn`.
- The Shiki singleton in `highlight.ts` is shared across all blocks (no per-block
  highlighter creation).

### CSS — `assets/template.css`

Add, in the existing sketch theme:
- `.shiki`, `.shiki-plain`: monospace, padded, `overflow-x: auto`, light background.
- `.vs-gutter`: fixed-width diff marker column.
- `.vs-annotated`: CSS grid (line-number / code / note columns); `.vs-annotated .note`
  styling with the `◀` marker; media query to stack notes beneath code on narrow widths.
- `.vs-questions`, `.vs-question`: card styling; `.vs-recommended` label.

## Error Handling

All highlighting degrades gracefully and never aborts a render (extends the H2/H3
philosophy): unknown languages, Shiki errors, and diff line-count mismatches each fall
back to escaped plain text plus an `onWarn`. Out-of-range annotations are skipped with
a warning. Sanitization always runs on prose; it strips rather than rejects.

## Testing

Per-module (vitest):

- **highlight:** known language → output contains Shiki `<span` color styles; unknown
  language → escaped `<pre class="shiki-plain">` fallback (and `onWarn` fired);
  `highlightLines` returns one entry per input line for valid input and `null` on
  mismatch.
- **diff:** highlighted hunk contains syntax-color spans AND retains `vs-add`/`vs-del`
  classes and the gutter marker; a forced line-count mismatch falls back to escaped
  plain lines.
- **annotated-code:** code lines + aligned notes present; out-of-range annotation
  skipped (with warning); two notes on one line both render.
- **questions:** question and recommended default present; HTML in the text is escaped.
- **prose:** `<script>` removed; `onclick=` removed; `javascript:` URL removed; normal
  markdown (headings, lists, links, emphasis) preserved; a fenced code block is
  highlighted (Shiki spans present) AND survives sanitization (inline `color` style
  retained).
- **assemble:** a document containing all block types (incl. annotated-code and
  questions) renders without throwing; output contains no `<script` tag.

Regression (real repo): the ppgl PR #183 recap (`bin/recap.ts --pr 183`) still
produces a self-contained document — diffs now syntax-highlighted — with zero
`<script>` tags and zero stderr warnings on valid input. Note the expected file-size
increase from inline token styles.

## Risks

- **Shiki startup latency** (~tens of ms to create the highlighter and load
  languages) — paid once per process; acceptable for a CLI.
- **sanitize-html stripping Shiki styles** — mitigated by `allowedStyles`
  (`color`/`background-color`) and `class` on `span`/`code`/`pre`.
- **Diff line-zip fragility** — mitigated by the line-count guard that falls back to
  plain escaped lines for any hunk where Shiki's line count diverges.
