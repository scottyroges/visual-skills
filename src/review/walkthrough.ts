import { escapeHtml } from "../html.js";
import { renderMarkdown } from "../renderers/markdown.js";
import { renderDiffBody } from "./diff.js";
import { renderDiagramLike } from "./sections.js";
import type { Block, DiffBlock, DiffHunk, GroupBlock } from "../blocks.js";
import type { DiagramResult } from "../render-diagram.js";

function countChanges(hunks: DiffHunk[]): { added: number; deleted: number } {
  let added = 0,
    deleted = 0;
  for (const h of hunks)
    for (const l of h.lines) {
      if (l.startsWith("+")) added++;
      else if (l.startsWith("-")) deleted++;
    }
  return { added, deleted };
}

async function renderDesc(md: string, onWarn?: (m: string) => void): Promise<string> {
  const html = (await renderMarkdown(md, onWarn)).trim();
  if (html.startsWith("<ul>")) {
    return html
      .replace(/^<ul>/, '<ul class="desc-list">')
      .replace(/<li>/g, '<li class="desc-item"><span class="desc-bullet" aria-hidden="true">&#8250;</span><span>')
      .replace(/<\/li>/g, "</span></li>");
  }
  return `<div class="section-intro">${html}</div>`;
}

function badge(added: number, deleted: number): { cls: string; label: string } {
  if (deleted === 0 && added > 0) return { cls: "diff-badge-A", label: "Added" };
  if (added === 0 && deleted > 0) return { cls: "", label: "Deleted" };
  return { cls: "diff-badge-M", label: "Modified" };
}

async function renderSubsection(
  d: DiffBlock,
  marker: string,
  onWarn?: (m: string) => void,
  diagrams: Map<string, DiagramResult> = new Map(),
): Promise<string> {
  const { added, deleted } = countChanges(d.hunks);
  const b = badge(added, deleted);
  const path = escapeHtml(d.path);
  const title = escapeHtml(d.title);

  const statChip =
    `<span class="chip chip-stat" style="flex-shrink:0;align-self:flex-start;margin-top:4px;">` +
    `<span style="color:var(--add);">+${added}</span>` +
    (deleted ? ` <span style="color:var(--remove);">-${deleted}</span>` : "") +
    `</span>`;

  const desc = d.description ? await renderDesc(d.description, onWarn) : "";

  const diagramHtml = d.diagram ? renderDiagramLike(d.diagram, diagrams) : "";

  const counts =
    `<span class="diff-counts"><span class="plus">+${added}</span>` +
    (deleted ? `<span class="minus">-${deleted}</span>` : "") +
    `</span>`;

  const badgeClass = b.cls ? `diff-badge ${b.cls}` : "diff-badge";

  return (
    `<div id="${escapeHtml(d.id)}" class="subsection">` +
    `<div class="subsection-header">` +
    `<div style="flex:1;min-width:0;">` +
    `<div class="chapter-marker" style="margin-bottom:4px;"><span class="chapter-marker-num" aria-hidden="true">${marker}</span></div>` +
    `<h4 class="subsection-title">${title} <span class="subsection-path">${path}</span></h4>` +
    `</div>` +
    statChip +
    `</div>` +
    desc +
    diagramHtml +
    `<details class="file-diff">` +
    `<summary>` +
    `<span class="diff-path">${path}</span>` +
    `<span class="${badgeClass}">${b.label}</span>` +
    counts +
    `<svg class="chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `</summary>` +
    renderDiffBody(d) +
    `</details>` +
    `</div>`
  );
}

async function renderChapter(
  g: GroupBlock,
  n: number,
  onWarn?: (m: string) => void,
  diagrams: Map<string, DiagramResult> = new Map(),
): Promise<string> {
  let intro = "";
  if (g.description) {
    const html = (await renderMarkdown(g.description, onWarn)).trim();
    // Block-level markdown wraps a single paragraph in <p>…</p>; unwrap it so the
    // mockup's <p class="section-intro"> doesn't nest <p> inside <p>.
    const m = html.match(/^<p>([\s\S]*)<\/p>$/);
    const inner = m && !m[1].includes("<p>") ? m[1] : html;
    intro = `<p class="section-intro">${inner}</p>`;
  }

  const diffs = g.blocks.filter((b): b is DiffBlock => b.type === "diff");
  const subsections = await Promise.all(
    diffs.map((d, idx) => renderSubsection(d, `${n}${String.fromCharCode(97 + idx)}`, onWarn, diagrams)),
  );

  return (
    `<div id="${escapeHtml(g.id)}" class="section">` +
    `<h3 class="subsection-title" style="font-size:var(--text-xl);font-weight:700;letter-spacing:-0.02em;margin-bottom:4px;display:flex;align-items:center;gap:12px;"><span class="chapter-no">${n}</span>${escapeHtml(g.title)}</h3>` +
    intro +
    subsections.join("") +
    `</div>`
  );
}

export async function renderWalkthrough(
  blocks: Block[],
  onWarn?: (m: string) => void,
  diagrams: Map<string, DiagramResult> = new Map(),
): Promise<string> {
  const groups = blocks.filter((b): b is GroupBlock => b.type === "group");
  const chapters = await Promise.all(groups.map((g, i) => renderChapter(g, i + 1, onWarn, diagrams)));
  return chapters.join("");
}
