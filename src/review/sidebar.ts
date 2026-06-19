import type { Block, FileChange, GroupBlock } from "../blocks.js";
import { escapeHtml } from "../html.js";
import { stripChapterOrdinal } from "./normalize.js";
import type { ReviewOpts } from "../assemble-review.js";

const STATUS_LABEL: Record<FileChange["status"], string> = {
  A: "Added",
  M: "Modified",
  D: "Deleted",
  R: "Renamed",
};

/** One `.progress-step` per group (chapter); the first is active. */
export function renderProgressRail(blocks: Block[]): string {
  const groups = blocks.filter((b): b is GroupBlock => b.type === "group");
  if (groups.length === 0) return "";
  const steps = groups
    .map((g, i) => {
      const active = i === 0 ? " is-active" : "";
      return (
        `<a class="progress-step${active}" href="#${escapeHtml(g.id)}">` +
        `<div class="progress-step-num" aria-hidden="true">${i + 1}</div>` +
        `<span class="progress-step-label">${escapeHtml(stripChapterOrdinal(g.title))}</span></a>`
      );
    })
    .join("");
  return (
    `<nav class="progress-rail" aria-label="Jump to walkthrough chapter">${steps}</nav>`
  );
}

function renderFile(f: FileChange, pathToId: Map<string, string>): string {
  const shortName = f.path.split("/").slice(-2).join("/");
  const stat =
    `<span class="file-stat"><span class="plus">+${f.added}</span>` +
    `${f.deleted === 0 ? "" : `<span class="minus">-${f.deleted}</span>`}</span>`;
  const inner =
    `<span class="file-status file-status-${escapeHtml(f.status)}" aria-label="${STATUS_LABEL[f.status]}">${escapeHtml(f.status)}</span>` +
    `<span class="file-name">${escapeHtml(shortName)}</span>` +
    stat;
  const id = pathToId.get(f.path);
  if (id) {
    return `<li><a href="#${escapeHtml(id)}" class="file-item" title="${escapeHtml(f.path)}">${inner}</a></li>`;
  }
  return `<li><span class="file-item" title="${escapeHtml(f.path)}">${inner}</span></li>`;
}

/** nav#sidebar with files / walkthrough outline / meta sections. */
export function renderSidebar(
  blocks: Block[],
  pathToId: Map<string, string>,
  opts: ReviewOpts,
): string {
  const sections: string[] = [];

  // Files section
  const fileTree = blocks.find((b) => b.type === "file-tree");
  if (fileTree && fileTree.type === "file-tree") {
    const items = fileTree.files.map((f) => renderFile(f, pathToId)).join("");
    sections.push(
      `<div class="sidebar-section">` +
        `<span class="sidebar-label">Files changed (${fileTree.files.length})</span>` +
        `<ul class="file-list" role="list">${items}</ul></div>`,
    );
  }

  // Walkthrough outline section
  const overview = blocks.find((b) => b.type === "overview");
  const groups = blocks.filter((b): b is GroupBlock => b.type === "group");
  const outline: string[] = [];
  outline.push(
    `<li><a href="#tldr" class="outline-item" data-target="tldr">` +
      `<span class="outline-num" aria-hidden="true">&#8212;</span><span>TL;DR</span></a></li>`,
  );
  if (overview) {
    outline.push(
      `<li><a href="#overview" class="outline-item" data-target="overview">` +
        `<span class="outline-num" aria-hidden="true">&#8212;</span><span>Overview</span></a></li>`,
    );
  }
  groups.forEach((g, i) => {
    outline.push(
      `<li><a href="#${escapeHtml(g.id)}" class="outline-item" data-target="${escapeHtml(g.id)}">` +
        `<span class="outline-num" aria-hidden="true">${i + 1}</span>` +
        `<span>${escapeHtml(g.title)}</span></a></li>`,
    );
    g.blocks
      .filter((c) => c.type === "diff")
      .forEach((c, j) => {
        if (c.type !== "diff") return;
        const marker = `${i + 1}${String.fromCharCode(97 + j)}`;
        outline.push(
          `<li><a href="#${escapeHtml(c.id)}" class="outline-item" data-target="${escapeHtml(c.id)}" style="padding-left:28px;">` +
            `<span class="outline-num" aria-hidden="true">${marker}</span>` +
            `<span>${escapeHtml(c.title)}</span></a></li>`,
        );
      });
  });
  sections.push(
    `<div class="sidebar-section">` +
      `<span class="sidebar-label">Walkthrough</span>` +
      `<ul class="outline-list" role="list">${outline.join("")}</ul></div>`,
  );

  // Meta section
  const metaLines = opts.source
    .split(" · ")
    .map((seg) => `<div>${escapeHtml(seg)}</div>`)
    .join("");
  sections.push(
    `<div class="sidebar-section">` +
      `<span class="sidebar-label">Meta</span>` +
      `<div style="padding:0 14px 8px;font-size:var(--text-xs);color:var(--ink-faint);line-height:1.8;overflow-wrap:anywhere;">${metaLines}</div></div>`,
  );

  return (
    `<nav class="sidebar" id="sidebar" aria-label="Document navigation">${sections.join("")}</nav>`
  );
}
