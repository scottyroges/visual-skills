# Worked Examples Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `ExampleBlock` (walkthrough/contrast variants; static/reveal/step modes) rendered on all four surfaces (visual-spec, visual-recap, visual-doc, visual-atlas), plus inline `example?` one-liners on decisions/risks/phases/scope, with grounding (`source`) and teaching (`lesson`) enforced by visible fallbacks and lint.

**Architecture:** One block type + `normalizeExample()` guard in `src/blocks.ts`; one renderer `src/renderers/example.ts`; one stylesheet `assets/example.css` (a `--ex-*` token layer bridges the disjoint `review.css` / `template.css` vocabularies); one judgment lint `src/lint-examples.ts` called from every surface's existing lint. The type joins each union in that surface's task so every task compiles green: `SpecBlock` (Task 4), shared `Block` (Task 6 — the exhaustive coverage test then forces recap + doc renderers), `AtlasBlock` (Task 7).

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), vitest, hand-built HTML strings + CSS (no frameworks), pure-CSS radio stepper (no view-time JS).

**Spec:** `docs/superpowers/specs/2026-08-04-worked-examples-design.md` — read it first; it is the contract.

## Global Constraints

- Branch: `feat/worked-examples-block` (already exists, has the spec commits). One PR at the end; each task is one commit.
- Run `npx tsc --noEmit` after every code change (user rule: typecheck after changes).
- Run only the tests named in each task, not the full suite (user rule).
- All lint output is **warnings via `onWarn`** — never throw, never block rendering (house rule; `validateSpecOpts` is the precedent).
- Missing required JSON fields must produce a **visible ⚠ marker in the HTML** plus a warning — the artifact itself shows the omission.
- Escape all author-provided text going into attributes/labels/headers with `escapeHtml`; stage bodies go through `renderMarkdown` (trusted pipeline), short fields through `renderInlineMarkdown`.
- Step mode: pure CSS, max 8 stages (`MAX_STEP_STAGES = 8`), over-cap and contrast+step coerce to static in `normalizeExample`, never in the renderer.
- CSS classes are namespaced `vs-example` / `vs-ex-*`; tints resolve through `--ex-*` custom properties with fallback chains covering both token vocabularies (exact chains in Task 2).
- Comment density/idiom: match existing files — terse `//` comments explaining *why*, section banners like `// ---- x ----` only where neighbors have them.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `ExampleBlock` types + `normalizeExample()` guard

**Files:**
- Modify: `src/blocks.ts` (append after the `OverviewBlock` interface, before the `Block` union — do NOT add to the `Block` union yet; that happens in Task 6 so intermediate tasks compile)
- Test: `test/example-normalize.test.ts` (create)

**Interfaces:**
- Produces (used by every later task):
  - `type ExampleStageKind = "input" | "step" | "output" | "counter"`
  - `interface ExampleStage { label: string; kind?: ExampleStageKind; body: string; note?: string; side?: "a" | "b"; reveal?: boolean }`
  - `interface ExampleBlock { type: "example"; id: string; title: string; badge?: string; intro?: string; variant?: "walkthrough" | "contrast"; mode?: "static" | "reveal" | "step"; columns?: [string, string]; source: string; stages: ExampleStage[]; lesson: string }`
  - `const MAX_STEP_STAGES = 8`
  - `interface NormalizedExample { block: Required-ish ExampleBlock (variant/mode/columns always set, stages sanitized); problems: string[] }`
  - `function normalizeExample(raw: ExampleBlock): NormalizedExample`

- [ ] **Step 1: Write the failing tests**

Create `test/example-normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeExample, MAX_STEP_STAGES, type ExampleBlock } from "../src/blocks.js";

const base = (over: Partial<ExampleBlock> = {}): ExampleBlock => ({
  type: "example", id: "ex", title: "T", source: "test/fixtures/x.json", lesson: "the point",
  stages: [{ label: "in", kind: "input", body: "a" }, { label: "out", kind: "output", body: "b" }],
  ...over,
});

describe("normalizeExample", () => {
  it("applies defaults and passes a well-formed block through clean", () => {
    const { block, problems } = normalizeExample(base());
    expect(problems).toEqual([]);
    expect(block.variant).toBe("walkthrough");
    expect(block.mode).toBe("static");
    expect(block.columns).toEqual(["Before", "After"]);
    expect(block.stages).toHaveLength(2);
  });

  it("flags missing source and lesson", () => {
    const { problems } = normalizeExample(base({ source: "", lesson: undefined as unknown as string }));
    expect(problems.some((p) => p.includes("no source"))).toBe(true);
    expect(problems.some((p) => p.includes("no lesson"))).toBe(true);
  });

  it("survives non-array stages and hostile entries like [null, {}]", () => {
    const { block, problems } = normalizeExample(base({ stages: "nope" as unknown as ExampleBlock["stages"] }));
    expect(block.stages).toEqual([]);
    expect(problems.some((p) => p.includes("not an array"))).toBe(true);

    const hostile = normalizeExample(base({ stages: [null, {}] as unknown as ExampleBlock["stages"] }));
    expect(hostile.block.stages).toHaveLength(1);            // null dropped, {} kept with empty fields
    expect(hostile.problems.some((p) => p.includes("dropped"))).toBe(true);
    expect(hostile.problems.some((p) => p.includes("no label"))).toBe(true);
    expect(hostile.problems.some((p) => p.includes("no body"))).toBe(true);
  });

  it("coerces contrast+step and over-cap step to static, with a problem each", () => {
    const cs = normalizeExample(base({ variant: "contrast", mode: "step" }));
    expect(cs.block.mode).toBe("static");
    expect(cs.problems.some((p) => p.includes("seeing both at once"))).toBe(true);

    const many = Array.from({ length: MAX_STEP_STAGES + 1 }, (_, i) => ({ label: `s${i}`, body: "x" }));
    const over = normalizeExample(base({ mode: "step", stages: many }));
    expect(over.block.mode).toBe("static");
    expect(over.problems.some((p) => p.includes("step cap"))).toBe(true);
  });

  it("normalizes invalid kind/side/reveal values instead of trusting them", () => {
    const { block } = normalizeExample(base({
      stages: [{ label: "x", body: "y", kind: "bogus", side: "c", reveal: "yes" } as unknown as ExampleBlock["stages"][number]],
    }));
    expect(block.stages[0].kind).toBe("step");
    expect(block.stages[0].side).toBeUndefined();
    expect(block.stages[0].reveal).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/example-normalize.test.ts`
Expected: FAIL — `normalizeExample` is not exported.

- [ ] **Step 3: Implement in `src/blocks.ts`**

Append after `OverviewBlock` (keep the `Block` union unchanged):

