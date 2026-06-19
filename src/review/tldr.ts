import { escapeHtml } from "../html.js";
import { renderInlineMarkdown } from "../renderers/markdown.js";
import type { OverviewBlock } from "../blocks.js";

const SAFE_HREF = /^(#[A-Za-z0-9_-]+|https?:\/\/)/;
const RISK_LABEL = { low: "LOW", med: "MED", high: "HIGH" } as const;

export async function renderTldr(b: OverviewBlock): Promise<string> {
  const headline = `<h2 class="tldr-heading">${await renderInlineMarkdown(b.headline)}</h2>`;
  const rows: string[] = [];
  const row = (k: string, vHtml: string) =>
    `<div class="tldr-row"><span class="tldr-key">${k}</span><span class="tldr-val">${vHtml}</span></div>`;
  if (b.facets?.what) rows.push(row("What", await renderInlineMarkdown(b.facets.what)));
  if (b.facets?.why) rows.push(row("Why", await renderInlineMarkdown(b.facets.why)));
  if (b.risk) {
    const chip = `<span class="chip chip-risk risk-${b.risk.level}">&#10003; ${RISK_LABEL[b.risk.level]}</span>`;
    const note = b.risk.note ? " " + await renderInlineMarkdown(b.risk.note) : "";
    rows.push(row("Risk", `${chip}${note}`));
  }
  if (b.facets?.size) rows.push(row("Size", await renderInlineMarkdown(b.facets.size)));

  const start = b.startHref && SAFE_HREF.test(b.startHref)
    ? `<div class="tldr-start"><span class="tldr-start-label">Start here</span> ` +
      `<a href="${escapeHtml(b.startHref)}">&#8594;</a></div>`
    : "";

  return (
    `<div class="tldr-card">` +
    `<div class="tldr-header"><span class="tldr-eyebrow">TL;DR</span>${headline}</div>` +
    `<div class="tldr-rows">${rows.join("")}</div>${start}</div>`
  );
}

// The "Overview" section: key-fact points with embedded keyword links (mockup #overview).
export async function renderOverviewPoints(b: OverviewBlock): Promise<string> {
  const items = await Promise.all(b.points.map(async (p, i) => {
    const inner = await renderInlineMarkdown(p.text);
    const text = p.href && SAFE_HREF.test(p.href) && !/<a[\s>]/i.test(inner)
      ? `<a href="${escapeHtml(p.href)}">${inner}</a>` : inner;
    return `<li class="overview-item"><span class="overview-num" aria-hidden="true">${i + 1}</span><span class="overview-text">${text}</span></li>`;
  }));
  return `<ul class="overview-list">${items.join("")}</ul>`;
}
