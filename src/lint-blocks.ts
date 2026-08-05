import type { Block, DiagramBlock, SchemaBlock } from "./blocks.js";
import { walkBlocks, collectExamples, isDiagramBlock } from "./blocks.js";
import { rolesInSource } from "./diagram-colors.js";
import { lintExamples } from "./lint-examples.js";

// A diff description longer than this with no scannable structure (no bullets, no paragraph
// breaks) reads as a wall of text — the authoring lint flags it.
const WALL_OF_TEXT_CHARS = 300;

// Diagram kinds that carry mermaid → render as editable Excalidraw. erd/schema rasterizes by
// design and is excluded from the editability + color guards.
const EDITABLE_KINDS = new Set(["flowchart", "architecture", "sequence", "class"]);
const MAX_DIAGRAMS = 6; // overload: total diagram/schema blocks above this
const OVERSIZE_EDGES = 35; // a single diagram with more connection arrows than this is "very large"

function isWallOfText(desc: string): boolean {
  const text = desc.trim();
  if (text.length <= WALL_OF_TEXT_CHARS) return false;
  const hasList = /(^|\n)\s*([-*]\s|\d+\.\s)/.test(text); // markdown bullets / numbered list
  const hasParagraphs = /\n\s*\n/.test(text); // multiple paragraphs
  return !hasList && !hasParagraphs;
}

/**
 * Authoring lints surfaced as warnings (never throws, never blocks rendering): every group should
 * carry a `description`, and a diff `description` should be scannable rather than a long single
 * paragraph. Recurses into groups. Returns the warning messages in document order.
 */
export function lintBlocks(blocks: Block[]): string[] {
  const warnings: string[] = [];
  walkBlocks(blocks, (b) => {
    if (b.type === "group" && !b.description?.trim()) {
      warnings.push(`group "${b.id}" has no description — add a 1–2 line summary of what it covers`);
    } else if (b.type === "diff" && b.description && isWallOfText(b.description)) {
      warnings.push(
        `diff "${b.id}" (${b.path}) description is a ${b.description.trim().length}-char single paragraph — break it into bullet points`,
      );
    }
  });

  // ── Diagram authoring guards ────────────────────────────────────────────────
  // Every diagram/schema block reachable anywhere in the tree — walkBlocks knows the container
  // paths (group children, tab payloads, diff.diagram, overview.diagram).
  const diagrams: (DiagramBlock | SchemaBlock)[] = [];
  walkBlocks(blocks, (b) => { if (isDiagramBlock(b)) diagrams.push(b); });

  for (const b of diagrams) {
    // 1. Unmarked subject (color) — diagrams only (schema excluded).
    if (b.type === "diagram" && rolesInSource(b.d2, b.mermaid).length === 0) {
      warnings.push(
        `diagram "${b.id}" applies no semantic color — mark the changed subject (and tag actors/stores/externals) so it reads at a glance`,
      );
    }
    // 2. Lost editability — editable-eligible kind with no mermaid.
    if (b.type === "diagram" && EDITABLE_KINDS.has(b.kind) && !(b.mermaid && b.mermaid.trim())) {
      warnings.push(
        `diagram "${b.id}" (${b.kind}) has no mermaid source — it renders as a static image, losing the editable Excalidraw upgrade`,
      );
    }
    // 4. Oversize — too many connection arrows in the d2 source.
    const edges = (b.d2.match(/-+>|<-+/g) || []).length;
    if (edges > OVERSIZE_EDGES) {
      warnings.push(`diagram "${b.id}" is very large (~${edges} connections) — consider splitting it or simplifying`);
    }
  }

  // 3. Overload — too many diagrams overall (warn once).
  if (diagrams.length > MAX_DIAGRAMS) {
    warnings.push(
      `${diagrams.length} diagrams — prefer the fewest that explain the change (one strong diagram beats several weak ones)`,
    );
  }

  // ── Example authoring guards (judgment lints) ──────────────────────────────
  // Same full traversal as the diagram collector above: an example renders wherever a block can
  // sit (a tab payload included), so it must be linted wherever it can sit.
  warnings.push(...lintExamples(collectExamples(blocks)));

  return warnings;
}
