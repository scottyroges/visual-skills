import { escapeHtml } from "../html.js";
import type { DiffBlock, DiffHunk } from "../blocks.js";

function lineClass(line: string): "vs-add" | "vs-del" | "vs-ctx" {
  if (line.startsWith("+")) return "vs-add";
  if (line.startsWith("-")) return "vs-del";
  return "vs-ctx";
}

function renderHunk(hunk: DiffHunk): string {
  const lines = hunk.lines
    .map((l) => `<div class="vs-line ${lineClass(l)}">${escapeHtml(l)}</div>`)
    .join("");
  const annotation = hunk.annotation
    ? `<aside class="vs-annotation">${escapeHtml(hunk.annotation)}</aside>`
    : "";
  return (
    `<div class="vs-hunk">` +
    `<div class="vs-hunk-header">${escapeHtml(hunk.header)}</div>` +
    `<pre class="vs-hunk-body">${lines}</pre>${annotation}</div>`
  );
}

export function renderDiff(block: DiffBlock): string {
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    block.hunks.map(renderHunk).join("") +
    `</section>`
  );
}
