import { escapeHtml } from "../html.js";
import { highlightLines, langFromPath } from "../highlight.js";
import type { DiffBlock, DiffHunk } from "../blocks.js";

function lineClass(line: string): "vs-add" | "vs-del" | "vs-ctx" {
  if (line.startsWith("+")) return "vs-add";
  if (line.startsWith("-")) return "vs-del";
  return "vs-ctx";
}

function marker(line: string): string {
  if (line.startsWith("+")) return "+";
  if (line.startsWith("-")) return "-";
  return " ";
}

function stripMarker(line: string): string {
  return line.length ? line.slice(1) : line;
}

async function renderHunk(
  hunk: DiffHunk,
  lang: string,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const stripped = hunk.lines.map(stripMarker).join("\n");
  const highlighted = await highlightLines(stripped, lang, onWarn);
  const rows = hunk.lines
    .map((l, i) => {
      const gutter = `<span class="vs-gutter">${escapeHtml(marker(l))}</span>`;
      const content = highlighted ? highlighted[i] : escapeHtml(stripMarker(l));
      return `<div class="vs-line ${lineClass(l)}">${gutter}${content}</div>`;
    })
    .join("");
  const annotation = hunk.annotation
    ? `<aside class="vs-annotation">${escapeHtml(hunk.annotation)}</aside>`
    : "";
  return (
    `<div class="vs-hunk">` +
    `<div class="vs-hunk-header">${escapeHtml(hunk.header)}</div>` +
    `<pre class="vs-hunk-body">${rows}</pre>${annotation}</div>`
  );
}

export async function renderDiff(
  block: DiffBlock,
  onWarn?: (msg: string) => void,
): Promise<string> {
  const lang = langFromPath(block.path);
  const hunks = await Promise.all(block.hunks.map((h) => renderHunk(h, lang, onWarn)));
  return (
    `<section class="vs-block vs-diff">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<div class="vs-path">${escapeHtml(block.path)}</div>` +
    hunks.join("") +
    `</section>`
  );
}
