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
  // Keep each normalized block paired with its RAW mode: normalization coerces some step blocks to
  // static (over the cap, or contrast), and the under-walked nudge must not then tell an author who
  // already asked for step to "consider mode:step" — the cap warning's "split it" is the real advice.
  const examples = rawExamples.map((e) => ({ block: normalizeExample(e).block, rawMode: (e as { mode?: unknown })?.mode }));

  for (const { block: b, rawMode } of examples) {
    if (b.mode === "step" && b.stages.length < STEP_MIN && b.stages.length > 0) {
      warns.push(`example "${b.id}": only ${b.stages.length} stage(s) — stepping hides content that already fits; use static`);
    }
    if (b.mode === "static" && rawMode !== "step" && b.variant === "walkthrough" && b.stages.length > WALK_MAX) {
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

  const reveals = examples.filter(({ block }) => block.mode === "reveal").length;
  if (reveals > 1) {
    warns.push(`${reveals} reveal examples on one page — predict-then-check works once; make the rest static`);
  }
  return warns;
}
