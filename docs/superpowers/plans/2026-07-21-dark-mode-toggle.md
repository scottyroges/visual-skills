# Dark Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every self-contained HTML page produced by the visual skills gets a top-right light/dark toggle that defaults to the OS preference and remembers an explicit choice.

**Architecture:** Three new shared assets (`theme-head.js`, `theme-toggle.js`, `theme.css`) are inlined by all four assemblers. The apply script runs in `<head>` (no flash), the toggle wiring runs with the body, and `theme.css` (appended last) holds the `:root[data-theme="dark"]` overrides, the toggle button styles, and the Shiki dark-flip selector. `highlight.ts` switches to Shiki dual-theme so code blocks carry both palettes.

**Tech Stack:** TypeScript (tsx/tsc), Vitest, Shiki, plain DOM JS in the emitted assets. Assets are read at runtime from `assets/` via `new URL("../assets", import.meta.url)` — no build/copy step; adding files to `assets/` is sufficient.

## Global Constraints

- Assets live in `assets/` and are inlined at assemble time — never referenced by URL (pages must stay single-file/self-contained).
- `theme.css` MUST be appended **after** all other CSS in every `<style>` so its `:root[data-theme="dark"]` overrides win.
- Theme state lives on `document.documentElement` as `data-theme="light"|"dark"`; persisted choice in `localStorage["vs-theme"]`.
- Two states only. OS preference (`prefers-color-scheme`) is the initial default, not a third toggle state.
- No inline `Date.now()`/random in assets that would break output determinism; emitted markup must be stable across runs for the same input.
- Tests: `npm test` (vitest run). Typecheck: `npm run typecheck`.

---

### Task 1: Shared theme assets + wire into `assemble.ts` (recap/doc)

Get one page type fully working end-to-end: the assets exist and the recap/doc assembler emits them.

**Files:**
- Create: `assets/theme-head.js`
- Create: `assets/theme-toggle.js`
- Create: `assets/theme.css`
- Modify: `src/assemble.ts:192-206`
- Test: `test/assemble.test.ts`

**Interfaces:**
- Produces: an emitted `<head>` that contains `<script>` with `data-theme` apply logic; a `<body>` containing `<button class="vs-theme-toggle"` and the toggle script; a `<style>` whose tail contains the marker comment `/* vs-theme */`.

- [ ] **Step 1: Write `assets/theme-head.js`** (runs synchronously in `<head>`; sets the initial theme before paint)

```js
(function () {
  try {
    var saved = localStorage.getItem("vs-theme");
    var mql = window.matchMedia("(prefers-color-scheme: dark)");
    var theme = saved === "light" || saved === "dark"
      ? saved
      : (mql.matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
```

- [ ] **Step 2: Write `assets/theme-toggle.js`** (runs with body; injects the button, wires click + OS-change follow)

```js
(function () {
  var root = document.documentElement;
  var STORAGE = "vs-theme";
  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var btn = document.createElement("button");
  btn.className = "vs-theme-toggle";
  btn.type = "button";
  btn.setAttribute("aria-label", "Toggle dark mode");
  document.body.appendChild(btn);

  function render() {
    var dark = root.getAttribute("data-theme") === "dark";
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
  }
  render();

  btn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(STORAGE, next); } catch (e) {}
    render();
  });

  var mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", function (e) {
    var hasChoice = false;
    try { var s = localStorage.getItem(STORAGE); hasChoice = s === "light" || s === "dark"; } catch (x) {}
    if (hasChoice) return;
    root.setAttribute("data-theme", e.matches ? "dark" : "light");
    render();
  });
})();
```

- [ ] **Step 3: Write `assets/theme.css`** (toggle button styles + dark overrides for the base `template.css` variables + Shiki dark selector; expanded further in Task 4)