```ts
// ---- worked examples (spec: docs/superpowers/specs/2026-08-04-worked-examples-design.md) ----

export type ExampleStageKind = "input" | "step" | "output" | "counter";

export interface ExampleStage {
  label: string;                       // "Input — window 2 of burn-unit-wanderer"
  kind?: ExampleStageKind;             // default "step"; drives the card tint
  body: string;                        // block markdown (fences + tables OK)
  note?: string;                       // one-line aside under the card
  side?: "a" | "b";                    // contrast only; omit → shared context, full width
  reveal?: boolean;                    // mode:"reveal" — this stage starts collapsed
}

export interface ExampleBlock {
  type: "example";
  id: string;
  title: string;
  badge?: string;
  intro?: string;
  variant?: "walkthrough" | "contrast";
  mode?: "static" | "reveal" | "step"; // default "static"
  columns?: [string, string];          // contrast headers, default ["Before", "After"]
  source: string;                      // REQUIRED — provenance (the honesty floor)
  stages: ExampleStage[];
  lesson: string;                      // REQUIRED — the one-line takeaway
}

/** Step mode writes out :nth-of-type selectors, so it has a hard structural cap. */
export const MAX_STEP_STAGES = 8;

export interface NormalizedExample { block: ExampleBlock; problems: string[]; }

/**
 * Guard hand-authored JSON before lint AND render (both consume the normalized block; neither
 * touches raw input). Never throws: hostile shapes ("stages": [null, {}], wrong-typed fields)
 * degrade to empty strings / dropped entries, each with a problem message the caller surfaces
 * via onWarn. The renderer turns empty required fields into visible ⚠ markers.
 */
export function normalizeExample(raw: ExampleBlock): NormalizedExample {
  const problems: string[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const id = str(r.id) || "example";

  const stages: ExampleStage[] = [];
  if (!Array.isArray(r.stages)) {
    problems.push(`example "${id}": stages is not an array — block renders a placeholder`);
  } else {
    r.stages.forEach((s, i) => {
      if (typeof s !== "object" || s === null) {
        problems.push(`example "${id}": stage ${i + 1} is not an object — dropped`);
        return;
      }
      const o = s as Record<string, unknown>;
      if (!str(o.label).trim()) problems.push(`example "${id}": stage ${i + 1} has no label`);
      if (!str(o.body).trim()) problems.push(`example "${id}": stage ${i + 1} has no body`);
      stages.push({
        label: str(o.label),
        kind: o.kind === "input" || o.kind === "output" || o.kind === "counter" ? o.kind : "step",
        body: str(o.body),
        note: str(o.note) || undefined,
        side: o.side === "a" || o.side === "b" ? o.side : undefined,
        reveal: o.reveal === true,
      });
    });
    if (r.stages.length > 0 && stages.length === 0) {
      problems.push(`example "${id}": every stage was malformed — block renders a placeholder`);
    }
  }

  const variant = r.variant === "contrast" ? "contrast" : "walkthrough";
  let mode: "static" | "reveal" | "step" = r.mode === "reveal" || r.mode === "step" ? r.mode : "static";
  if (mode === "step" && variant === "contrast") {
    problems.push(`example "${id}": contrast is for seeing both at once — mode:"step" rendered static`);
    mode = "static";
  }
  if (mode === "step" && stages.length > MAX_STEP_STAGES) {
    problems.push(`example "${id}": ${stages.length} stages exceeds the ${MAX_STEP_STAGES}-stage step cap — rendered as a static rail; split it`);
    mode = "static";
  }

  if (!str(r.source).trim()) problems.push(`example "${id}": no source — name the fixture, test, or run artifact it came from`);
  if (!str(r.lesson).trim()) problems.push(`example "${id}": no lesson — write the one-line takeaway, or pick a different instance`);

  const c = r.columns;
  const columns: [string, string] =
    Array.isArray(c) && typeof c[0] === "string" && typeof c[1] === "string" ? [c[0], c[1]] : ["Before", "After"];

  return {
    block: {
      type: "example", id, title: str(r.title), badge: str(r.badge) || undefined,
      intro: str(r.intro) || undefined, variant, mode, columns,
      source: str(r.source), stages, lesson: str(r.lesson),
    },
    problems,
  };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run test/example-normalize.test.ts` → PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/blocks.ts test/example-normalize.test.ts
git commit -m "feat: ExampleBlock types + normalizeExample guard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `assets/example.css` + `src/renderers/example.ts`

**Files:**
- Create: `assets/example.css`
- Create: `src/renderers/example.ts`
- Test: `test/example-block.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeExample`, `ExampleBlock`, `ExampleStage` from `../blocks.js`; `renderMarkdown`, `renderInlineMarkdown` from `./markdown.js`; `escapeHtml` from `../html.js`.
- Produces: `interface RenderExampleOpts { ownHeader: boolean; onWarn?: (m: string) => void }` and `async function renderExample(raw: ExampleBlock, opts: RenderExampleOpts): Promise<string>` — returns inner HTML (no `<section>` wrapper). `ownHeader: false` for spec/atlas (their assemblers print `sectionHeader`), `true` for doc/recap (emits its own `.vs-ex-head` with `title`/`badge`).

- [ ] **Step 1: Write the failing tests**

