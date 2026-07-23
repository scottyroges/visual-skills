import { escapeHtml } from "../html.js";
import { renderInlineMarkdown, renderMarkdown } from "./markdown.js";
import { renderAnnotatedCode } from "./annotated-code.js";
import { renderDiagramCard } from "../review/sections.js";
import type { DiagramResult } from "../render-diagram.js";
import type { Citation, QuizQuestionBlock } from "../quiz-blocks.js";

export interface QuizQuestionCtx {
  num: string;                          // continuous question number, e.g. "3"
  ids: Set<string>;                     // valid in-page fragment targets (allBlockIds)
  diagrams: Map<string, DiagramResult>;
  onWarn?: (msg: string) => void;
}

const FAMILY_LABEL: Record<QuizQuestionBlock["family"], string> = {
  "system-fit": "system fit",
  rationale: "rationale",
  mechanism: "mechanism",
};

/** Citations are styled text; only a validated in-page fragment becomes a link
 *  (safe-link policy: no relative/file hrefs — see src/html.ts SAFE_HREF). */
function renderCitation(c: Citation, ids: Set<string>): string {
  const label = escapeHtml(c.label);
  if (c.fragment && ids.has(c.fragment))
    return `<a class="quiz-cite" href="#${escapeHtml(c.fragment)}">${label}</a>`;
  return `<span class="quiz-cite">${label}</span>`;
}

export async function renderQuizQuestion(b: QuizQuestionBlock, ctx: QuizQuestionCtx): Promise<string> {
  const prompt = await renderMarkdown(b.question, ctx.onWarn);
  const dr = b.diagram ? ctx.diagrams.get(b.diagram.id) : undefined;
  const diagram = b.diagram && dr ? renderDiagramCard(b.diagram, dr) : "";
  const code = b.code ? await renderAnnotatedCode(b.code, ctx.onWarn) : "";
  const points = b.answer.points?.length
    ? `<ul class="quiz-points">${(await Promise.all(
        b.answer.points.map(async (p) => `<li>${await renderInlineMarkdown(p)}</li>`),
      )).join("")}</ul>`
    : "";
  const citations = b.citations.length
    ? `<div class="quiz-citations"><span class="quiz-cite-label">Grounded in</span>` +
      `${b.citations.map((c) => renderCitation(c, ctx.ids)).join("")}</div>`
    : "";
  return (
    `<article class="quiz-q" id="${escapeHtml(b.id)}">` +
    `<div class="quiz-q-head"><span class="quiz-num" aria-hidden="true">${escapeHtml(ctx.num)}</span>` +
    `<span class="quiz-family is-${escapeHtml(b.family)}">${FAMILY_LABEL[b.family]}</span></div>` +
    `<div class="quiz-prompt">${prompt}</div>` +
    diagram + code +
    `<details class="quiz-reveal"><summary>Reveal answer</summary>` +
    `<div class="quiz-answer"><p class="quiz-takeaway">${await renderInlineMarkdown(b.answer.takeaway)}</p>` +
    `${points}${citations}</div></details></article>`
  );
}
