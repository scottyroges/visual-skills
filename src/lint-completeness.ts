import type { Block, DiffBlock, OverviewBlock } from "./blocks.js";

// A diff whose changed-line count is at or below this is "trivial" — a missing description is fine.
const TRIVIAL_DIFF_LINES = 2;
// This many ungrouped diffs at the top level reads as a flat pile rather than a narrative.
const GROUP_THRESHOLD = 3;
// How many sample paths to name in the unannotated-diffs warning before eliding.
const SAMPLE_PATHS = 5;

/** Changed (+/-) lines across a diff's hunks, ignoring context lines. */
function changedLines(d: DiffBlock): number {
  let n = 0;
  for (const h of d.hunks) for (const l of h.lines) if (l.startsWith("+") || l.startsWith("-")) n++;
  return n;
}

/** All diff blocks, recursing one level into groups. */
function collectDiffs(blocks: Block[]): DiffBlock[] {
  const out: DiffBlock[] = [];
  for (const b of blocks) {
    if (b.type === "diff") out.push(b);
    else if (b.type === "group") for (const c of b.blocks) if (c.type === "diff") out.push(c);
  }
  return out;
}

/**
 * Document-level "demo standard" lints (warnings only — never throws, never blocks rendering).
 * Where lintBlocks checks an individual block's authoring, this checks whether the recap as a whole
 * was enriched past the raw gather output: a lead overview with a complete TL;DR, annotated diffs,
 * and a grouped narrative once there are enough diffs. A recap with no diffs is not a code recap,
 * so nothing is enforced. Returns messages in document order.
 */
export function lintCompleteness(blocks: Block[]): string[] {
  const warnings: string[] = [];
  const diffs = collectDiffs(blocks);
  if (diffs.length === 0) return warnings; // not a code recap — nothing to enforce

  // 1. Lead overview + TL;DR card + risk chip.
  const overview = blocks.find((b): b is OverviewBlock => b.type === "overview");
  if (!overview) {
    warnings.push(
      "no overview block — author a lead placed FIRST: headline + TL;DR facets (what/why/size) + risk. The bare gather output is raw material, not a finished review.",
    );
  } else {
    const f = overview.facets ?? {};
    const missingFacets = (["what", "why", "size"] as const).filter((k) => !f[k]?.trim());
    if (missingFacets.length) {
      warnings.push(
        `overview TL;DR incomplete — set facets.${missingFacets.join("/")} so the What/Why/Size card reads in ~10s`,
      );
    }
    if (!overview.risk?.level) {
      warnings.push("overview has no risk — set risk.level (low/med/high) + note to populate the risk chip");
    }
  }

  // 2. Annotated diffs (skip genuinely trivial ones).
  const unannotated = diffs.filter((d) => !d.description?.trim() && changedLines(d) > TRIVIAL_DIFF_LINES);
  if (unannotated.length) {
    const sample = unannotated.slice(0, SAMPLE_PATHS).map((d) => d.path).join(", ");
    const more = unannotated.length > SAMPLE_PATHS ? "…" : "";
    warnings.push(
      `${unannotated.length} non-trivial diff(s) have no description — annotate each with a bold takeaway + bullets: ${sample}${more}`,
    );
  }

  // 3. Grouping into a narrative once there are enough diffs.
  const topLevelDiffs = blocks.filter((b) => b.type === "diff");
  const hasGroup = blocks.some((b) => b.type === "group");
  if (topLevelDiffs.length >= GROUP_THRESHOLD && !hasGroup) {
    warnings.push(
      `${topLevelDiffs.length} diffs sit ungrouped at the top level — wrap them in group blocks (e.g. core change → wiring → tests) so it reads as a narrative`,
    );
  }

  return warnings;
}
