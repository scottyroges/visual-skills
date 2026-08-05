export type DiagramKind = "flowchart" | "architecture" | "sequence" | "erd" | "class";

export interface DiagramBlock {
  type: "diagram";
  id: string;
  title: string;
  kind: DiagramKind;
  d2: string;            // REQUIRED — the floor + fallback
  mermaid?: string;      // OPTIONAL — only for editable-eligible kinds (flowchart/architecture/sequence/class)
}

export interface SchemaBlock {
  type: "schema";
  id: string;
  title: string;
  kind: "erd";
  d2: string;            // ERD rendered via D2
}

export interface ApiProcedure {
  name: string;          // e.g. "league.captureOrder"
  auth: string;          // procedure-builder label: "public" | "protected" | "admin" | ... | "unknown"
  kind: "query" | "mutation" | "subscription" | "unknown";
  input: string;         // source text of the .input(...) argument, or "" if none
  change?: "added" | "removed" | "changed";
}

export interface ApiBlock {
  type: "api";
  id: string;
  title: string;
  procedures: ApiProcedure[];
}

export interface FileChange {
  path: string;
  status: "A" | "M" | "D" | "R";
  added: number;
  deleted: number;
}

export interface FileTreeBlock {
  type: "file-tree";
  id: string;
  title: string;
  files: FileChange[];
}

export interface DiffHunk {
  header: string;        // the @@ line
  lines: string[];       // raw diff lines incl. leading +/-/space
  annotation?: string;   // optional agent prose (empty in this slice)
}

export interface DiffBlock {
  type: "diff";
  id: string;
  title: string;
  path: string;
  description?: string;  // optional markdown "what & why", rendered above the hunks
  diagram?: DiagramBlock | TabsBlock; // optional illustration (one diagram, or a tabbed set), rendered after the description, above the hunks
  hunks: DiffHunk[];
}

export interface ProseBlock {
  type: "prose";
  id: string;
  markdown: string;
  title?: string;
}

export interface AnnotatedCodeBlock {
  type: "annotated-code";
  id: string;
  title: string;
  lang: string;
  code: string;
  annotations: { line: number; note: string }[];
}

export interface QuestionsBlock {
  type: "questions";
  id: string;
  title: string;
  questions: { question: string; recommendedDefault: string }[];
}

export interface GroupBlock {
  type: "group";
  id: string;
  title: string;
  description?: string;  // optional markdown shown under the group title
  blocks: Block[];   // one level of nesting — children are non-group blocks
}

export interface TabsBlock {
  type: "tabs";
  id: string;
  title?: string;
  // One level deep — each tab holds a single non-container block (typically a diagram).
  // Max 6 tabs are render-visible (the CSS switcher defines :nth selectors for n=1..6).
  tabs: { label: string; block: Block }[];
}

export interface OverviewBlock {
  type: "overview";
  id: string;
  headline: string;                            // the main change, one scannable line (inline markdown)
  points: { text: string; href?: string }[];   // short key points; href = "#section-id" to its detail
  diagram?: DiagramBlock | TabsBlock;           // lead illustration, rendered before the points
  // Review-shell TL;DR (all optional — older blocks.json still render):
  facets?: { what?: string; why?: string; size?: string };
  risk?: { level: "low" | "med" | "high"; note?: string };
}

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
  const r = ((raw ?? {}) as unknown) as Record<string, unknown>;
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

// ---- block-tree traversal (THE list of container paths) ----

/**
 * **Every place in the Block model where one block holds another** — group children, tab payloads,
 * and the optional illustration hanging off a diff/overview. This function and its rebuilding twin
 * below are the ONE list; `walkBlocks`/`mapBlocks` and everything built on them inherit it.
 *
 * Adding a container variant to `Block`? Extend these two functions and nothing else needs to know.
 * Hand-rolling a `if (b.type === "group") recurse(...)` chain is how tab- and diagram-slot-nested
 * blocks got silently skipped twice.
 *
 * Tolerant of hostile input (a null entry in hand-authored JSON) — traversal must never throw.
 */
