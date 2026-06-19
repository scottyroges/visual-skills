// Block model for the visual-spec renderer. A spec page is an ordered array of these blocks;
// `assemble-spec.ts` renders each to a <section> and derives the sidebar outline + progress rail
// from them. Short text fields are INLINE MARKDOWN (`code`, **bold**, *em*, [link](#id)); longer
// bodies are block markdown. See skills/shared/spec-components.md for the authoring catalog.
import type { DiagramBlock, DiagramKind, TabsBlock } from "./blocks.js";

export interface TldrBlock {
  type: "tldr";
  id: string;                                  // typically "tldr"
  heading: string;                             // one-line framing of the whole spec
  rows: { key: string; value: string }[];      // What / Why / Closes / Size — value is inline markdown
  bigIdea?: { label?: string; line: string; sub?: string };
}

/** A standalone diagram section (the info-flow hero, where-it-fits, etc.). Reuses the d2/mermaid
 *  diagram pipeline; `sectionTitle`/`intro` frame it, `title` labels the diagram itself. */
export interface SpecDiagramBlock {
  type: "diagram";
  id: string;                                  // section id AND diagram id (one and the same)
  sectionTitle?: string;
  badge?: string;
  intro?: string;
  title: string;
  kind: DiagramKind;
  d2: string;
  mermaid?: string;
}

export interface ComponentCard {
  name: string;
  purpose: string;
  skills?: { name: string; deputy?: boolean }[];
  split?: { fact: string; perc: string };
  fields?: { fact?: string[]; perc?: string[] };
}
export interface ComponentsBlock {
  type: "components";
  id: string;
  title: string;
  badge?: string;
  intro?: string;
  anatomy?: {                                  // optional "two-layer duality" explainer above the grid
    left: { title: string; desc: string; eg?: string };
    mid: { fn: string };
    right: { title: string; desc: string; eg?: string };
    caption?: string;
  };
  cards: ComponentCard[];
  note?: string;
}

export interface FitsBlock {
  type: "fits";
  id: string;
  title?: string;
  intro?: string;
  chain: { role: string; title: string; desc: string; isThis?: boolean }[];
  stack?: { tag: string; label: string; note: string; kind: "new" | "reused" }[];
}

export interface DecisionItem { q: string; a: string; why?: string; rejected?: string; }
export interface DecisionsBlock {
  type: "decisions";
  id: string;
  title: string;
  badge?: string;
  intro?: string;
  decisions: DecisionItem[];
}

export interface ScopeBlock {
  type: "scope";
  id: string;
  title?: string;
  inTitle?: string;
  outTitle?: string;
  inList: string[];
  outList: { text: string; defer?: string }[];
}

export interface PhaseItem { tag: string; title: string; scope: string; gate: string[]; }
export interface RolloutBlock {
  type: "rollout";
  id: string;
  title: string;
  badge?: string;
  intro?: string;
  phases: PhaseItem[];
}

export interface Mover { name: string; now: string; target: string; label?: string; }
export interface DoneTable { headers: string[]; rows: { cells: string[]; goodCols?: number[] }[]; }
export interface DoneBlock {
  type: "done";
  id: string;
  title: string;
  badge?: string;
  intro?: string;
  movers?: Mover[];
  table?: DoneTable;
  note?: string;
}

export interface RiskItem { risk: string; mitigation: string; }
export interface RisksBlock {
  type: "risks";
  id: string;
  title: string;
  intro?: string;
  risks: RiskItem[];
}

export interface ApproveBlock {
  type: "approve";
  id: string;
  title: string;
  badge?: string;
  intro?: string;
  commit: { title?: string; body: string };
  scrutinize: { title?: string; body: string };   // body may carry an inline [link](#ref-id)
  open: { title?: string; note?: string; questions: string[] };
}

/** One collapsed drawer. `html` (raw, trusted) wins when present — for syntax-highlighted code
 *  using review.css token spans; otherwise `markdown` is rendered (supports fences + tables). */
export interface ReferenceItem { id: string; summary: string; tally?: string; html?: string; markdown?: string; }
export interface ReferenceBlock {
  type: "reference";
  id: string;                                  // typically "reference"
  title?: string;
  intro?: string;
  items: ReferenceItem[];
}

/** Escape hatch for anything unmodeled — rendered as block markdown under an optional heading. */
export interface SpecProseBlock { type: "spec-prose"; id: string; title?: string; markdown: string; }

export type SpecBlock =
  | TldrBlock
  | SpecDiagramBlock
  | ComponentsBlock
  | FitsBlock
  | DecisionsBlock
  | ScopeBlock
  | RolloutBlock
  | DoneBlock
  | RisksBlock
  | ApproveBlock
  | ReferenceBlock
  | SpecProseBlock;

/** Blocks that are NOT "chapters": excluded from the numbered outline + progress rail. */
export function isChapter(b: SpecBlock): boolean {
  return b.type !== "tldr" && b.type !== "reference";
}

export function assertUniqueSpecIds(blocks: SpecBlock[]): void {
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) throw new Error(`duplicate block id "${id}" — ids must be unique`);
    seen.add(id);
  };
  for (const b of blocks) {
    add(b.id);
    if (b.type === "reference") for (const it of b.items) add(it.id);
  }
}

/** The DiagramBlock view of a spec diagram section (same id), for the shared diagram pipeline. */
export function toDiagramBlock(b: SpecDiagramBlock): DiagramBlock {
  return { type: "diagram", id: b.id, title: b.title, kind: b.kind, d2: b.d2, mermaid: b.mermaid };
}

export function collectSpecDiagrams(blocks: SpecBlock[]): DiagramBlock[] {
  return blocks.filter((b): b is SpecDiagramBlock => b.type === "diagram").map(toDiagramBlock);
}

/** Default outline label per block type (overridable per block via its title). */
export function chapterLabel(b: SpecBlock): string {
  switch (b.type) {
    case "diagram": return b.sectionTitle ?? b.title;
    case "components": return b.title;
    case "fits": return b.title ?? "Where it fits";
    case "decisions": return b.title;
    case "scope": return b.title ?? "Scope";
    case "rollout": return b.title;
    case "done": return b.title;
    case "risks": return b.title;
    case "approve": return b.title;
    case "spec-prose": return b.title ?? "Details";
    default: return b.id;
  }
}
