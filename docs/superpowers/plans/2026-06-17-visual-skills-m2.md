# Visual Skills M2 — Renderer Completion + Syntax Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `Block` type renderable and add build-time Shiki syntax highlighting to diffs, annotated-code, and prose fences, with sanitized prose — all self-contained, zero view-time JS.

**Architecture:** A single `src/highlight.ts` module owns all Shiki use (a lazily-created singleton highlighter, a curated language set, the `github-light` theme) behind three functions: `highlightCode` (full `<pre>`), `highlightLines` (per-line inner HTML for zipping onto diff/annotated rows), and `langFromPath`. Renderers call those functions and never touch Shiki directly. Prose runs marked (with an async `walkTokens` Shiki pass for fences) then `sanitize-html`. All highlighting degrades gracefully to escaped plaintext on any failure (extends the H2/H3 philosophy). `assemble.ts` becomes fully async.

**Tech Stack:** TypeScript ESM (run via `tsx`), vitest, marked v14, shiki v3, sanitize-html v2.

**Commit convention:** Every commit message MUST end with the trailer line:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Spec:** `docs/superpowers/specs/2026-06-17-visual-skills-m2-design.md`

---

## File Structure

- **Create** `src/highlight.ts` — Shiki singleton + `highlightCode`, `highlightLines`, `langFromPath`. Sole owner of Shiki.
- **Create** `src/renderers/annotated-code.ts` — two-column highlighted code with right-margin notes (async).
- **Create** `src/renderers/questions.ts` — question cards (sync).
- **Modify** `src/renderers/diff.ts` — async; syntax colors layered under add/del backgrounds, with plaintext fallback.
- **Modify** `src/renderers/prose.ts` — async; Shiki-highlighted fences + `sanitize-html`.
- **Modify** `src/assemble.ts` — async per-block mapping; wire new renderers; remove the annotated-code/questions `throw`.
- **Modify** `assets/template.css` — `.shiki`/`.shiki-plain`, `.vs-gutter`, `.vs-annotated`, `.vs-questions` styling.
- **Create** `test/highlight.test.ts`; **modify** `test/diff.test.ts`, `test/prose.test.ts`, `test/assemble.test.ts`; **create** `test/annotated-code.test.ts`, `test/questions.test.ts`.

---

## Task 1: Dependencies + highlight module

**Files:**
- Modify: `package.json` (add deps)
- Create: `src/highlight.ts`
- Test: `test/highlight.test.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install shiki@^3 sanitize-html@^2.13.0
npm install -D @types/sanitize-html@^2.13.0
```

Expected: `shiki` and `sanitize-html` appear under `dependencies`, `@types/sanitize-html` under `devDependencies`, and `npm install` exits 0.

- [ ] **Step 2: Write the failing test**

Create `test/highlight.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { highlightCode, highlightLines, langFromPath } from "../src/highlight.js";

describe("langFromPath", () => {
  it("maps known extensions to shiki langs and unknown to text", () => {
    expect(langFromPath("src/server/routers/league.ts")).toBe("ts");
    expect(langFromPath("prisma/schema.prisma")).toBe("prisma");
    expect(langFromPath("query.sql")).toBe("sql");
    expect(langFromPath("notes.unknownext")).toBe("text");
    expect(langFromPath("Makefile")).toBe("text");
  });
});

describe("highlightCode", () => {
  it("highlights a known language with inline color styles", async () => {
    const html = await highlightCode("const x = 1;", "ts");
    expect(html).toContain("<pre");
    expect(html).toContain("style=\"color:");
  });

  it("falls back to escaped plain text for an unknown language and warns", async () => {
    const warnings: string[] = [];
    const html = await highlightCode("a < b && c > d", "text", (m) => warnings.push(m));
    expect(html).toContain("shiki-plain");
    expect(html).toContain("a &lt; b &amp;&amp; c &gt; d");
    expect(html).not.toContain("<pre class=\"shiki ");
  });
});

describe("highlightLines", () => {
  it("returns one entry per input line for a known language", async () => {
    const lines = await highlightLines("const a = 1;\nconst b = 2;\nconst c = 3;", "ts");
    expect(lines).not.toBeNull();
    expect(lines!.length).toBe(3);
    expect(lines!.join("")).toContain("style=\"color:");
  });

  it("returns null for an unloaded language so callers can fall back", async () => {
    const lines = await highlightLines("plain text line", "text");
    expect(lines).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- highlight`
