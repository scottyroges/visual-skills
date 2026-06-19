import { escapeHtml } from "../html.js";
import type { Block, FileTreeBlock, OverviewBlock } from "../blocks.js";
import type { ReviewOpts } from "../assemble-review.js";

const RISK_LABEL = { low: "LOW", med: "MED", high: "HIGH" } as const;
const HAMBURGER = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/><rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/><rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg>`;

export function renderTopbar(blocks: Block[], opts: ReviewOpts): string {
  const ov = blocks.find((b): b is OverviewBlock => b.type === "overview");
  const ft = blocks.find((b): b is FileTreeBlock => b.type === "file-tree");
  const meta: string[] = [];
  if (ov?.risk) {
    const L = RISK_LABEL[ov.risk.level];
    meta.push(
      `<span class="chip chip-risk risk-${ov.risk.level}" role="status" aria-label="Risk level: ${L}">&#10003; Risk: ${L}</span>`,
      `<span class="topbar-sep" aria-hidden="true"></span>`,
    );
  }
  if (ft) {
    const added = ft.files.reduce((a, f) => a + f.added, 0);
    const deleted = ft.files.reduce((a, f) => a + f.deleted, 0);
    meta.push(
      `<span class="diff-stat"><span class="diff-add">+${added}</span>&nbsp;<span class="diff-rem">-${deleted}</span></span>`,
      `<span class="chip chip-stat" aria-label="${ft.files.length} files changed">${ft.files.length} files</span>`,
      `<span class="topbar-sep" aria-hidden="true"></span>`,
    );
  }
  meta.push(
    `<span style="font-size:var(--text-xs);color:var(--ink-faint);white-space:nowrap;">${escapeHtml(opts.source)}</span>`,
  );
  return (
    `<header class="topbar" role="banner">` +
    `<button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle file sidebar" aria-expanded="false">${HAMBURGER}</button>` +
    `<span class="topbar-title">${escapeHtml(opts.title)}</span>` +
    `<div class="topbar-meta">${meta.join("")}</div></header>`
  );
}
