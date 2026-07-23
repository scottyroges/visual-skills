// Structural floor for quiz docs — heuristics surfaced via onWarn, not hard errors (same
// philosophy as lint-spec.ts). Altitude and proportionality are SKILL.md authoring rules:
// the render-only CLI has no source inventory to judge coverage against.
import { allBlockIds, allQuestions, type QuizBlock } from "./quiz-blocks.js";

const TRIVIA: [RegExp, string][] = [
  [/\bwhich file\b/i, "which file"],
  [/\bwhat file\b/i, "what file"],
  [/\bhow many\b/i, "how many"],
  [/\bwhat line\b/i, "what line"],
  [/\bdid we test\b/i, "did we test"],
];

export function lintQuiz(blocks: QuizBlock[]): string[] {
  const warns: string[] = [];
  const qs = allQuestions(blocks);
  const ids = allBlockIds(blocks);

  if (qs.length < 2)
    warns.push("fewer than 2 questions — even a one-file fix earns 2-3 (mechanism + rationale)");

  for (const q of qs) {
    if (!q.answer?.takeaway?.trim())
      warns.push(`question "${q.id}" has no answer takeaway — every question carries a bold model answer`);
    if (!q.citations?.length)
      warns.push(`question "${q.id}" has no citations — ground the model answer in the source (file:lines or a doc section)`);
    const hit = TRIVIA.find(([re]) => re.test(q.question));
    if (hit)
      warns.push(`question "${q.id}" looks like recall trivia ("${hit[1]}...") — ask for the why/mechanism, not what ctrl-F can answer`);
    for (const c of q.citations ?? []) {
      if (c.fragment && !ids.has(c.fragment))
        warns.push(`question "${q.id}" cites unknown fragment "#${c.fragment}" — citation fragments must match a block id in this doc`);
    }
  }

  if (qs.length >= 4 && new Set(qs.map((x) => x.family)).size === 1)
    warns.push(`all ${qs.length} questions test one family ("${qs[0].family}") — a medium+ quiz mixes system-fit, rationale, and mechanism`);

  return warns;
}
