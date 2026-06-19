import type { Block, DiagramBlock, SchemaBlock } from "./blocks.js";
import { rolesInSource } from "./diagram-colors.js";

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
  const visit = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.type === "group") {
        if (!b.description || !b.description.trim()) {
          warnings.push(`group "${b.id}" has no description — add a 1–2 line summary of what it covers`);
        }
        visit(b.blocks);
      } else if (b.type === "diff" && b.description && isWallOfText(b.description)) {
        warnings.push(
          `diff "${b.id}" (${b.path}) description is a ${b.description.trim().length}-char single paragraph — break it into bullet points`,
        );
      }
    }
  };
  visit(blocks);

  // ── Diagram authoring guards ────────────────────────────────────────────────
  // Gather every diagram/schema block reachable: top-level, in group.blocks,
  // tabs.tabs[].block, diff.diagram, and overview.diagram.
  const diagrams: (DiagramBlock | SchemaBlock)[] = [];
  const collect = (bs: Block[]): void => {
    for (const b of bs) {
      if (b.type === "diagram" || b.type === "schema") diagrams.push(b);
      if (b.type === "group") collect(b.blocks);
      else if (b.type === "tabs") collect(b.tabs.map((t) => t.block));
      else if (b.type === "diff" && b.diagram) collect([b.diagram]);
      else if (b.type === "overview" && b.diagram) collect([b.diagram]);
    }
  };
  collect(blocks);

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

  return warnings;
}
