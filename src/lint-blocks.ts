import type { Block } from "./blocks.js";

// A diff description longer than this with no scannable structure (no bullets, no paragraph
// breaks) reads as a wall of text — the authoring lint flags it.
const WALL_OF_TEXT_CHARS = 300;

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
  return warnings;
}
