import { escapeHtml } from "../html.js";
import type { QuestionsBlock } from "../blocks.js";

export function renderQuestions(block: QuestionsBlock): string {
  const cards = block.questions
    .map(
      (q) =>
        `<div class="vs-question">` +
        `<p class="vs-q">${escapeHtml(q.question)}</p>` +
        `<p class="vs-recommended">` +
        `<span class="vs-rec-label">Recommended:</span> ${escapeHtml(q.recommendedDefault)}` +
        `</p>` +
        `</div>`,
    )
    .join("");
  return (
    `<section class="vs-block vs-questions">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    cards +
    `</section>`
  );
}