Expected: FAIL — `Cannot find module '../src/highlight.js'`.

- [ ] **Step 4: Write the implementation**

Create `src/highlight.ts`:

```ts
import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";
import { escapeHtml } from "./html.js";

const THEME = "github-light";
const LANGS = [
  "ts", "tsx", "js", "jsx", "prisma", "sql",
  "json", "bash", "diff", "css", "html", "markdown",
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes: [THEME], langs: LANGS });
  }
  return highlighterPromise;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  prisma: "prisma", sql: "sql", json: "json", sh: "bash", bash: "bash",
  css: "css", html: "html", md: "markdown",
};

/** Map a file path's extension to a Shiki language id; unknown -> "text". */
export function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "text";
}

function isLoaded(hl: Highlighter, lang: string): boolean {
  return lang !== "text" && hl.getLoadedLanguages().includes(lang);
}

/** Full highlighted block: returns a Shiki <pre>, or an escaped plain <pre> on failure. */
export async function highlightCode(
  code: string,
  lang: string,
  onWarn?: (msg: string) => void,
): Promise<string> {
  try {
    const hl = await getHighlighter();
    if (!isLoaded(hl, lang)) {
      if (lang !== "text") onWarn?.(`highlight: language "${lang}" not loaded; rendering plain`);
      return `<pre class="shiki-plain">${escapeHtml(code)}</pre>`;
    }
    return hl.codeToHtml(code, { lang, theme: THEME });
  } catch (err) {
    onWarn?.(`highlight: failed (${(err as Error).message}); rendering plain`);
    return `<pre class="shiki-plain">${escapeHtml(code)}</pre>`;
  }
}

/**
 * Highlight `code` and return the inner HTML of each source line (Shiki wraps each
 * line in <span class="line">...</span>). Returns null — signalling the caller to
 * fall back to escaped plaintext — for an unloaded language, a Shiki error, or a
 * line-count mismatch.
 */
export async function highlightLines(
  code: string,
  lang: string,
  onWarn?: (msg: string) => void,
): Promise<string[] | null> {
  const expected = code.split("\n").length;
  try {
    const hl = await getHighlighter();
    if (!isLoaded(hl, lang)) {
      if (lang !== "text") onWarn?.(`highlight: language "${lang}" not loaded; falling back`);
      return null;
    }
    const html = hl.codeToHtml(code, { lang, theme: THEME });
    const inner = html.match(/<code[^>]*>([\s\S]*)<\/code>/);
    if (!inner) return null;
    const spans = inner[1].split("\n");
    if (spans.length !== expected) {
      onWarn?.(`highlight: line count mismatch (${spans.length} vs ${expected}); falling back`);
      return null;
    }
    return spans.map((s) =>
      s.replace(/^<span class="line">/, "").replace(/<\/span>$/, ""),
    );
  } catch (err) {
    onWarn?.(`highlight: failed (${(err as Error).message}); falling back`);
    return null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- highlight`
Expected: PASS (5 tests). If `createHighlighter` is not exported by the installed shiki version, fall back to importing `getHighlighter` from `shiki` and aliasing it; do not change the function signatures.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/highlight.ts test/highlight.test.ts
git commit -m "$(cat <<'EOF'
feat: shiki highlight module (singleton, graceful fallback)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Syntax-highlighted diffs

**Files:**
- Modify: `src/renderers/diff.ts`
- Test: `test/diff.test.ts` (update existing — renderer becomes async)

- [ ] **Step 1: Update the existing test (and add a fallback case)**

