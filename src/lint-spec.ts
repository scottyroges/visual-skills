// Document-level completeness lint for visual-spec — the "demo-standard floor". A bare page that
// skips the lead, the decisions, or the scope underdelivers; these warnings (surfaced via onWarn)
// nudge the author back to the standard. The lesson from the recap rewrite: a mechanical backstop
// keeps every page at the bar even when the prose says "good enough". Heuristics, not hard errors.
import type { SpecBlock, DecisionsBlock, TldrBlock } from "./spec-blocks.js";

/** A spec with this many chapters is "large" — it should carry the fuller treatment. */
const LARGE_CHAPTERS = 5;

export function lintSpec(blocks: SpecBlock[]): string[] {
  const warns: string[] = [];
  const types = new Set(blocks.map((b) => b.type));
  const chapters = blocks.filter((b) => b.type !== "tldr" && b.type !== "reference").length;
  const large = chapters >= LARGE_CHAPTERS;

  // Lead
  const tldr = blocks.find((b): b is TldrBlock => b.type === "tldr");
  if (!tldr) {
    warns.push("no TL;DR block — lead with one (What / Why / Closes / Size) so a cold reader groks the spec in seconds");
  } else {
    if (!tldr.rows.length) warns.push("TL;DR has no rows — add What / Why / Closes / Size");
    if (large && !tldr.bigIdea) warns.push("TL;DR has no big-idea line — pull the spec's single load-bearing insight out as a headline");
  }

  // Decisions — the highest-value content for an approver
  const decisions = blocks.find((b): b is DecisionsBlock => b.type === "decisions");
  if (!decisions) {
    warns.push("no Key decisions block — the load-bearing choices are what a reviewer scrutinizes; add them with their rationale");
  } else {
    const noWhy = decisions.decisions.filter((d) => !d.why?.trim()).length;
    if (noWhy) warns.push(`${noWhy} decision(s) lack a "why" — approval hinges on the rationale, not just the choice`);
    if (decisions.decisions.length >= 4 && !decisions.decisions.some((d) => d.rejected?.trim())) {
      warns.push("no rejected-alternative on any decision — name the path not taken on the 2–3 most contested ones");
    }
  }

  // Boundaries
  if (!types.has("scope")) warns.push("no Scope block — in/out boundaries are approval-critical; reviewers check them first");

  // Orientation picture + reviewer surfaces (scaled to size)
  if (large && !types.has("diagram")) warns.push("no hero diagram — a large spec should lead with one architecture/flow diagram (new vs preserved)");
  if (large && !types.has("rollout")) warns.push("no Rollout block — a large spec usually ships in gated sub-phases; show them");
  if (large && !types.has("approve")) warns.push("no 'Before you approve' block — surface what sign-off commits to, the riskiest seam, and open questions");

  return warns;
}