```css
/* vs-theme */
.vs-theme-toggle {
  position: fixed; top: 14px; right: 14px; z-index: 1000;
  width: 38px; height: 38px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--line); background: var(--paper); color: var(--ink);
  cursor: pointer; box-shadow: 1px 2px 0 rgba(0,0,0,0.08);
}
.vs-theme-toggle:hover { border-color: var(--ctx); }
@media print { .vs-theme-toggle { display: none; } }

:root[data-theme="dark"] {
  --ink:#e6e3dc; --paper:#16181d; --ctx:#9aa2ad; --line:#2c3038;
  --add:#3fb950; --del:#f85149;
}

/* Shiki dual-theme flip (Task 3 emits the --shiki-dark vars) */
:root[data-theme="dark"] .shiki,
:root[data-theme="dark"] .shiki span {
  color: var(--shiki-dark, inherit) !important;
  background-color: var(--shiki-dark-bg, transparent) !important;
}
```

- [ ] **Step 4: Write the failing test** in `test/assemble.test.ts`

```ts
it("emits the theme toggle, head apply script, and theme.css", async () => {
  const html = await assembleDocHtml(/* use the same minimal opts as the existing assemble tests in this file */);
  expect(html).toContain('data-theme'); // head apply script
  expect(html).toContain('class="vs-theme-toggle"');
  expect(html).toContain('/* vs-theme */'); // theme.css appended
});
```

(Match the real exported function name and option shape already used by the other tests in `test/assemble.test.ts` — do not invent a new signature.)

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run test/assemble.test.ts -t "theme toggle"`
Expected: FAIL (`vs-theme-toggle` not found).

- [ ] **Step 6: Modify `src/assemble.ts`** — read the assets and inject them. Replace the asset reads and the return block (lines ~192-206):

```ts
  const css = await readFile(join(ASSETS, "template.css"), "utf8");
  const themeCss = await readFile(join(ASSETS, "theme.css"), "utf8");
  const themeHead = await readFile(join(ASSETS, "theme-head.js"), "utf8");
  const themeToggle = await readFile(join(ASSETS, "theme-toggle.js"), "utf8");
  const viewer = await readFile(join(ASSETS, "viewer.js"), "utf8");
```

Then in the returned template, add the head script before `<title>` and append `themeCss` inside `<style>`, and append the toggle script:

```ts
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<script>${themeHead}</script>` +
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}\n${themeCss}</style></head>` +
    `<body><main class="vs-doc">${header}${fragments.join("")}${opts.generator ? `<footer class="vs-generator">Generated by ${escapeHtml(opts.generator)}</footer>` : ""}</main><script>${viewer}</script><script>${themeToggle}</script></body></html>\n`
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run test/assemble.test.ts -t "theme toggle"`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add assets/theme-head.js assets/theme-toggle.js assets/theme.css src/assemble.ts test/assemble.test.ts
git commit -m "feat(theme): add dark-mode toggle assets + wire into recap/doc assembler"
```

---

### Task 2: Wire the toggle into the spec, review, and atlas assemblers

**Files:**
- Modify: `src/assemble-review.ts:41-126`
- Modify: `src/assemble-spec.ts:389-436`
- Modify: `src/assemble-atlas.ts:59-68`
- Test: `test/assemble-review.test.ts`, `test/assemble-spec.test.ts`, `test/assemble-atlas.test.ts`

**Interfaces:**
- Consumes: `assets/theme-head.js`, `assets/theme-toggle.js`, `assets/theme.css` from Task 1.
- Produces: identical `data-theme` / `vs-theme-toggle` / `/* vs-theme */` markers in all three outputs.