Create `test/example-block.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderExample } from "../src/renderers/example.js";
import type { ExampleBlock } from "../src/blocks.js";

const base = (over: Partial<ExampleBlock> = {}): ExampleBlock => ({
  type: "example", id: "ex-roll", title: "One window through the roll-call",
  source: "test/fixtures/burn-unit-wanderer.json, msgs 4–7", lesson: "per-sentence means holes are visible",
  stages: [
    { label: "Input — window 2", kind: "input", body: "four sentences" },
    { label: "Verdicts", kind: "step", body: "one per sentence" },
    { label: "Boundaries", kind: "output", body: "two survive" },
  ],
  ...over,
});

describe("renderExample", () => {
  it("renders a static rail: tinted stages, arrows between, provenance line, lesson band", async () => {
    const html = await renderExample(base(), { ownHeader: false });
    expect(html).toContain('data-kind="input"');
    expect(html).toContain('data-kind="output"');
    expect((html.match(/class="vs-ex-arrow"/g) ?? []).length).toBe(2);   // n-1 arrows
    expect(html).toContain("vs-ex-src");
    expect(html).toContain("burn-unit-wanderer.json");
    expect(html).toContain("vs-ex-lesson");
    expect(html).not.toContain("vs-ex-head");                            // ownHeader:false → no own title
  });

  it("ownHeader:true emits the title header; escapes author text", async () => {
    const html = await renderExample(base({ title: "<b>x</b>", badge: "worked" }), { ownHeader: true });
    expect(html).toContain("vs-ex-head");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });

  it("renders stage bodies as markdown (fences become code blocks)", async () => {
    const html = await renderExample(base({
      stages: [{ label: "in", kind: "input", body: "```json\n{\"a\":1}\n```" }],
    }), { ownHeader: false });
    expect(html).toMatch(/<pre|<code/);
  });

  it("contrast: shared stage full-width, a/b columns with headers, empty side gets a visible marker", async () => {
    const html = await renderExample(base({
      variant: "contrast", columns: ["Old", "New"],
      stages: [
        { label: "the paragraph", kind: "input", body: "shared" },
        { label: "merged", kind: "output", body: "one segment", side: "a" },
      ],
    }), { ownHeader: false });
    expect(html).toContain("vs-ex-cols");
    expect(html).toContain(">Old<");
    expect(html).toContain(">New<");
    expect(html).toContain("empty column");                              // side b missing → ⚠ marker
  });

  it("reveal: flagged stage collapses into <details>", async () => {
    const html = await renderExample(base({
      mode: "reveal",
      stages: [
        { label: "in", kind: "input", body: "x" },
        { label: "out", kind: "output", body: "y", reveal: true },
      ],
    }), { ownHeader: false });
    expect(html).toContain('<details class="vs-ex-reveal"');
    expect(html).toContain("Show:");
  });

  it("step: fieldset + sr-only legend, aria-labels on inputs, N+1 radios, All labeled", async () => {
    const html = await renderExample(base({ mode: "step" }), { ownHeader: false });
    expect(html).toContain("<fieldset");
    expect(html).toContain("Walkthrough stages");
    expect((html.match(/class="vs-ex-radio"/g) ?? []).length).toBe(4);   // 3 stages + All
    expect(html).toContain('aria-label="Stage 1 of 3: Input — window 2"');
    expect(html).toContain('aria-label="Show all stages"');
    expect(html).toContain(">All<");
  });

  it("malformed JSON: missing source/lesson/stages render visible markers, problems reach onWarn", async () => {
    const warns: string[] = [];
    const html = await renderExample(
      { type: "example", id: "bad", title: "B" } as ExampleBlock,
      { ownHeader: true, onWarn: (m) => warns.push(m) },
    );
    expect(html).toContain("no source given");
    expect(html).toContain("no lesson written");
    expect(html).toContain("no stages");
    expect(warns.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/example-block.test.ts`
Expected: FAIL — module `../src/renderers/example.js` not found.

- [ ] **Step 3: Write `src/renderers/example.ts`**

```ts
import { escapeHtml } from "../html.js";
import { renderMarkdown, renderInlineMarkdown } from "./markdown.js";
import { normalizeExample, type ExampleBlock, type ExampleStage } from "../blocks.js";

export interface RenderExampleOpts { ownHeader: boolean; onWarn?: (m: string) => void; }

const KIND_LABEL: Record<NonNullable<ExampleStage["kind"]>, string> =
  { input: "Input", step: "Step", output: "Output", counter: "Counter" };

const MISSING = (msg: string) => `<div class="vs-ex-missing">&#9888; ${msg}</div>`;

async function renderStage(s: ExampleStage, onWarn?: (m: string) => void): Promise<string> {
  const kind = s.kind ?? "step";
  const label = s.label.trim() ? escapeHtml(s.label) : "&#9888; unlabeled stage";
  const body = s.body.trim()
    ? await renderMarkdown(s.body, onWarn)
    : MISSING("empty stage");
  const note = s.note ? `<p class="vs-ex-note">${await renderInlineMarkdown(s.note)}</p>` : "";
  return (
    `<div class="vs-ex-stage" data-kind="${kind}">` +
    `<div class="vs-ex-stage-h"><span class="vs-ex-kind">${KIND_LABEL[kind]}</span>${label}</div>` +
    `<div class="vs-ex-stage-body">${body}</div>${note}</div>`
  );
}

/** Wrap a reveal-flagged stage in <details>; review-viewer's hash-open walker opens these. */
async function stageOrReveal(s: ExampleStage, revealMode: boolean, onWarn?: (m: string) => void): Promise<string> {
  const inner = await renderStage(s, onWarn);
  if (!revealMode || !s.reveal) return inner;
  const hint = s.label.trim() ? escapeHtml(s.label) : "this stage";
  return `<details class="vs-ex-reveal"><summary>Show: ${hint}</summary>${inner}</details>`;
}

async function renderRail(b: ExampleBlock, onWarn?: (m: string) => void): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < b.stages.length; i++) {
    if (i > 0) parts.push(`<div class="vs-ex-arrow" aria-hidden="true">&darr;</div>`);
    parts.push(await stageOrReveal(b.stages[i], b.mode === "reveal", onWarn));
  }
  return `<div class="vs-ex-rail">${parts.join("")}</div>`;
}

async function renderContrast(b: ExampleBlock, onWarn?: (m: string) => void): Promise<string> {
  const shared = b.stages.filter((s) => !s.side);
  const col = async (side: "a" | "b", header: string) => {
    const stages = b.stages.filter((s) => s.side === side);
    const body = stages.length
      ? (await Promise.all(stages.map((s) => stageOrReveal(s, b.mode === "reveal", onWarn)))).join("")
      : MISSING("empty column");
    return `<div class="vs-ex-col" data-side="${side}"><div class="vs-ex-col-h">${escapeHtml(header)}</div>${body}</div>`;
  };
  const sharedHtml = (await Promise.all(shared.map((s) => stageOrReveal(s, b.mode === "reveal", onWarn)))).join("");
  const [ha, hb] = b.columns ?? ["Before", "After"];
  return `<div class="vs-ex-rail">${sharedHtml}</div><div class="vs-ex-cols">${await col("a", ha)}${await col("b", hb)}</div>`;
}

async function renderStepped(b: ExampleBlock, onWarn?: (m: string) => void): Promise<string> {
  const name = `ex-${b.id}`;
  const n = b.stages.length;
  const radios = b.stages.map((s, i) =>
    `<input class="vs-ex-radio" type="radio" name="${escapeHtml(name)}" id="${escapeHtml(b.id)}--${i + 1}"` +
    ` aria-label="Stage ${i + 1} of ${n}: ${escapeHtml(s.label.trim() || "unlabeled")}"${i === 0 ? " checked" : ""}>`,
  ).join("");
  const allRadio =
    `<input class="vs-ex-radio is-all" type="radio" name="${escapeHtml(name)}" id="${escapeHtml(b.id)}--all"` +
    ` aria-label="Show all stages">`;
  const labels = b.stages.map((_, i) => `<label for="${escapeHtml(b.id)}--${i + 1}">${i + 1}</label>`).join("");
  const allLabel = `<label for="${escapeHtml(b.id)}--all">All</label>`;
  const stagesHtml = (await Promise.all(b.stages.map((s) => renderStage(s, onWarn)))).join("");
  // Fieldset wraps radios, labels, AND the rail: the :checked ~ selectors need the radios as
  // preceding siblings of the rail, and the group name must cover the whole switcher.
  return (
    `<fieldset class="vs-ex-stepper"><legend class="vs-ex-srlegend">Walkthrough stages</legend>` +
    `${radios}${allRadio}<div class="vs-ex-steps">${labels}${allLabel}</div>` +
    `<div class="vs-ex-rail">${stagesHtml}</div></fieldset>`
  );
}

export async function renderExample(raw: ExampleBlock, opts: RenderExampleOpts): Promise<string> {
  const { block: b, problems } = normalizeExample(raw);
  for (const p of problems) opts.onWarn?.(p);

  const head = opts.ownHeader
    ? `<div class="vs-ex-head"><h2 class="vs-ex-title">${escapeHtml(b.title)}</h2>` +
      `${b.badge ? `<span class="vs-ex-badge">${escapeHtml(b.badge)}</span>` : ""}</div>`
    : "";
  const intro = b.intro ? `<p class="vs-ex-intro">${await renderInlineMarkdown(b.intro)}</p>` : "";
  const source = b.source.trim()
    ? `<p class="vs-ex-src"><span class="vs-ex-src-tag">source</span>${escapeHtml(b.source)}</p>`
    : `<p class="vs-ex-src is-missing">&#9888; no source given</p>`;
  const lesson = b.lesson.trim()
    ? `<div class="vs-ex-lesson"><span class="vs-ex-lesson-tag">Lesson</span>${await renderInlineMarkdown(b.lesson)}</div>`
    : `<div class="vs-ex-lesson is-missing">&#9888; no lesson written</div>`;

  let bodyHtml: string;
  if (!b.stages.length) bodyHtml = MISSING("no stages");
  else if (b.variant === "contrast") bodyHtml = await renderContrast(b, opts.onWarn);
  else if (b.mode === "step") bodyHtml = await renderStepped(b, opts.onWarn);
  else bodyHtml = await renderRail(b, opts.onWarn);

  const stepCls = b.mode === "step" && b.variant === "walkthrough" && b.stages.length ? " is-step" : "";
  return `<div class="vs-example${stepCls}">${head}${intro}${source}${bodyHtml}${lesson}</div>`;
}
```

- [ ] **Step 4: Write `assets/example.css`**

```css
/* example.css — the shared worked-example block (spec/recap/doc/atlas all inline this).
   The two page families define nearly disjoint light-mode tokens (review.css: --panel/--border/
   --ink-muted…; template.css: --card/--line/--ctx…). Every value resolves through a local --ex-*
   layer whose fallback chain covers both, then a literal. theme.css's dark block defines a
   superset of both, so dark mode needs no special casing. */
.vs-example {
  --ex-line:       var(--border, var(--line, #d8d4c8));
  --ex-panel:      var(--panel, var(--card, #ffffff));
  --ex-muted:      var(--ink-muted, var(--ctx, #57606a));
  --ex-radius:     var(--radius, 8px);
  --ex-mono:       var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  --ex-accent:     var(--accent, var(--link, #2563eb));
  --ex-input:      var(--accent, var(--link, #2563eb));
  --ex-input-bg:   var(--accent-subtle, #eff4ff);
  --ex-input-line: var(--accent-border, #bfdbfe);
  --ex-out:        var(--change, #b45309);
  --ex-out-bg:     var(--change-bg, var(--warn-bg, #fffdf3));
  --ex-out-line:   var(--change-border, #fde68a);
  --ex-counter:    var(--remove, var(--del, #cf222e));
  --ex-counter-bg: var(--remove-bg, var(--del-bg, #ffebe9));
  --ex-counter-line: var(--remove-border, #fecaca);
  margin: 18px 0;
}

.vs-ex-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.vs-ex-title { margin: 0; font-size: 1.1em; }
.vs-ex-badge { font-size: 0.72em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ex-muted); border: 1px solid var(--ex-line); border-radius: 999px; padding: 2px 10px; }
.vs-ex-intro { margin: 0 0 8px; color: var(--ex-muted); }

/* provenance: always visible, above the stages — the reader knows what they're looking at first */
.vs-ex-src { margin: 0 0 12px; font-family: var(--ex-mono); font-size: 0.8em; color: var(--ex-muted); }
.vs-ex-src-tag { font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-right: 8px; }
.vs-ex-src.is-missing, .vs-ex-lesson.is-missing, .vs-ex-missing { color: var(--ex-counter); font-weight: 600; }
.vs-ex-missing { border: 1px dashed var(--ex-counter); border-radius: var(--ex-radius); padding: 10px 14px; }

/* stage cards */
.vs-ex-rail { display: flex; flex-direction: column; gap: 0; }
.vs-ex-stage { border: 1px solid var(--ex-line); border-radius: var(--ex-radius);
  background: var(--ex-panel); padding: 12px 16px; }
.vs-ex-stage-h { font-weight: 600; margin-bottom: 6px; }
.vs-ex-kind { font-size: 0.68em; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
  border: 1px solid var(--ex-line); border-radius: 4px; padding: 1px 7px; margin-right: 9px;
  color: var(--ex-muted); vertical-align: 1px; }
.vs-ex-stage[data-kind="input"]   { border-color: var(--ex-input-line); background: var(--ex-input-bg); }
.vs-ex-stage[data-kind="input"] .vs-ex-kind   { color: var(--ex-input); border-color: var(--ex-input-line); }
.vs-ex-stage[data-kind="output"]  { border-color: var(--ex-out-line); background: var(--ex-out-bg); }
.vs-ex-stage[data-kind="output"] .vs-ex-kind  { color: var(--ex-out); border-color: var(--ex-out-line); }
.vs-ex-stage[data-kind="counter"] { border-color: var(--ex-counter-line); background: var(--ex-counter-bg); }
.vs-ex-stage[data-kind="counter"] .vs-ex-kind { color: var(--ex-counter); border-color: var(--ex-counter-line); }
.vs-ex-stage-body > :first-child { margin-top: 0; }
.vs-ex-stage-body > :last-child { margin-bottom: 0; }
.vs-ex-arrow { text-align: center; color: var(--ex-muted); padding: 2px 0; line-height: 1; }
.vs-ex-note { margin: 6px 0 0; font-size: 0.85em; color: var(--ex-muted); }

/* lesson band — the block always ends on one sentence */
.vs-ex-lesson { margin-top: 12px; padding: 10px 16px; border-left: 3px solid var(--ex-accent);
  background: var(--ex-panel); border-radius: 0 var(--ex-radius) var(--ex-radius) 0; }
.vs-ex-lesson-tag { font-size: 0.7em; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--ex-accent); margin-right: 9px; }

/* contrast columns */
.vs-ex-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
.vs-ex-col-h { font-size: 0.78em; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--ex-muted); margin-bottom: 6px; }
.vs-ex-col[data-side="b"] .vs-ex-col-h { color: var(--ex-out); }
.vs-ex-col .vs-ex-stage { margin-bottom: 8px; }
@media (max-width: 700px) { .vs-ex-cols { grid-template-columns: 1fr; } }

/* reveal */
.vs-ex-reveal { border: 1px dashed var(--ex-line); border-radius: var(--ex-radius); }
.vs-ex-reveal > summary { cursor: pointer; padding: 10px 16px; font-weight: 600; color: var(--ex-accent); }
.vs-ex-reveal > summary:focus-visible { outline: 2px solid var(--ex-accent); outline-offset: -2px; }
.vs-ex-reveal[open] > summary { border-bottom: 1px dashed var(--ex-line); }
.vs-ex-reveal .vs-ex-stage { border: none; }

/* ── step mode: pure-CSS radio stepper (same mechanism as template.css .vs-tabs, but the radios
   stay FOCUSABLE — visually hidden without pointer-events:none — and pair :focus-visible to their
   label via the same written-out nth-of-type pattern as :checked. Cap: 8 stages. ── */
.vs-ex-stepper { border: 0; margin: 0; padding: 0; min-width: 0; }
.vs-ex-srlegend { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.vs-ex-radio { position: absolute; width: 1px; height: 1px; opacity: 0; }
.vs-ex-steps { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.vs-ex-steps label { cursor: pointer; padding: 5px 13px; border: 1px solid var(--ex-line);
  border-radius: 999px; font-size: 0.85em; font-weight: 600; color: var(--ex-muted); }
.vs-example.is-step .vs-ex-stage { display: none; }
/* checked → show nth stage / highlight nth label (n = 1..8; the All radio is .is-all) */
.vs-ex-radio:nth-of-type(1):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(1),
.vs-ex-radio:nth-of-type(2):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(2),
.vs-ex-radio:nth-of-type(3):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(3),
.vs-ex-radio:nth-of-type(4):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(4),
.vs-ex-radio:nth-of-type(5):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(5),
.vs-ex-radio:nth-of-type(6):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(6),
.vs-ex-radio:nth-of-type(7):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(7),
.vs-ex-radio:nth-of-type(8):checked ~ .vs-ex-rail .vs-ex-stage:nth-child(8),
.vs-ex-radio.is-all:checked ~ .vs-ex-rail .vs-ex-stage { display: block; }
.vs-ex-radio:nth-of-type(1):checked ~ .vs-ex-steps label:nth-child(1),
.vs-ex-radio:nth-of-type(2):checked ~ .vs-ex-steps label:nth-child(2),
.vs-ex-radio:nth-of-type(3):checked ~ .vs-ex-steps label:nth-child(3),
.vs-ex-radio:nth-of-type(4):checked ~ .vs-ex-steps label:nth-child(4),
.vs-ex-radio:nth-of-type(5):checked ~ .vs-ex-steps label:nth-child(5),
.vs-ex-radio:nth-of-type(6):checked ~ .vs-ex-steps label:nth-child(6),
.vs-ex-radio:nth-of-type(7):checked ~ .vs-ex-steps label:nth-child(7),
.vs-ex-radio:nth-of-type(8):checked ~ .vs-ex-steps label:nth-child(8),
.vs-ex-radio.is-all:checked ~ .vs-ex-steps label:last-child {
  color: var(--ex-accent); border-color: var(--ex-accent); background: var(--ex-input-bg); }
.vs-ex-radio:nth-of-type(1):focus-visible ~ .vs-ex-steps label:nth-child(1),
.vs-ex-radio:nth-of-type(2):focus-visible ~ .vs-ex-steps label:nth-child(2),
.vs-ex-radio:nth-of-type(3):focus-visible ~ .vs-ex-steps label:nth-child(3),
.vs-ex-radio:nth-of-type(4):focus-visible ~ .vs-ex-steps label:nth-child(4),
.vs-ex-radio:nth-of-type(5):focus-visible ~ .vs-ex-steps label:nth-child(5),
.vs-ex-radio:nth-of-type(6):focus-visible ~ .vs-ex-steps label:nth-child(6),
.vs-ex-radio:nth-of-type(7):focus-visible ~ .vs-ex-steps label:nth-child(7),
.vs-ex-radio:nth-of-type(8):focus-visible ~ .vs-ex-steps label:nth-child(8),
.vs-ex-radio.is-all:focus-visible ~ .vs-ex-steps label:last-child {
  outline: 2px solid var(--ex-accent); outline-offset: 2px; }

/* print: hidden stages are unacceptable on paper; reveal is accepted-collapsed per spec */
@media print {
  .vs-example.is-step .vs-ex-stage { display: block !important; }
  .vs-ex-steps { display: none; }
}

/* inline one-liner on decisions / risks / phases / scope-out */
.vs-ex-inline { margin-top: 6px; font-size: 0.85em; color: var(--ex-muted); }
.vs-ex-inline-tag { font-weight: 700; font-style: italic; margin-right: 7px; color: var(--ex-muted); }
```

- [ ] **Step 5: Verify**

Run: `npx vitest run test/example-block.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderers/example.ts assets/example.css test/example-block.test.ts
git commit -m "feat: renderExample renderer + example.css (rail/contrast/reveal/step)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `src/lint-examples.ts` judgment rules

**Files:**
- Create: `src/lint-examples.ts`
- Test: `test/lint-examples.test.ts` (create)

**Interfaces:**
- Consumes: `normalizeExample`, `ExampleBlock` from `./blocks.js`.
- Produces: `function lintExamples(examples: ExampleBlock[]): string[]` — judgment nudges only; normalization *problems* are NOT re-emitted here (the renderer surfaces those), so assemblers can call both without duplicate warnings. `const FAT_STAGE_CHARS = 1200`.

- [ ] **Step 1: Write the failing tests**

Create `test/lint-examples.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { lintExamples, FAT_STAGE_CHARS } from "../src/lint-examples.js";
import type { ExampleBlock } from "../src/blocks.js";

const ex = (over: Partial<ExampleBlock> = {}): ExampleBlock => ({
  type: "example", id: "ex", title: "T", source: "test/x.json", lesson: "l",
  stages: [
    { label: "a", kind: "input", body: "x" },
    { label: "b", body: "y" },
    { label: "c", kind: "output", body: "z" },
  ],
  ...over,
});
const stageN = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `s${i}`, body: "x" }));

describe("lintExamples", () => {
  it("clean example → no warnings", () => {
    expect(lintExamples([ex()])).toEqual([]);
  });
  it("under-stepped: step with <3 stages", () => {
    const w = lintExamples([ex({ mode: "step", stages: stageN(2) })]);
    expect(w.some((m) => m.includes("hides content that already fits"))).toBe(true);
  });
  it("under-walked: 5+ stage static walkthrough", () => {
    const w = lintExamples([ex({ stages: stageN(5) })]);
    expect(w.some((m) => m.includes('consider mode:"step"'))).toBe(true);
  });
  it("fat stage body", () => {
    const w = lintExamples([ex({ stages: [{ label: "a", body: "x".repeat(FAT_STAGE_CHARS + 1) }] })]);
    expect(w.some((m) => m.includes("trim to the minimum"))).toBe(true);
  });
  it("dead reveal: mode reveal, nothing flagged", () => {
    const w = lintExamples([ex({ mode: "reveal" })]);
    expect(w.some((m) => m.includes("nothing is hidden"))).toBe(true);
  });
  it("reveal spam: two reveal blocks on one page", () => {
    const r = (id: string): ExampleBlock =>
      ex({ id, mode: "reveal", stages: [{ label: "a", body: "x", reveal: true }, { label: "b", body: "y" }] });
    expect(lintExamples([r("e1"), r("e2")]).some((m) => m.includes("predict-then-check"))).toBe(true);
    expect(lintExamples([r("e1")]).some((m) => m.includes("predict-then-check"))).toBe(false);
  });
  it("flat contrast (no sides) and one-sided contrast", () => {
    const flat = lintExamples([ex({ variant: "contrast" })]);
    expect(flat.some((m) => m.includes("no side tags"))).toBe(true);
    const oneSided = lintExamples([ex({ variant: "contrast", stages: [
      { label: "shared", body: "s" }, { label: "old", body: "x", side: "a" }] })]);
    expect(oneSided.some((m) => m.includes("both sides"))).toBe(true);
  });
  it("synthetic source", () => {
    const w = lintExamples([ex({ source: "synthetic — no fixture exists yet" })]);
    expect(w.some((m) => m.includes("real fixture"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/lint-examples.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `src/lint-examples.ts`**

```ts
// Judgment lints for example blocks, shared by every surface (spec/recap/doc/atlas call this from
// their existing lint). Warnings only. Operates on NORMALIZED blocks; normalizeExample's problem
// messages are surfaced by the renderer, not re-emitted here, so both can run without duplicates.
import { normalizeExample, type ExampleBlock } from "./blocks.js";

/** A stage body longer than this is a log dump, not a teaching instance. */
export const FAT_STAGE_CHARS = 1200;
const STEP_MIN = 3;   // fewer stages than this: stepping hides what already fits
const WALK_MAX = 4;   // more static walkthrough stages than this: consider stepping

export function lintExamples(rawExamples: ExampleBlock[]): string[] {
  const warns: string[] = [];
  const examples = rawExamples.map((e) => normalizeExample(e).block);

  for (const b of examples) {
    if (b.mode === "step" && b.stages.length < STEP_MIN && b.stages.length > 0) {
      warns.push(`example "${b.id}": only ${b.stages.length} stage(s) — stepping hides content that already fits; use static`);
    }
    if (b.mode === "static" && b.variant === "walkthrough" && b.stages.length > WALK_MAX) {
      warns.push(`example "${b.id}": ${b.stages.length} stages rendered flat — consider mode:"step" so the reader takes it a stage at a time`);
    }
    b.stages.forEach((s, i) => {
      if (s.body.length > FAT_STAGE_CHARS) {
        warns.push(`example "${b.id}": stage ${i + 1} body is ${s.body.length} chars — trim to the minimum that exercises the mechanism; elide with …`);
      }
    });
    if (b.mode === "reveal" && !b.stages.some((s) => s.reveal)) {
      warns.push(`example "${b.id}": mode:"reveal" but no stage has reveal:true — nothing is hidden`);
    }
    if (b.variant === "contrast" && b.stages.length) {
      const hasA = b.stages.some((s) => s.side === "a");
      const hasB = b.stages.some((s) => s.side === "b");
      if (!hasA && !hasB) warns.push(`example "${b.id}": contrast with no side tags — renders as a plain rail; tag stages side:"a"/"b"`);
      else if (!hasA || !hasB) warns.push(`example "${b.id}": contrast has no side-"${hasA ? "b" : "a"}" stages — give both sides at least one stage (the empty column renders a visible marker)`);
    }
    if (/synthetic/i.test(b.source)) {
      warns.push(`example "${b.id}": synthetic source — replace with a real fixture once one exists`);
    }
  }

  const reveals = examples.filter((b) => b.mode === "reveal").length;
  if (reveals > 1) {
    warns.push(`${reveals} reveal examples on one page — predict-then-check works once; make the rest static`);
  }
  return warns;
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run test/lint-examples.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lint-examples.ts test/lint-examples.test.ts
git commit -m "feat: lintExamples judgment rules (mode/volume/contrast/synthetic)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: visual-spec wiring (union, renderer case, lint, CSS)

**Files:**
- Modify: `src/spec-blocks.ts` (import + union + `chapterLabel`)
- Modify: `src/assemble-spec.ts` (renderBlock case + example.css inline)
- Modify: `src/lint-spec.ts` (size count excludes examples; zero-example nudge; call `lintExamples`)
- Test: modify `test/lint-spec.test.ts`, `test/assemble-spec.test.ts`

**Interfaces:**
- Consumes: `ExampleBlock` (Task 1), `renderExample` (Task 2), `lintExamples` (Task 3).
- Produces: `SpecBlock` union includes `ExampleBlock`; example blocks are chapters (sidebar + rail) labeled by `title`.

- [ ] **Step 1: Write the failing tests**

Append to `test/lint-spec.test.ts` (reuse its existing `tldr`/`decisions`/`scope`/`diagram`/`rollout`/`approve`/`filler` helpers):

```ts
const example = (over: Partial<import("../src/blocks.js").ExampleBlock> = {}): SpecBlock => ({
  type: "example", id: "ex", title: "Worked example", source: "test/x.json", lesson: "l",
  stages: [{ label: "in", kind: "input", body: "x" }], ...over,
});

describe("lintSpec — examples", () => {
  it("example blocks do not count toward the large-spec chapter threshold", () => {
    // 4 real chapters + 1 example = still medium: no hero/rollout/approve demands.
    const warns = lintSpec([tldr(true), decisions({ why: true, rejected: true, n: 2 }), scope(),
      filler("r1"), filler("r2"), example()]);
    expect(warns.filter((w) => w.includes("hero") || w.includes("Rollout") || w.includes("approve"))).toEqual([]);
  });
  it("nudges a large spec with zero examples, clears with one", () => {
    const large = [tldr(true), diagram(), decisions({ why: true, rejected: true, n: 2 }), scope(),
      rollout(), approve(), filler("r1")];
    expect(lintSpec(large as SpecBlock[]).some((w) => w.includes("worked example"))).toBe(true);
    expect(lintSpec([...large, example()] as SpecBlock[]).some((w) => w.includes("worked example"))).toBe(false);
  });
  it("pipes lintExamples judgment rules through", () => {
    const warns = lintSpec([tldr(true), decisions({ why: true, rejected: true, n: 2 }), scope(),
      example({ mode: "reveal" })]);
    expect(warns.some((w) => w.includes("nothing is hidden"))).toBe(true);
  });
});
```

Append to `test/assemble-spec.test.ts` (match its existing test style — it calls `assembleSpec(blocks, { title, onWarn })`):

```ts
it("renders an example block as a chapter and guards malformed hand-authored JSON", async () => {
  const warns: string[] = [];
  const blocks = [
    { type: "tldr", id: "tldr", heading: "h", rows: [{ key: "What", value: "x" }] },
    { type: "example", id: "ex-bad", title: "Broken", stages: [null, {}] },  // no source/lesson; hostile stages
  ] as unknown as SpecBlock[];
  const html = await assembleSpec(blocks, { title: "T", onWarn: (m) => warns.push(m) });
  expect(html).toContain("no source given");
  expect(html).toContain("no lesson written");
  expect(html).toContain("vs-example");
  expect(html).toContain('class="outline-num"');                 // it's in the sidebar outline
  expect(warns.some((w) => w.includes("no source"))).toBe(true);
  expect(warns.some((w) => w.includes("dropped"))).toBe(true);   // [null, …] entry
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/lint-spec.test.ts test/assemble-spec.test.ts` → FAIL (type errors / "no renderer" warnings).

- [ ] **Step 3: Wire `src/spec-blocks.ts`**

- Extend the type import: `import type { DiagramBlock, DiagramKind, TabsBlock, ExampleBlock } from "./blocks.js";` and re-export it: `export type { ExampleBlock } from "./blocks.js";`
- Add `| ExampleBlock` to the `SpecBlock` union (after `ReferenceBlock`).
- In `chapterLabel`, add `case "example": return b.title;` (before `default`).
- `isChapter` needs no change — `example` is neither `tldr` nor `reference`, so it is a chapter.

- [ ] **Step 4: Wire `src/assemble-spec.ts`**

- Import: `import { renderExample } from "./renderers/example.js";`
- In `renderBlock`'s switch add (before `default`):

```ts
case "example":
  return sectionHeader(b.title, b.badge) + (await renderExample(b, { ownHeader: false, onWarn: opts.onWarn }));
```

- In `assembleSpec`, load and inline the stylesheet — after the `specCss` line:

```ts
const exampleCss = await readFile(join(ASSETS, "example.css"), "utf8");
```

and change the `<style>` to `<style>${css}\n${specCss}\n${exampleCss}\n${themeCss}</style>`.

- [ ] **Step 5: Wire `src/lint-spec.ts`**

- Imports: add `import { lintExamples } from "./lint-examples.js";` and `ExampleBlock` to the type import from `./spec-blocks.js`.
- Change the chapter count (examples must not flip a spec "large" — that would punish adding one):

```ts
const chapters = blocks.filter((b) => b.type !== "tldr" && b.type !== "reference" && b.type !== "example").length;
```

- After the "Boundaries" section add:

```ts
// Examples — the proof layer (spec §"Making the skills actually reach for it")
const examples = blocks.filter((b): b is ExampleBlock => b.type === "example");
if (large && examples.length === 0) {
  warns.push("no example block — algorithm/contract specs land harder with one worked example (real input → stages → output)");
}
warns.push(...lintExamples(examples));
```

- [ ] **Step 6: Verify**

Run: `npx vitest run test/lint-spec.test.ts test/assemble-spec.test.ts test/spec-cli.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/spec-blocks.ts src/assemble-spec.ts src/lint-spec.ts test/lint-spec.test.ts test/assemble-spec.test.ts
git commit -m "feat(spec): example blocks as chapters + size-count and lint integration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: inline `example?` one-liners (decisions / risks / phases / scope-out)

**Files:**
- Modify: `src/spec-blocks.ts` (four item types)
- Modify: `src/assemble-spec.ts` (four renderers)
- Test: modify `test/assemble-spec.test.ts`

**Interfaces:**
- Produces: `DecisionItem.example?: string`, `RiskItem.example?: string`, `PhaseItem.example?: string`, `ScopeBlock.outList[].example?: string` — all inline markdown, rendered as a `.vs-ex-inline` "e.g." line.

- [ ] **Step 1: Write the failing test**

Append to `test/assemble-spec.test.ts`:

```ts
it("renders inline e.g. lines on decisions, risks, phases, and scope-out items", async () => {
  const blocks = [
    { type: "decisions", id: "d", title: "D", decisions: [
      { q: "q", a: "a", why: "w", example: "burn-unit msgs 4–7 — one verdict merged 3 milestones" }] },
    { type: "risks", id: "r", title: "R", risks: [
      { risk: "x", mitigation: "y", example: "the ambiguous anchor that occurs twice" }] },
    { type: "rollout", id: "ro", title: "Ro", phases: [
      { tag: "A", title: "t", scope: "s", gate: ["g"], example: "window 2 passes the gate" }] },
    { type: "scope", id: "s", inList: ["in"], outList: [
      { text: "not this", example: "the r2 rerun case" }] },
  ] as unknown as SpecBlock[];
  const html = await assembleSpec(blocks, { title: "T" });
  expect((html.match(/vs-ex-inline-tag/g) ?? []).length).toBe(4);
  expect(html).toContain("one verdict merged 3 milestones");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/assemble-spec.test.ts` → FAIL (0 matches).

- [ ] **Step 3: Add the fields in `src/spec-blocks.ts`**

```ts
export interface DecisionItem { q: string; a: string; why?: string; rejected?: string; example?: string; }
export interface RiskItem { risk: string; mitigation: string; example?: string; }
export interface PhaseItem { tag: string; title: string; scope: string; gate: string[]; example?: string; }
// ScopeBlock.outList item:
outList: { text: string; defer?: string; example?: string }[];
```

(Edit each existing declaration in place; keep comments.)

- [ ] **Step 4: Render them in `src/assemble-spec.ts`**

Shared helper near `sectionHeader`:

```ts
const inlineEg = async (example?: string): Promise<string> =>
  example ? `<div class="vs-ex-inline"><span class="vs-ex-inline-tag">e.g.</span>${await mi(example)}</div>` : "";
```

- `renderDecisions`: append `${await inlineEg(d.example)}` after the `decision-alt` line (inside the card's inner `<div>`).
- `renderRisks`: append `${await inlineEg(r.example)}` after the `risk-m` div, inside `.risk-card`.
- `renderRollout`: append `${await inlineEg(p.example)}` after the `gate-list` `</ul>`, inside `.phase-gate`.
- `renderScope`: in `outItems`, append `${await inlineEg(o.example)}` inside the outer `<span>` after the defer span.

- [ ] **Step 5: Verify**

Run: `npx vitest run test/assemble-spec.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/spec-blocks.ts src/assemble-spec.ts test/assemble-spec.test.ts
git commit -m "feat(spec): inline example one-liners on decisions/risks/phases/scope-out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: shared `Block` union → visual-doc + visual-recap

**Files:**
- Modify: `src/blocks.ts` (add `| ExampleBlock` to the `Block` union)
- Modify: `src/assemble.ts` (doc: switch case + example.css)
- Modify: `src/assemble-review.ts` (recap: top-level branch + example.css)
- Modify: `src/review/walkthrough.ts` (render example children inside groups, document order)
- Modify: `src/lint-blocks.ts` (collect examples incl. group children → `lintExamples`)
- Modify: `src/lint-completeness.ts` (recursive zero-example nudge)
- Test: modify `test/review-block-coverage.test.ts`, `test/review-walkthrough.test.ts`, `test/lint-completeness.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `Block` union includes `ExampleBlock`. Doc renders it top-level AND inside groups (the doc group case already renders all children via `renderBlock`). Recap renders it top-level and inside walkthrough groups.

- [ ] **Step 1: Write the failing tests**

`test/review-block-coverage.test.ts` — add to `SAMPLES` (the `Record<Block["type"], Block>` type makes the build fail until this exists, which is the point):

```ts
example: { type: "example", id: "s-example", title: "E", source: "test/x.json", lesson: "l",
  stages: [{ label: "in", kind: "input", body: "x" }] },
```

`test/review-walkthrough.test.ts` — add (match the file's existing call pattern for `renderWalkthrough(blocks, onWarn, diagrams)`):

```ts
it("renders an example nested in a group, in document order beside its diff", async () => {
  const blocks: Block[] = [{
    type: "group", id: "g1", title: "1. Core change", description: "d",
    blocks: [
      { type: "diff", id: "d1", title: "x.ts", path: "src/x.ts", hunks: [{ header: "@@ -1 +1 @@", lines: ["+a"] }] },
      { type: "example", id: "ex1", title: "Same input, old vs new", source: "test/x.test.ts", lesson: "l",
        variant: "contrast",
        stages: [
          { label: "input", kind: "input", body: "payload" },
          { label: "old", kind: "output", body: "merged", side: "a" },
          { label: "new", kind: "output", body: "split", side: "b" },
        ] },
    ],
  }];
  const html = await renderWalkthrough(blocks, undefined, new Map());
  expect(html).toContain("vs-example");
  expect(html).toContain("Same input, old vs new");
  expect(html.indexOf("src/x.ts")).toBeLessThan(html.indexOf("vs-example"));  // document order
});
```

`test/lint-completeness.test.ts` — add (reuse the file's existing diff/group builders if present, else these literals):

```ts
const bigDiff = (id: string): Block => ({ type: "diff", id, title: id, path: `src/${id}.ts`,
  hunks: [{ header: "@@ -1 +3 @@", lines: ["+a", "+b", "+c"] }] });
const groupOf = (id: string, blocks: Block[]): Block => ({ type: "group", id, title: id, description: "d", blocks });
const okOverview: Block = { type: "overview", id: "o", headline: "h", points: [],
  facets: { what: "w", why: "y", size: "s" }, risk: { level: "low" } };

it("nudges 3+ non-trivial-diff recaps with zero examples; a grouped example clears it", () => {
  const noEx = [okOverview, groupOf("g", [bigDiff("a"), bigDiff("b"), bigDiff("c")])];
  expect(lintCompleteness(noEx).some((w) => w.includes("contrast example"))).toBe(true);
  const withEx = [okOverview, groupOf("g", [bigDiff("a"), bigDiff("b"), bigDiff("c"),
    { type: "example", id: "ex", title: "E", source: "t", lesson: "l",
      stages: [{ label: "i", body: "x" }] } as Block])];
  expect(lintCompleteness(withEx).some((w) => w.includes("contrast example"))).toBe(false);
});
```

Note: each `bigDiff` must exceed `TRIVIAL_DIFF_LINES` (2 changed lines) — three `+` lines does.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/review-block-coverage.test.ts test/review-walkthrough.test.ts test/lint-completeness.test.ts`
Expected: compile error in coverage test until the union member exists; then "no renderer" / missing warnings.

- [ ] **Step 3: Add to the `Block` union in `src/blocks.ts`**

Add `| ExampleBlock` to the union (after `| OverviewBlock`). Run `npx tsc --noEmit` — expect ONE error: `src/assemble.ts`'s exhaustive `never` default. That confirms the forcing works; fix it in the next step.

- [ ] **Step 4: Doc — `src/assemble.ts`**

- Import: `import { renderExample } from "./renderers/example.js";`
- Add the case (before `default`):

```ts
case "example":
  html = `<section class="vs-block">${await renderExample(b, { ownHeader: true, onWarn: opts.onWarn })}</section>`;
  break;
```

(The `group` case renders children via `renderBlock`, so nested examples in docs work with no further change.)
- Inline the stylesheet: `const exampleCss = await readFile(join(ASSETS, "example.css"), "utf8");` and `<style>${css}\n${exampleCss}\n${themeCss}</style>`.

- [ ] **Step 5: Recap — `src/assemble-review.ts` + `src/review/walkthrough.ts`**

`assemble-review.ts`:
- Import `renderExample` from `./renderers/example.js`.
- Add a branch before the prose/questions/annotated-code branch:

```ts
if (b.type === "example") {
  return (
    `<section id="${escapeHtml(b.id)}" class="section">` +
    `<div class="section-header"><h2 class="section-title">${escapeHtml(b.title)}</h2></div>` +
    `${await renderExample(b, { ownHeader: false, onWarn: opts.onWarn })}</section>`
  );
}
```

- Inline the stylesheet: load `example.css` alongside `review.css` and add to the `<style>` concatenation.

`review/walkthrough.ts` — in `renderChapter`, replace the diff-only filter with a document-order loop (diff subsection letters still count diffs only, so existing anchors/markers are unchanged):

```ts
let diffIdx = 0;
const parts: string[] = [];
for (const child of g.blocks) {
  if (child.type === "diff") {
    parts.push(await renderSubsection(child, `${n}${String.fromCharCode(97 + diffIdx++)}`, onWarn, diagrams));
  } else if (child.type === "example") {
    parts.push(`<div id="${escapeHtml(child.id)}" class="subsection">${await renderExample(child, { ownHeader: true, onWarn })}</div>`);
  }
  // other child types: unchanged behavior (not rendered here)
}
```

…and use `parts.join("")` where `subsections.join("")` was. Import `renderExample` from `../renderers/example.js`.

- [ ] **Step 6: Lints — `src/lint-blocks.ts` + `src/lint-completeness.ts`**

`lint-blocks.ts` (serves both doc and recap — both assemblers call it):

```ts
import { lintExamples } from "./lint-examples.js";
import type { ExampleBlock } from "./blocks.js";
// at the end of lintBlocks, before `return warnings`:
const examples: ExampleBlock[] = [];
const collectEx = (bs: Block[]): void => {
  for (const b of bs) {
    if (b.type === "example") examples.push(b);
    else if (b.type === "group") collectEx(b.blocks);
  }
};
collectEx(blocks);
warnings.push(...lintExamples(examples));
```

`lint-completeness.ts` — after the grouping section, before `return warnings`:

```ts
// 4. Example — a behavior-changing recap should show one concrete before/after (counted
// recursively into groups: that's where examples are SUPPOSED to live).
const examples: Block[] = [];
const collectEx = (bs: Block[]): void => {
  for (const b of bs) {
    if (b.type === "example") examples.push(b);
    else if (b.type === "group") collectEx(b.blocks);
  }
};
collectEx(blocks);
const nonTrivial = diffs.filter((d) => changedLines(d) > TRIVIAL_DIFF_LINES);
if (nonTrivial.length >= 3 && examples.length === 0) {
  warnings.push(
    "no example block — behavior-changing recaps land harder with one contrast example (same input, old vs new output); mine the PR's tests for a ready-made pair",
  );
}
```

- [ ] **Step 7: Verify**

Run: `npx vitest run test/review-block-coverage.test.ts test/review-walkthrough.test.ts test/lint-completeness.test.ts test/lint-blocks.test.ts test/assemble.test.ts test/assemble-review.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/blocks.ts src/assemble.ts src/assemble-review.ts src/review/walkthrough.ts src/lint-blocks.ts src/lint-completeness.ts test/review-block-coverage.test.ts test/review-walkthrough.test.ts test/lint-completeness.test.ts
git commit -m "feat(recap,doc): example blocks in Block union, walkthrough groups, completeness nudge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: visual-atlas wiring

**Files:**
- Modify: `src/atlas-blocks.ts` (import + union + `atlasChapterLabel`)
- Modify: `src/assemble-atlas.ts` (`renderAtlasBlock` case + example.css + `lintExamples` call)
- Test: modify `test/assemble-atlas.test.ts`

**Interfaces:**
- Consumes: `ExampleBlock`, `renderExample`, `lintExamples`.
- Produces: `AtlasBlock` union includes `ExampleBlock`; renders as a chapter section on atlas/domain pages.

- [ ] **Step 1: Write the failing test**

Append to `test/assemble-atlas.test.ts` (match its existing `assembleDomain`/`assembleAtlas` call style — check the file; use the domain-page entry point with its minimal required opts):

```ts
it("renders an example block on a domain page", async () => {
  const warns: string[] = [];
  const blocks = [
    { type: "domain-tldr", id: "tldr", heading: "h", rows: [{ key: "Owns", value: "x" }] },
    { type: "example", id: "ex-trace", title: "One request through this stack",
      source: "src/game/engine.ts (traced by hand)", lesson: "the engine never touches the store directly",
      stages: [
        { label: "request", kind: "input", body: "POST /score" },
        { label: "resolution", body: "engine applies handicap" },
        { label: "persisted row", kind: "output", body: "scores table" },
      ] },
  ] as unknown as AtlasBlock[];
  const html = await assembleDomain(blocks, { title: "game", layer: "engine", layerLabel: "Engine", onWarn: (m) => warns.push(m) });
  expect(html).toContain("vs-example");
  expect(html).toContain("One request through this stack");
  expect(warns.filter((w) => w.includes("no renderer"))).toEqual([]);
});
```

(If the domain assembler export is named differently, mirror whatever the existing tests in that file import — the assertion set stays the same.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/assemble-atlas.test.ts` → FAIL (type error / "no renderer" warning).

- [ ] **Step 3: Wire `src/atlas-blocks.ts`**

- Import: `import type { DiagramBlock, DiagramKind, ExampleBlock } from "./blocks.js";` and re-export: `export type { ExampleBlock } from "./blocks.js";`
- Add `| ExampleBlock` to the `AtlasBlock` union.
- `atlasChapterLabel`: add `case "example": return b.title;` before the exhaustive default (the `never` check forces this — the compile error is the reminder).
- `isAtlasChapter` needs no change (`example` ≠ tldr types → it is a chapter).

- [ ] **Step 4: Wire `src/assemble-atlas.ts`**

- Imports: `renderExample` from `./renderers/example.js`, `lintExamples` from `./lint-examples.js`.
- `renderAtlasBlock` switch, before `default`:

```ts
case "example": return sectionHeader(b.title, b.badge) + (await renderExample(b, { ownHeader: false, onWarn }));
```

- Stylesheet: load `example.css` alongside the others and add to the `<style>` concatenation.
- Lint: next to the existing `lintAtlas` / `lintDomain` call sites (both entry points), add:

```ts
if (opts.onWarn) for (const w of lintExamples(blocks.filter((b): b is ExampleBlock => b.type === "example"))) opts.onWarn(w);
```

- [ ] **Step 5: Verify**

Run: `npx vitest run test/assemble-atlas.test.ts test/atlas-blocks.test.ts test/lint-atlas.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/atlas-blocks.ts src/assemble-atlas.ts test/assemble-atlas.test.ts
git commit -m "feat(atlas): example blocks on atlas/domain pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: catalogs + SKILL.md updates + doc-sync test

**Files:**
- Modify: `skills/shared/spec-components.md` (catalog entry)
- Modify: `skills/shared/atlas-components.md` (catalog entry)
- Modify: `skills/visual-spec/SKILL.md`, `skills/visual-recap/SKILL.md`, `skills/visual-doc/SKILL.md`, `skills/visual-atlas/SKILL.md`
- Test: modify `test/skill-docs.test.ts`

**Interfaces:** none (docs); the test locks all four skills to documenting `` `example` ``.

- [ ] **Step 1: Write the failing test**

Append to `test/skill-docs.test.ts`:

```ts
it("documents the example block in all four surface skills", () => {
  // blocks.ts's discriminant only auto-forces visual-doc; spec/atlas import the type
  // rather than redeclaring the literal, so lock all four explicitly.
  for (const [name, text] of [
    ["visual-doc", docSkill], ["visual-recap", recapSkill],
    ["visual-spec", specSkill], ["visual-atlas", atlasSkill],
  ] as const) {
    expect(text, `${name} SKILL.md must document \`example\``).toContain("`example`");
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/skill-docs.test.ts` → FAIL for recap/spec/atlas (doc may also fail until edited — the auto-check now includes `example` in `blockTypes`).

- [ ] **Step 3: `skills/shared/spec-components.md` — catalog entry**

Insert a new `###` section between "Where-it-fits" and "Decision cards", following the house entry format (Use when / Avoid when / rendered-HTML snippet):

~~~markdown
### Worked example (input → stages → lesson)
- **Use when:** the spec defines an algorithm, contract, validation rule, or merge semantics — one
  real instance walked to its output teaches faster than any prose. Three shapes: **walkthrough**
  (input → steps → output), **contrast** (`variant:"contrast"` — same input, old vs new, side by
  side; the natural form when behavior changes), **counterexample** (terminal stage
  `kind:"counter"` — the instance that made a rejected alternative necessary). Ground it: `source`
  names the fixture/test/artifact it came from (required — a missing one renders a visible ⚠);
  synthetic data must say so. End with the `lesson` (required): one sentence the reader leaves with.
- **Interaction is a response to volume, not decoration.** Default `mode:"static"`. `"reveal"`
  collapses one flagged stage behind "Show: …" (predict-then-check — at most one per page).
  `"step"` walks stages one at a time via a pure-CSS stepper (3–8 stages; more stages → split).
  Fat stages get trimmed, never hidden.
- **Avoid when:** the mechanism is trivial, or no design element needs the instance ("gotcha"
  examples are noise). One example on the trickiest path beats three happy-path ones. Keep it to
  one screenful; elide with `…` and say so.

```html
<div class="vs-example">
  <p class="vs-ex-src"><span class="vs-ex-src-tag">source</span>test/fixtures/….json, msgs 4–7</p>
  <div class="vs-ex-rail">
    <div class="vs-ex-stage" data-kind="input"><div class="vs-ex-stage-h"><span class="vs-ex-kind">Input</span>…</div><div class="vs-ex-stage-body">…</div></div>
    <div class="vs-ex-arrow" aria-hidden="true">↓</div>
    <div class="vs-ex-stage" data-kind="output"><div class="vs-ex-stage-h"><span class="vs-ex-kind">Output</span>…</div><div class="vs-ex-stage-body">…</div></div>
  </div>
  <div class="vs-ex-lesson"><span class="vs-ex-lesson-tag">Lesson</span>…one sentence…</div>
</div>
```
~~~

Also extend the **Decision cards** entry: note the optional `example` field rendering a quiet
`e.g.` line (`.vs-ex-inline`) under the why/rejected lines — for one-liners; anything needing
stages graduates to an `example` block. Same note applies to risks, rollout phases, and
out-of-scope items.

- [ ] **Step 4: `skills/shared/atlas-components.md` — entry**

Add a short `###` section in the domain-page half: "Worked trace (`example` block)" — one real
request/record walked through the domain's stack; `source` + `lesson` required; use on domains
with a meaningful runtime/data path; skip for pure-utility domains.

- [ ] **Step 5: SKILL.md updates (exact insertion points)**

`skills/visual-spec/SKILL.md`:
- **Definition of done** list: add bullet after the decisions bullet: `- **A worked \`example\`** of the core mechanism for any algorithm/contract spec — real input → stages → output, with a \`source\` and a \`lesson\`. Contrast form when the spec changes existing behavior.`
- **Red flags** list: add `- An algorithm/contract spec has no \`example\` block — the mechanism is asserted, never shown.`
- **Scaling by size** table: add row `| \`example\` (worked instance) | optional | usually | **yes** |` after the hero-diagram row.
- **Section ladder**: renumber to insert `example` between 4 (`fits`) and 5 (`decisions`): `5. \`example\` — one real instance through the core mechanism (walkthrough or contrast).`
- Note (one line, in the ladder section): "Examples are chapters in the outline but do not count toward the 5-chapter 'large' threshold."

`skills/visual-recap/SKILL.md`:
- Definition of done: `- For a **behavior-changing PR**, one contrast \`example\`: the same input under old vs new code, mined from the PR's tests (ready-made input/output pairs), placed inside the group beside the diff it explains.`
- Red flags: `- The PR changes behavior and no \`example\` shows a concrete before/after.`

`skills/visual-doc/SKILL.md`:
- In the block-type inventory add `example` with one line, plus a short "When to add an example" note: any transformation or algorithm the doc explains gets one worked instance (`source` + `lesson` required; static by default).

`skills/visual-atlas/SKILL.md`:
- Definition of done: `- A domain page with a meaningful runtime or data path anchors on one worked trace (\`example\` block) — a single real request/event/record walked through the domain's stack. Pure-utility/config domains are exempt.`
- Red flags: `- A domain page describes a pipeline or flow in prose but shows nothing moving through it.`

- [ ] **Step 6: Verify**

Run: `npx vitest run test/skill-docs.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add skills/ test/skill-docs.test.ts
git commit -m "docs(skills): example-block catalog entries + per-surface definition-of-done

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: canonical example builds, re-rendered warning-free

**Files:**
- Modify: `example/spec-season-planner/spec.json` (+ re-rendered `spec.html`)
- Modify: `example/pr-194-estimated-purse/blocks.json` (+ re-rendered `recap.html`)
- Modify: `example/atlas-ppgl/domain-game/domain-game.json` (+ re-rendered `domain-game.html`)

**Interfaces:** none — authored JSON consuming Tasks 1–8. **Grounding rule applies to us too:** every example authored here must be pulled from content already in that build's own JSON (its diffs, reference drawers, decision cards) — never invented. Read the build's existing blocks first; if a contrast pair can't be grounded in the PR build's actual hunks, use the other PR build.

- [ ] **Step 1: season-planner — add a worked example + one inline e.g.**

Read `example/spec-season-planner/spec.json`. Insert an `example` block after the `fits` block: a static walkthrough of the spec's core mechanism (derive it from the spec's own decision/reference content — real field names from the existing blocks). Shape:

```json
{ "type": "example", "id": "ex-core", "title": "…one instance through <the mechanism>…",
  "badge": "worked example", "source": "<the spec.json section/drawer the data came from>",
  "stages": [
    { "label": "Input — …", "kind": "input", "body": "…" },
    { "label": "…step…", "body": "…" },
    { "label": "Output — …", "kind": "output", "body": "…" }
  ],
  "lesson": "…" }
```

Add an `example` one-liner to the most contested decision (the one that already carries `rejected`).

Render: `npx tsx bin/spec.ts --blocks example/spec-season-planner/spec.json --out example/spec-season-planner`
Expected: exit 0, **zero warnings**. Open `spec.html`, check the example renders between fits and decisions, light + dark (theme toggle).

- [ ] **Step 2: pr-194 recap — contrast example inside a group**

Read `example/pr-194-estimated-purse/blocks.json`. Inside the group holding the core diff, add after that diff:

```json
{ "type": "example", "id": "ex-contrast", "title": "Same input, before vs after",
  "variant": "contrast", "columns": ["Before", "After"],
  "source": "<the test file the PR's diff touches>",
  "stages": [
    { "label": "input", "kind": "input", "body": "…the payload from the diff's test…" },
    { "label": "old output", "kind": "output", "body": "…", "side": "a" },
    { "label": "new output", "kind": "output", "body": "…", "side": "b" }
  ],
  "lesson": "…" }
```

Render: `npx tsx bin/recap.ts` with the same flags the build was produced with (check the recap.html `<meta name="generator">` / repo README for the exact invocation; the blocks file is `--blocks example/pr-194-estimated-purse/blocks.json --out example/pr-194-estimated-purse`).
Expected: zero warnings (the ≥3-non-trivial-diffs nudge now clears via the grouped example).

- [ ] **Step 3: atlas-ppgl — one domain trace**

Read `example/atlas-ppgl/domain-game/domain-game.json` (the domain with the clearest runtime path; if its content suggests otherwise, pick the better domain dir and adjust paths). Add an `example` block after the `components` block: a 3–4 stage trace of one request/record through the domain, grounded in the page's own depth/seams content. Re-render with `npx tsx bin/atlas.ts` using the flags in the build's generator meta.
Expected: zero warnings. This is deliberately ONE demonstration trace — retrofitting other domains is follow-up authoring, per the spec.

- [ ] **Step 4: Full verification**

Run: `npx vitest run` (full suite — this is the final task) and `npx tsc --noEmit`.
Expected: all green. Open all three rendered HTML files; confirm the examples render with tints, provenance line, lesson band in both themes.

- [ ] **Step 5: Commit**

```bash
git add example/
git commit -m "docs(examples): worked example, contrast, and domain trace in canonical builds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After all tasks

Push the branch and open ONE PR titled `feat: worked examples as a first-class block across all four surfaces`, body summarizing the spec (link `docs/superpowers/specs/2026-08-04-worked-examples-design.md`), noting the deliberate single-PR exception. Do not merge without the user's say-so.