Replace the entire contents of `test/diff.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { renderDiff } from "../src/renderers/diff.js";
import type { DiffBlock } from "../src/blocks.js";

describe("renderDiff", () => {
  it("syntax-highlights a known language and keeps add/del/context classes", async () => {
    const block: DiffBlock = {
      type: "diff", id: "d", title: "league.ts", path: "src/server/routers/league.ts",
      hunks: [{
        header: "@@ -56,6 +56,12 @@",
        lines: [
          "   createCheckoutSession(...)",
          "+  captureOrder: protectedProcedure",
          "-  old<line>",
        ],
        annotation: "Adds the server-side capture mutation.",
      }],
    };
    const html = await renderDiff(block);
    expect(html).toContain('class="vs-block vs-diff"');
    expect(html).toContain('class="vs-line vs-add"');
    expect(html).toContain('class="vs-line vs-del"');
    expect(html).toContain('class="vs-line vs-ctx"');
    expect(html).toContain('class="vs-gutter"');
    expect(html).toContain('style="color:'); // shiki ran
    expect(html).not.toContain("old<line>"); // raw HTML escaped, never literal
    expect(html).toContain("Adds the server-side capture mutation.");
  });

  it("falls back to escaped plain lines for an unknown file type", async () => {
    const block: DiffBlock = {
      type: "diff", id: "d2", title: "data", path: "fixtures/data.unknownext",
      hunks: [{ header: "@@ -1 +1 @@", lines: ["+a < b"] }],
    };
    const html = await renderDiff(block);
    expect(html).toContain('class="vs-line vs-add"');
    expect(html).toContain("a &lt; b");
    expect(html).not.toContain('style="color:'); // no shiki output
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- diff.test`
Expected: FAIL — the current sync renderer returns a string with no `vs-gutter`/`style="color:` and the `await` resolves a plain string (assertions fail).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/renderers/diff.ts` with:

```ts
import { escapeHtml } from "../html.js";
import { highlightLines, langFromPath } from "../highlight.js";
import type { DiffBlock, DiffHunk } from "../blocks.js";

function lineClass(line: string): "vs-add" | "vs-del" | "vs-ctx" {
  if (line.startsWith("+")) return "vs-add";
  if (line.startsWith("-")) return "vs-del";
  return "vs-ctx";
}

function marker(line: string): string {
  if (line.startsWith("+")) return "+";
  if (line.startsWith("-")) return "-";
  return " ";
}

function stripMarker(line: string): string {
  return line.length ? line.slice(1) : line;
}

async function renderHunk(
  hunk: DiffHunk,
  lang: string,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const stripped = hunk.lines.map(stripMarker).join("\n");
  const highlighted = await highlightLines(stripped, lang, onWarn);
  const rows = hunk.lines
    .map((l, i) => {
      const gutter = `<span class="vs-gutter">${escapeHtml(marker(l))}</span>`;
      const content = highlighted ? highlighted[i] : escapeHtml(stripMarker(l));
      return `<div class="vs-line ${lineClass(l)}">${gutter}${content}</div>`;
    })
    .join("");
  const annotation = hunk.annotation
    ? `<aside class="vs-annotation">${escapeHtml(hunk.annotation)}</aside>`
    : "";
  return (
    `<div class="vs-hunk">` +
    `<div class="vs-hunk-header">${escapeHtml(hunk.header)}</div>` +
    `<pre class="vs-hunk-body">${rows}</pre>${annotation}</div>`
  );
}

export async function renderDiff(
  block: DiffBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const lang = langFromPath(block.path);
  const hunks = await Promise.all(block.hunks.map((h) => renderHunk(h, lang, onWarn)));
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    hunks.join("") +
    `</section>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- diff.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in `src/assemble.ts` only (it still calls `renderDiff` synchronously — fixed in Task 6). No errors in `src/renderers/diff.ts`. This is expected; proceed.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/diff.ts test/diff.test.ts
git commit -m "$(cat <<'EOF'
feat: syntax-highlight diff hunks via shiki with plaintext fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: annotated-code renderer

**Files:**
- Create: `src/renderers/annotated-code.ts`
- Test: `test/annotated-code.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/annotated-code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderAnnotatedCode } from "../src/renderers/annotated-code.js";
import type { AnnotatedCodeBlock } from "../src/blocks.js";

