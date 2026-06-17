import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Block } from "./blocks.js";
import { isDiagramBlock } from "./blocks.js";
import { escapeHtml } from "./html.js";
import { renderAll } from "./render-diagram.js";
import { renderProse } from "./renderers/prose.js";
import { renderFileTree } from "./renderers/file-tree.js";
import { renderDiff } from "./renderers/diff.js";
import { renderApi } from "./renderers/api.js";

export interface DocStatus { level: "green" | "yellow" | "red"; text: string; }
export interface AssembleOpts {
  title: string;
  source: string;
  status?: DocStatus;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
}

const ASSETS = join(import.meta.dirname ?? ".", "..", "assets");

export async function assemble(blocks: Block[], opts: AssembleOpts): Promise<string> {
  // Render every diagram/schema block to inline SVG up front (preserves order by id).
  const diagramBlocks = blocks.filter(isDiagramBlock);
  const rendered = await renderAll(diagramBlocks, {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const svgById = new Map(rendered.map((r) => [r.id, r]));

  const fragments = blocks.map((b) => {
    switch (b.type) {
      case "diagram":
      case "schema": {
        const r = svgById.get(b.id)!;
        const link = r.editable
          ? `<div class="vs-edit"><a href="${escapeHtml(r.editable)}">open in Excalidraw</a></div>`
          : "";
        return `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${r.svg}${link}</section>`;
      }
      case "prose": return renderProse(b);
      case "file-tree": return renderFileTree(b);
      case "diff": return renderDiff(b);
      case "api": return renderApi(b);
      case "annotated-code":
      case "questions":
        throw new Error(`block "${b.id}": renderer for "${b.type}" is not implemented in this slice (M2)`);
    }
  });

  const css = await readFile(join(ASSETS, "template.css"), "utf8");
  const status = opts.status
    ? `<span class="vs-status ${opts.status.level}">${escapeHtml(opts.status.text)}</span>`
    : "";
  const header =
    `<header class="vs-header"><h1>${escapeHtml(opts.title)}</h1>` +
    `<div class="vs-source">${escapeHtml(opts.source)}</div>${status}</header>`;

  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}</style></head>` +
    `<body><main class="vs-doc">${header}${fragments.join("")}</main></body></html>\n`
  );
}
