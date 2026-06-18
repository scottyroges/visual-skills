import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Block } from "./blocks.js";
import { isDiagramBlock } from "./blocks.js";
import { escapeHtml } from "./html.js";
import { renderAll } from "./render-diagram.js";
import { renderProse } from "./renderers/prose.js";
import { renderFileTree } from "./renderers/file-tree.js";
import { renderDiff } from "./renderers/diff.js";
import { renderApi } from "./renderers/api.js";
import { renderAnnotatedCode } from "./renderers/annotated-code.js";
import { renderQuestions } from "./renderers/questions.js";

export interface DocStatus { level: "green" | "yellow" | "red"; text: string; }
export interface AssembleOpts {
  title: string;
  source: string;
  status?: DocStatus;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
  generator?: string;
}

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

/** Throw if any block id repeats (recursively, incl. group children) — anchors and
 *  in-page #cross-links depend on every block id being unique across the document. */
function assertUniqueIds(blocks: Block[], seen = new Set<string>()): void {
  for (const b of blocks) {
    if (seen.has(b.id)) {
      throw new Error(`duplicate block id "${b.id}" — block ids must be unique (anchors/cross-links depend on it)`);
    }
    seen.add(b.id);
    if (b.type === "group") assertUniqueIds(b.blocks, seen);
  }
}

export async function assemble(blocks: Block[], opts: AssembleOpts): Promise<string> {
  assertUniqueIds(blocks);
  // Collect diagram/schema blocks recursively (they may be nested in groups), render up front.
  const collectDiagrams = (bs: Block[]): (import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock)[] => {
    const out: (import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock)[] = [];
    for (const b of bs) {
      if (isDiagramBlock(b)) out.push(b);
      else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
    }
    return out;
  };
  const rendered = await renderAll(collectDiagrams(blocks), {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const svgById = new Map<string, (typeof rendered)[number]>();
  for (const r of rendered) {
    if (svgById.has(r.id)) {
      throw new Error(`duplicate diagram/schema block id "${r.id}" — block ids must be unique`);
    }
    svgById.set(r.id, r);
  }

  // Inject the block id as an in-page anchor on its top-level <section>.
  const withAnchor = (id: string, html: string): string =>
    html.replace('<section class="vs-block', `<section id="${escapeHtml(id)}" class="vs-block`);

  const renderBlock = async (b: Block): Promise<string> => {
    let html: string;
    switch (b.type) {
      case "diagram":
      case "schema": {
        const r = svgById.get(b.id)!;
        const link = r.editable
          ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
          : "";
        // r.svg is trusted: produced by the d2 binary (or Excalidraw), which emit no <script>.
        html = `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${r.svg}${link}</section>`;
        break;
      }
      case "prose": html = await renderProse(b, opts.onWarn); break;
      case "file-tree": html = renderFileTree(b); break;
      case "diff": html = await renderDiff(b, opts.onWarn); break;
      case "api": html = renderApi(b); break;
      case "annotated-code": html = await renderAnnotatedCode(b, opts.onWarn); break;
      case "questions": html = renderQuestions(b); break;
      case "group": {
        for (const child of b.blocks) {
          if (child.type === "group") {
            throw new Error(`group "${b.id}" contains a nested group "${child.id}" — groups may not nest`);
          }
        }
        const children = await Promise.all(b.blocks.map(renderBlock));
        html = `<section class="vs-block vs-group"><h2>${escapeHtml(b.title)}</h2>${children.join("")}</section>`;
        break;
      }
      default: {
        const _exhaustive: never = b;
        throw new Error(`unhandled block type: ${(_exhaustive as Block).type}`);
      }
    }
    return withAnchor(b.id, html);
  };

  const fragments = await Promise.all(blocks.map(renderBlock));

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
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}</style></head>` +
    `<body><main class="vs-doc">${header}${fragments.join("")}${opts.generator ? `<footer class="vs-generator">Generated by ${escapeHtml(opts.generator)}</footer>` : ""}</main></body></html>\n`
  );
}