function childBlocks(b: Block): Block[] {
  switch ((b as { type?: unknown } | null)?.type) {
    case "group": return (b as GroupBlock).blocks ?? [];
    case "tabs": return ((b as TabsBlock).tabs ?? []).map((t) => t?.block);
    case "diff":
    case "overview": {
      const d = (b as DiffBlock | OverviewBlock).diagram;
      return d ? [d] : [];
    }
    default: return [];
  }
}

/** `childBlocks`' inverse: the same container with `children` (same order) put back. */
function withChildBlocks(b: Block, children: Block[]): Block {
  switch ((b as { type?: unknown } | null)?.type) {
    case "group": return { ...(b as GroupBlock), blocks: children };
    case "tabs": {
      const t = b as TabsBlock;
      return { ...t, tabs: t.tabs.map((x, i) => ({ ...x, block: children[i] })) };
    }
    case "diff":
    case "overview":
      return { ...(b as DiffBlock | OverviewBlock), diagram: children[0] as DiagramBlock | TabsBlock };
    default: return b;
  }
}

/** Depth-first pre-order visit of every block in the tree, nested ones included. */
export function walkBlocks(blocks: Block[], visit: (b: Block) => void): void {
  for (const b of blocks) {
    if (!b) continue;
    visit(b);
    walkBlocks(childBlocks(b), visit);
  }
}

/**
 * `walkBlocks`' rebuilding twin — bottom-up: children are mapped first, then `fn` sees the rebuilt
 * parent. Containers keep their identity when nothing underneath them changed.
 */
export function mapBlocks(blocks: Block[], fn: (b: Block) => Block): Block[] {
  return blocks.map((b) => {
    if (!b) return b;
    const kids = childBlocks(b);
    const mapped = kids.length ? mapBlocks(kids, fn) : kids;
    const changed = mapped.some((k, i) => k !== kids[i]);
    return fn(changed ? withChildBlocks(b, mapped) : b);
  });
}

/**
 * Assembler-boundary guard: replace every example block — wherever it sits in the tree — with its
 * normalized form BEFORE anything reads b.id / b.title. Assemblers touch those raw (unique-id
 * assertions, sidebar/nav labels, section headers, `assemble`'s anchor step), and a hand-authored
 * example missing `title` would otherwise reach escapeHtml as undefined and throw.
 *
 * The problems come back with the blocks because they can only be derived ONCE, here, against the
 * author's raw JSON: re-normalizing the normalized block (what renderExample would do) no longer
 * sees the dropped stages, the coerced mode, or the original stage numbering. So the assembler
 * emits these, and passes preNormalized:true to renderExample so nothing is warned twice.
 *
 * Generic over the per-surface block unions (Block / SpecBlock / AtlasBlock), which all carry
 * ExampleBlock; the container branches in `childBlocks` are no-ops for the surfaces without them.
 */
export function normalizeExampleBlocks<T>(blocks: T[]): { blocks: T[]; problems: string[] } {
  const problems: string[] = [];
  const out = mapBlocks(blocks as unknown as Block[], (b) => {
    if (b.type !== "example") return b;
    const n = normalizeExample(b);
    problems.push(...n.problems);
    return n.block;
  });
  return { blocks: out as unknown as T[], problems };
}

/** Every example block in the tree, in document order — for the judgment lints. */
export function collectExamples(blocks: Block[]): ExampleBlock[] {
  const out: ExampleBlock[] = [];
  walkBlocks(blocks, (b) => { if (b.type === "example") out.push(b); });
  return out;
}

/**
 * The contract between a product generator and the engine.
 *
 * **Adding a container type** (a variant that holds other blocks)? Extend `childBlocks` /
 * `withChildBlocks` above — that pair is the single definition of the tree, and every traversal
 * (normalization, lints, id assertions, diagram collection) is built on `walkBlocks`/`mapBlocks`.
 */
export type Block =
  | DiagramBlock
  | SchemaBlock
  | ApiBlock
  | FileTreeBlock
  | DiffBlock
  | ProseBlock
  | AnnotatedCodeBlock
  | QuestionsBlock
  | GroupBlock
  | TabsBlock
  | OverviewBlock
  | ExampleBlock;

/** Blocks rendered through the D2 diagram renderer. */
export function isDiagramBlock(b: Block): b is DiagramBlock | SchemaBlock {
  return b.type === "diagram" || b.type === "schema";
}
