import { escapeHtml } from "../html.js";
import { renderInlineMarkdown } from "./markdown.js";
import type { OverviewBlock } from "../blocks.js";

// Only fragment (#id) and absolute http(s) hrefs are linkable — defense-in-depth against a
// javascript:/data: href slipping into a point; anything else renders as plain text.
const SAFE_HREF = /^(#[A-Za-z0-9_-]+|https?:\/\/)/;

export async function renderOverview(
  block: OverviewBlock,
  diagramHtml = "",
): Promise<string> {
  const headline = `<h2 class="vs-overview-headline">${await renderInlineMarkdown(block.headline)}</h2>`;
  const items = await Promise.all(
    block.points.map(async (p) => {
      const inner = await renderInlineMarkdown(p.text);
      // Author can link a keyword inline via markdown. If they didn't and an href is given,
      // append a small trailing arrow link instead of wrapping the entire bullet.
      const body =
        p.href && SAFE_HREF.test(p.href) && !/<a[\s>]/i.test(inner)
          ? `${inner} <a class="vs-point-link" href="${escapeHtml(p.href)}">→</a>`
          : inner;
      return `<li>${body}</li>`;
    }),
  );
  const points = items.length ? `<ul class="vs-overview-points">${items.join("")}</ul>` : "";
  return `<section class="vs-block vs-overview">${headline}${diagramHtml}${points}</section>`;
}