const base = (annotations: { line: number; note: string }[]): AnnotatedCodeBlock => ({
  type: "annotated-code", id: "ac", title: "capture flow", lang: "ts",
  code: "const id = order.id;\nawait paypal.capture(id);\nreturn ok;",
  annotations,
});

describe("renderAnnotatedCode", () => {
  it("renders highlighted, line-numbered code with notes aligned to their lines", async () => {
    const html = await renderAnnotatedCode(base([{ line: 2, note: "calls PayPal to capture" }]));
    expect(html).toContain('class="vs-block vs-annotated"');
    expect(html).toContain('class="vs-lineno"');
    expect(html).toContain('style="color:'); // shiki ran
    expect(html).toContain("calls PayPal to capture");
  });

  it("skips out-of-range annotations and warns", async () => {
    const warnings: string[] = [];
    const html = await renderAnnotatedCode(base([{ line: 99, note: "nope" }]), (m) => warnings.push(m));
    expect(html).not.toContain("nope");
    expect(warnings.some((w) => w.includes("out of range"))).toBe(true);
  });

  it("stacks multiple notes on the same line", async () => {
    const html = await renderAnnotatedCode(
      base([{ line: 2, note: "first note" }, { line: 2, note: "second note" }]),
    );
    expect(html).toContain("first note");
    expect(html).toContain("second note");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- annotated-code`
Expected: FAIL — `Cannot find module '../src/renderers/annotated-code.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/renderers/annotated-code.ts`:

```ts
import { escapeHtml } from "../html.js";
import { highlightLines } from "../highlight.js";
import type { AnnotatedCodeBlock } from "../blocks.js";

export async function renderAnnotatedCode(
  block: AnnotatedCodeBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const codeLines = block.code.split("\n");
  const highlighted = await highlightLines(block.code, block.lang, onWarn);

  const notesByLine = new Map<number, string[]>();
  for (const a of block.annotations) {
    if (a.line < 1 || a.line > codeLines.length) {
      onWarn?.(
        `annotated-code "${block.id}": annotation line ${a.line} out of range ` +
        `(1..${codeLines.length}); skipped`,
      );
      continue;
    }
    const arr = notesByLine.get(a.line) ?? [];
    arr.push(a.note);
    notesByLine.set(a.line, arr);
  }

  const rows = codeLines
    .map((raw, i) => {
      const lineNo = i + 1;
      const content = highlighted ? highlighted[i] : escapeHtml(raw);
      const notes = (notesByLine.get(lineNo) ?? [])
        .map((n) => `<span class="note">&#9664; ${escapeHtml(n)}</span>`)
        .join("");
      return (
        `<div class="vs-arow">` +
        `<span class="vs-lineno">${lineNo}</span>` +
        `<code class="vs-code">${content}</code>` +
        `<div class="vs-notes">${notes}</div>` +
        `</div>`
      );
    })
    .join("");

  return (
    `<section class="vs-block vs-annotated">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    rows +
    `</section>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- annotated-code`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in `src/assemble.ts` only (still throws for `annotated-code` — fixed in Task 6). No errors in the new file.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/annotated-code.ts test/annotated-code.test.ts
git commit -m "$(cat <<'EOF'
feat: annotated-code renderer (right-margin notes, highlighted)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: questions renderer

**Files:**
- Create: `src/renderers/questions.ts`
- Test: `test/questions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/questions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderQuestions } from "../src/renderers/questions.js";
import type { QuestionsBlock } from "../src/blocks.js";

describe("renderQuestions", () => {
  it("renders each question as a card with its recommended default, escaping HTML", () => {
    const block: QuestionsBlock = {
      type: "questions", id: "q", title: "Open questions",
      questions: [
        { question: "Use <Stripe> or PayPal?", recommendedDefault: "PayPal" },
        { question: "Refund window?", recommendedDefault: "30 days" },
      ],
    };
    const html = renderQuestions(block);
    expect(html).toContain('class="vs-block vs-questions"');
    expect(html).toContain('class="vs-question"');
    expect(html).toContain("Use &lt;Stripe&gt; or PayPal?");
    expect(html).toContain("Recommended:");
    expect(html).toContain("PayPal");
    expect(html).toContain("30 days");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- questions`
Expected: FAIL — `Cannot find module '../src/renderers/questions.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/renderers/questions.ts`:

```ts
import { escapeHtml } from "../html.js";
import type { QuestionsBlock } from "../blocks.js";

export function renderQuestions(block: QuestionsBlock): string {
  const cards = block.questions
    .map(
      (q) =>
        `<div class="vs-question">` +
        `<p class="vs-q">${escapeHtml(q.question)}</p>` +
        `<p class="vs-recommended">` +
        `<span class="vs-rec-label">Recommended:</span> ${escapeHtml(q.recommendedDefault)}` +
        `</p>` +
        `</div>`,
    )
    .join("");
  return (
    `<section class="vs-block vs-questions">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    cards +
    `</section>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- questions`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in `src/assemble.ts` only (still throws for `questions` — fixed in Task 6). No errors in the new file.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/questions.ts test/questions.test.ts
git commit -m "$(cat <<'EOF'
feat: questions renderer (recommended-default cards)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Highlighted + sanitized prose

**Files:**
- Modify: `src/renderers/prose.ts`
- Test: `test/prose.test.ts` (update existing — renderer becomes async)

- [ ] **Step 1: Update the existing test (and add highlight + sanitize cases)**

Replace the entire contents of `test/prose.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { renderProse } from "../src/renderers/prose.js";

describe("renderProse", () => {
  it("renders markdown to an HTML block fragment", async () => {
    const html = await renderProse({ type: "prose", id: "p", markdown: "# Hi\n\nSome **bold**." });
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('class="vs-block vs-prose"');
  });

  it("syntax-highlights fenced code and the highlighting survives sanitization", async () => {
    const md = "```ts\nconst x = 1;\n```";
    const html = await renderProse({ type: "prose", id: "p2", markdown: md });
    expect(html).toContain('class="shiki'); // shiki <pre> survived
    expect(html).toContain('style="color:'); // inline token color survived
  });

  it("strips scripts, event handlers, and javascript: URLs", async () => {
    const md =
      "Hello\n\n<script>alert(1)</script>\n\n" +
      '<a href="javascript:alert(2)" onclick="alert(3)">click</a>';
    const html = await renderProse({ type: "prose", id: "p3", markdown: md });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Hello");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prose.test`
Expected: FAIL — current `renderProse` is sync (no highlighting, no sanitization); `class="shiki` and the sanitization assertions fail.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/renderers/prose.ts` with:

```ts
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { ProseBlock } from "../blocks.js";
import { highlightCode } from "../highlight.js";

const HEX_OR_RGB = [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i];

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "blockquote",
    "pre", "code", "span", "a", "em", "strong", "del", "hr", "br",
    "table", "thead", "tbody", "tr", "th", "td", "img",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt"],
    pre: ["class", "style"],
    code: ["class", "style"],
    span: ["class", "style"],
  },
  allowedStyles: {
    "*": { color: HEX_OR_RGB, "background-color": HEX_OR_RGB },
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export async function renderProse(
  block: ProseBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const md = new Marked({ async: true });
  md.use({
    async: true,
    walkTokens: async (token) => {
      if (token.type === "code") {
        const t = token as { text: string; lang?: string; highlighted?: string };
        t.highlighted = await highlightCode(t.text, t.lang || "text", onWarn);
      }
    },
    renderer: {
      code(token) {
        return (token as { highlighted?: string }).highlighted ?? "";
      },
    },
  });

  const body = (await md.parse(block.markdown)) as string;
  const safe = sanitizeHtml(body, SANITIZE_OPTS);
  return `<section class="vs-block vs-prose">${safe}</section>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- prose.test`
Expected: PASS (3 tests). If marked's `renderer.code` signature differs in the installed version, the implementer may adapt the token access, but must keep the walkTokens-then-render pattern and the sanitize step intact.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in `src/assemble.ts` only (calls `renderProse` synchronously — fixed in Task 6). No errors in `src/renderers/prose.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/prose.ts test/prose.test.ts
git commit -m "$(cat <<'EOF'
feat: highlight prose fences and sanitize prose HTML (fast-follow #3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire renderers into assemble (async)

**Files:**
- Modify: `src/assemble.ts`
- Test: `test/assemble.test.ts` (update existing + add all-block-types case)

- [ ] **Step 1: Update the test**

Replace the entire contents of `test/assemble.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { assemble } from "../src/assemble.js";
import type { Block } from "../src/blocks.js";

describe("assemble", () => {
  it("produces one self-contained HTML doc with inlined CSS, header, and rendered blocks", async () => {
    const blocks: Block[] = [
      { type: "prose", id: "p", markdown: "Intro **text**." },
      { type: "diagram", id: "flow", title: "Flow", kind: "flowchart", d2: "a -> b" },
    ];
    const html = await assemble(blocks, {
      title: "Test Plan", source: "spec.md", status: { level: "green", text: "ready" },
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<style>");
    expect(html).not.toContain("<link");
    expect(html).toContain("Test Plan");
    expect(html).toContain("spec.md");
    expect(html).toContain('class="vs-status green"');
    expect(html).toContain("<strong>text</strong>");
    expect(html).toContain("<svg");
    expect(html).not.toContain("<script");
  });

  it("renders annotated-code and questions blocks without throwing", async () => {
    const blocks: Block[] = [
      {
        type: "annotated-code", id: "ac", title: "flow", lang: "ts",
        code: "const a = 1;\nconst b = 2;",
        annotations: [{ line: 1, note: "first" }],
      },
      {
        type: "questions", id: "q", title: "Open questions",
        questions: [{ question: "Ship it?", recommendedDefault: "yes" }],
      },
    ];
    const html = await assemble(blocks, { title: "All Blocks", source: "spec.md" });
    expect(html).toContain('class="vs-block vs-annotated"');
    expect(html).toContain('class="vs-block vs-questions"');
    expect(html).toContain("first");
    expect(html).toContain("Ship it?");
    expect(html).not.toContain("<script");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- assemble.test`
Expected: FAIL — the second test throws (`renderer for "annotated-code" is not implemented`).

- [ ] **Step 3: Write the implementation**

In `src/assemble.ts`, add these imports after the existing renderer imports (after the `renderApi` import on line 11):

```ts
import { renderAnnotatedCode } from "./renderers/annotated-code.js";
import { renderQuestions } from "./renderers/questions.js";
```

Then replace the entire `const fragments = blocks.map((b) => { ... });` block (lines 39–58) with:

```ts
  const fragments = await Promise.all(
    blocks.map(async (b) => {
      switch (b.type) {
        case "diagram":
        case "schema": {
          const r = svgById.get(b.id)!;
          const link = r.editable
            ? `<div class="vs-edit"><a href="${escapeHtml(r.editable)}">open in Excalidraw</a></div>`
            : "";
          // r.svg is trusted: produced by the d2 binary (or dormant Excalidraw), which emit no <script>.
          return `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${r.svg}${link}</section>`;
        }
        case "prose": return await renderProse(b, opts.onWarn);
        case "file-tree": return renderFileTree(b);
        case "diff": return await renderDiff(b, opts.onWarn);
        case "api": return renderApi(b);
        case "annotated-code": return await renderAnnotatedCode(b, opts.onWarn);
        case "questions": return renderQuestions(b);
      }
    }),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- assemble.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the whole project now compiles — all renderer call sites are async-correct).

- [ ] **Step 6: Commit**

```bash
git add src/assemble.ts test/assemble.test.ts
git commit -m "$(cat <<'EOF'
feat: wire annotated-code + questions renderers; assemble fully async

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Theme styling for the new renderers

**Files:**
- Modify: `assets/template.css`

- [ ] **Step 1: Append the new styles**

Append the following to the end of `assets/template.css`:

```css
/* shiki code blocks (prose fences) */
.shiki, .shiki-plain { margin:0; padding:12px 14px; border-radius:8px; overflow-x:auto;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.85em; }
.shiki-plain { background:#f6f5f1; white-space:pre; }

/* diff gutter marker (sits before the highlighted line content) */
.vs-gutter { display:inline-block; width:1.2em; color:var(--ctx); user-select:none; }

/* annotated-code: line-number | code | right-margin notes */
.vs-arow { display:grid; grid-template-columns:2.5em 1fr 16em; gap:10px; align-items:start; }
.vs-lineno { color:var(--ctx); text-align:right; font-family:ui-monospace,monospace;
  font-size:0.85em; user-select:none; }
.vs-code { font-family:ui-monospace,monospace; font-size:0.85em; white-space:pre; overflow-x:auto; }
.vs-notes .note { display:block; font-size:0.85em; color:var(--ctx); margin-bottom:2px; }
@media (max-width:640px) {
  .vs-arow { grid-template-columns:2.5em 1fr; }
  .vs-notes { grid-column:2; }
}

/* questions cards */
.vs-question { border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin:10px 0; }
.vs-q { font-weight:600; margin:0 0 6px; }
.vs-recommended { margin:0; font-size:0.9em; }
.vs-rec-label { color:var(--add); font-weight:600; }
```

- [ ] **Step 2: Verify the full suite still passes**

Run: `npm test`
Expected: all tests PASS (CSS is inlined verbatim by `assemble`; no test asserts on its content, so nothing breaks).

- [ ] **Step 3: Commit**

```bash
git add assets/template.css
git commit -m "$(cat <<'EOF'
style: theme shiki blocks, annotated-code grid, and questions cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full verification + ppgl #183 regression

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: every test passes; no type errors.

- [ ] **Step 2: Regenerate the ppgl #183 recap and check it**

Run:

```bash
npm run recap -- --repo /Users/scottrogener/Projects/ppgl --pr 183 --out /tmp/recap-183.html 2>/tmp/recap-183.err
echo "--- stderr warnings ---"; cat /tmp/recap-183.err
echo "--- script tags (expect 0) ---"; grep -c "<script" /tmp/recap-183.html || true
echo "--- shiki-highlighted diffs present (expect >0) ---"; grep -c 'style="color:' /tmp/recap-183.html || true
echo "--- captureOrder present (expect >=1) ---"; grep -c "captureOrder" /tmp/recap-183.html || true
echo "--- doc size ---"; wc -c < /tmp/recap-183.html
```

Expected:
- stderr warnings: empty (valid input produces no degradation warnings).
- script tags: `0`.
- `style="color:` count: `> 0` (diffs are now syntax-highlighted).
- `captureOrder`: `>= 1`.
- doc size: larger than the pre-M2 baseline (~160KB) due to inline token styles — this increase is expected, not a regression.

If the PR number/SHA has drifted in the local ppgl checkout, use the canonical SHA `3559f61` via `--commit 3559f61` instead of `--pr 183`.

- [ ] **Step 3: Spot-check the rendered output**

Open `/tmp/recap-183.html` in a browser (or run `open /tmp/recap-183.html` on macOS) and confirm: diffs show colored syntax, the file tree and schema/API blocks render as before, and the layout is intact. This is a manual visual confirmation; no code change.

- [ ] **Step 4: Final commit (only if anything changed)**

If Steps 1–3 surfaced a fix, commit it with an appropriate message and the required co-author trailer. Otherwise, there is nothing to commit — M2 is complete.

---

## Notes for the Implementer

- **Async ripple:** Tasks 2 and 5 intentionally leave `src/assemble.ts` with type errors until Task 6 wires the async calls. The per-task "Expected" notes call this out — do not try to "fix" assemble early or out of task order.
- **Graceful degradation is a hard requirement:** highlighting must never throw out of a renderer. Every Shiki call path has a plaintext fallback; preserve it.
- **Sanitization must not strip Shiki:** if the prose highlight test shows `style="color:` being removed, the `allowedStyles`/`allowedAttributes` for `span`/`code`/`pre` are misconfigured — fix the sanitize options, not the highlighter.
- **Run single tests** during a task (`npm test -- <name>`); run the full suite only in Tasks 7–8.