- [ ] **Step 1: Write the failing test** — add to each of the three test files (adapt to each file's existing assemble-call setup):

```ts
it("emits the dark-mode toggle and theme.css", async () => {
  const html = await /* existing assemble call in this test file */;
  expect(html).toContain('data-theme');
  expect(html).toContain('class="vs-theme-toggle"');
  expect(html).toContain('/* vs-theme */');
});
```

- [ ] **Step 2: Run to verify all three fail**

Run: `npx vitest run test/assemble-review.test.ts test/assemble-spec.test.ts test/assemble-atlas.test.ts -t "toggle"`
Expected: 3 FAIL.

- [ ] **Step 3: Modify `src/assemble-review.ts`** — after `const viewer = await readFile(...)` add the three theme reads, then edit the returned template: insert `<script>${themeHead}</script>` right after `<meta charset="utf-8">…viewport…`, change `<style>${css}</style>` to `<style>${css}\n${themeCss}</style>`, and add `<script>${themeToggle}</script>` immediately after the existing `<script>${viewer}</script>`.

```ts
  const themeCss = await readFile(join(ASSETS, "theme.css"), "utf8");
  const themeHead = await readFile(join(ASSETS, "theme-head.js"), "utf8");
  const themeToggle = await readFile(join(ASSETS, "theme-toggle.js"), "utf8");
```

- [ ] **Step 4: Modify `src/assemble-spec.ts`** — same three reads; template currently ends `<style>${css}\n${specCss}</style>` → `<style>${css}\n${specCss}\n${themeCss}</style>`; add `<script>${themeHead}</script>` in the head and `<script>${themeToggle}</script>` after `<script>${viewer}</script>`.

- [ ] **Step 5: Modify `src/assemble-atlas.ts`** — same three reads; template currently ends `<style>${css}\n${specCss}\n${atlasCss}</style>` → append `\n${themeCss}`; add `<script>${themeHead}</script>` in the head and `<script>${themeToggle}</script>` after `<script>${viewer}</script>`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/assemble-review.test.ts test/assemble-spec.test.ts test/assemble-atlas.test.ts -t "toggle"`
Expected: 3 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/assemble-review.ts src/assemble-spec.ts src/assemble-atlas.ts test/assemble-review.test.ts test/assemble-spec.test.ts test/assemble-atlas.test.ts
git commit -m "feat(theme): wire dark-mode toggle into spec/review/atlas assemblers"
```

---

### Task 3: Shiki dual-theme so code blocks follow the toggle

**Files:**
- Modify: `src/highlight.ts:5-15,48,73`
- Test: `test/highlight.test.ts`

**Interfaces:**
- Consumes: the Shiki dark selector already present in `theme.css` (Task 1, Step 3).
- Produces: highlighted output whose spans carry a `--shiki-dark` custom property; `highlightLines` still returns one entry per source line.

- [ ] **Step 1: Write the failing test** in `test/highlight.test.ts`

```ts
it("emits dual-theme colors (light inline + --shiki-dark var)", async () => {
  const html = await highlightCode("const x = 1;", "ts");
  expect(html).toContain("--shiki-dark:");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/highlight.test.ts -t "dual-theme"`
Expected: FAIL (`--shiki-dark` absent — single theme).

- [ ] **Step 3: Modify `src/highlight.ts`** — replace the single theme with a dual-theme pair.

Replace:
```ts
const THEME = "github-light";
```
with:
```ts
const THEMES = { light: "github-light", dark: "github-dark" } as const;
```

In `getHighlighter`, load both:
```ts
    highlighterPromise = createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: LANGS,
    });
```

At each `codeToHtml` call (lines ~48 and ~73), replace `{ lang, theme: THEME }` with:
```ts
{ lang, themes: THEMES, defaultColor: "light" }
```

(`defaultColor: "light"` keeps the light color as the inline `color:` — so light mode needs no CSS — and stores the dark palette in `--shiki-dark` / `--shiki-dark-bg`, which the `theme.css` selector flips on. `highlightLines` still splits on `<span class="line">`; the dual-theme output preserves that line wrapper, so its regex and per-line mapping are unchanged.)

- [ ] **Step 4: Run tests to verify pass** (and confirm no regression in the existing line-count test)

Run: `npx vitest run test/highlight.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/highlight.ts test/highlight.test.ts
git commit -m "feat(theme): shiki dual-theme so code blocks follow dark mode"
```

---

### Task 4: Dark values for hardcoded colors across the CSS files

Promote the meaningful hardcoded hex in the four CSS files into variables, and give each a dark value in `theme.css`. Work file-by-file; each file is its own commit-worthy slice, but they share one deliverable so keep them in this task.

**Files:**
- Modify: `assets/template.css`, `assets/review.css`, `assets/spec.css`, `assets/atlas.css`
- Modify: `assets/theme.css`
- Test: `test/review-assets.test.ts` (or the existing assets test) — add a static assertion

**Method (apply to each file):**
1. Find the hardcoded hex: `grep -oE '#[0-9a-fA-F]{3,6}' assets/<file>.css | sort | uniq -c | sort -rn`.
2. For each color that carries surface/semantic meaning — block & card backgrounds (`#fff`, `#f6f5f1`), status pills (`.vs-status.green/.yellow/.red` fills), diff-line tints (`#e6ffec`, `#ffebe9`), annotation panels (`#fffdf3`, `#d4a72c`), API-table change rows — replace the literal with a new `var(--name)` and add the light value to the base `:root{}` in that file (so light is unchanged) plus a dark value to the `:root[data-theme="dark"]{}` block in `theme.css`.
3. Leave purely structural hex that reads fine in both modes (e.g. faint `rgba(0,0,0,0.04)` shadows) as-is.

**Concrete variable set to introduce** (names to reuse consistently across files):
- `--card` — block/card background. Light `#ffffff`; dark `#1c1f26`.
- `--code-bg` — `shiki-plain` / inline code background. Light `#f6f5f1`; dark `#1b1e24`.
- `--add-bg` — added-line tint. Light `#e6ffec`; dark `rgba(63,185,80,0.15)`.
- `--del-bg` — removed-line tint. Light `#ffebe9`; dark `rgba(248,81,73,0.15)`.
- `--warn-bg` — annotation/changed tint. Light `#fffdf3`; dark `rgba(210,167,44,0.12)`.
- `--pill-green-bg`/`--pill-yellow-bg`/`--pill-red-bg` — status pills. Light `#dafbe1`/`#fff8c5`/`#ffebe9`; dark `rgba(63,185,80,0.2)`/`rgba(210,167,44,0.2)`/`rgba(248,81,73,0.2)`.
- `--link` — hover link color. Light `#1a56db`; dark `#6aa3ff`.

- [ ] **Step 1: template.css** — replace the hex for `.vs-block` background, `.vs-status.*`, `.vs-line.vs-add/.vs-del`, `.vs-annotation`, `.shiki-plain`, `.vs-api-table` change rows, and `.vs-file-link:hover` with the variables above. Add light defaults to `template.css`'s `:root{}`.

- [ ] **Step 2: review.css** — same treatment for its card/pill/diff/annotation hex (51 literals; most are duplicates of the semantic set above — reuse the same variable names).

- [ ] **Step 3: spec.css and atlas.css** — same treatment (14 + 16 literals).

- [ ] **Step 4: Fill in the dark block** — add every new variable's dark value to the `:root[data-theme="dark"]{}` block in `assets/theme.css` (values listed above).

- [ ] **Step 5: Write/extend the assertion test** in `test/review-assets.test.ts`

```ts
import { readFile } from "node:fs/promises";
it("theme.css defines dark values for the shared surface variables", async () => {
  const css = await readFile(new URL("../assets/theme.css", import.meta.url), "utf8");
  for (const v of ["--card", "--code-bg", "--add-bg", "--del-bg", "--paper", "--ink"]) {
    expect(css).toContain(v);
  }
});
it("no card/pill hex leaks remain unthemed in template.css", async () => {
  const css = await readFile(new URL("../assets/template.css", import.meta.url), "utf8");
  expect(css).not.toContain("#e6ffec"); // added-line tint must now be a var
  expect(css).not.toContain("#ffebe9");
});
```

- [ ] **Step 6: Run the full suite** (catches any selector typo across files)

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Visual spot-check** — regenerate one recap and toggle to dark in a browser; confirm cards, code, pills, and diff tints are legible.

Run: `npm run recap -- --help` (confirm CLI), then generate against a small diff per the skill's usage; open the HTML and click the toggle.

- [ ] **Step 8: Commit**

```bash
git add assets/template.css assets/review.css assets/spec.css assets/atlas.css assets/theme.css test/review-assets.test.ts
git commit -m "feat(theme): dark values for card/pill/diff/code surfaces"
```

---

### Task 5: Light-card wrapper for diagrams in dark mode

Diagrams keep baked light colors; give them an intentional light panel so they don't read as raw white blocks.

**Files:**
- Modify: `assets/theme.css`
- Modify: `assets/template.css` / `assets/review.css` only if a wrapper class is missing (diagrams already render inside `.vs-diagram` / diagram cards — reuse the existing class).
- Test: `test/review-assets.test.ts`

- [ ] **Step 1: Identify the existing diagram container class** — confirm with `grep -n "vs-diagram\|diagram-card\|withDiagramSvgClass" assets/*.css src/review/sections.ts`.

- [ ] **Step 2: Add dark-mode rule to `assets/theme.css`**

```css
:root[data-theme="dark"] .vs-diagram,
:root[data-theme="dark"] .diagram-card {
  background: #faf9f6;           /* light card so baked-light SVGs read intentionally */
  border-radius: 10px;
  padding: 10px;
}
```

(Use whichever container class Step 1 confirms; if both exist, include both selectors.)

- [ ] **Step 3: Add assertion** in `test/review-assets.test.ts`

```ts
it("theme.css gives diagrams a light card in dark mode", async () => {
  const css = await readFile(new URL("../assets/theme.css", import.meta.url), "utf8");
  expect(css).toMatch(/\[data-theme="dark"\][^{]*\.vs-diagram/);
});
```

- [ ] **Step 4: Run test**

Run: `npx vitest run test/review-assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/theme.css test/review-assets.test.ts
git commit -m "feat(theme): keep diagrams on a light card in dark mode"
```

---

### Task 6: Regenerate committed example pages + verify atlas stamps

**Files:**
- Modify: files under `example/` (regenerated HTML)
- Verify: `.visual/atlas/atlas-check.mjs` still passes

- [ ] **Step 1: Identify the example generators** — `ls example/` and check `README.md` / `package.json` for how each example was produced (which CLI + args).

- [ ] **Step 2: Regenerate each example** using the same command that produced it, so the only diff is the toggle assets + themed CSS.

- [ ] **Step 3: Confirm the diff is toggle-only** — `git diff --stat example/`; each file should gain the head script, `vs-theme-toggle` button, `theme.css`, and dual-theme code spans, and nothing content-related.

- [ ] **Step 4: Run the atlas drift check** (the spec flagged stamps as a risk)

Run: `npm run atlas:check`
Expected: "✓ visual atlas in sync" (stamps are content-grounding, not style — should be unaffected). If it fails on stamps, follow the atlas-review skill to re-stamp.

- [ ] **Step 5: Run the full suite once more**

Run: `npm test && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add example/
git commit -m "chore(theme): regenerate example pages with dark-mode toggle"
```

---

## Self-Review

- **Spec coverage:** §1 behavior → Task 1 (assets). §2 shared assets → Task 1. §3 wiring → Tasks 1–2. §4 CSS → Task 4. §5 code blocks → Task 3. §6 diagrams → Task 5. §7 examples → Task 6. §8 testing → tests in every task. Risk note (atlas stamps) → Task 6 Step 4. All covered.
- **Placeholder scan:** the CSS-audit task (Task 4) names the exact variable set and values rather than "add appropriate colors"; the one unavoidable open item is matching each test to its file's existing assemble-call shape, which is called out explicitly as "use the existing setup in this file."
- **Type consistency:** variable names (`--card`, `--code-bg`, `--add-bg`, `--del-bg`, `--warn-bg`, `--pill-*-bg`, `--link`) are defined once in Task 4 and reused; asset filenames (`theme-head.js`, `theme-toggle.js`, `theme.css`) are consistent across Tasks 1–2; `data-theme` / `vs-theme` / `vs-theme-toggle` markers are identical everywhere.
