import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { Block } from "./blocks.js";
import { isDiagramBlock } from "./blocks.js";
import { lintBlocks } from "./lint-blocks.js";
import { escapeHtml } from "./html.js";
import { renderAll } from "./render-diagram.js";
import { rolesInSource } from "./diagram-colors.js";
import { renderLegend } from "./renderers/legend.js";
import { renderProse } from "./renderers/prose.js";
import { renderFileTree } from "./renderers/file-tree.js";
import { renderDiff } from "./renderers/diff.js";
import { renderOverview } from "./renderers/overview.js";
import { renderApi } from "./renderers/api.js";
import { renderAnnotatedCode } from "./renderers/annotated-code.js";
import { renderQuestions } from "./renderers/questions.js";
import { renderMarkdown } from "./renderers/markdown.js";

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
    else if (b.type === "tabs") assertUniqueIds(b.tabs.map((t) => t.block), seen);
    else if (b.type === "diff" && b.diagram) assertUniqueIds([b.diagram], seen);
    else if (b.type === "overview" && b.diagram) assertUniqueIds([b.diagram], seen);
  }
}

export async function assemble(blocks: Block[], opts: AssembleOpts): Promise<string> {
  assertUniqueIds(blocks);
  // Authoring lints (non-blocking): nudge toward described groups and scannable diff descriptions.
  if (opts.onWarn) for (const w of lintBlocks(blocks)) opts.onWarn(w);
  // Collect diagram/schema blocks recursively (they may be nested in groups), render up front.
  const collectDiagrams = (bs: Block[]): (import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock)[] => {
    const out: (import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock)[] = [];
    for (const b of bs) {
      if (isDiagramBlock(b)) out.push(b);
      else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
      else if (b.type === "tabs") out.push(...collectDiagrams(b.tabs.map((t) => t.block)));
      else if (b.type === "diff" && b.diagram) out.push(...collectDiagrams([b.diagram]));
      else if (b.type === "overview" && b.diagram) out.push(...collectDiagrams([b.diagram]));
    }
    return out;
  };
  // Map each diff block's file path to its block id, so the file tree can link filenames to diffs.
  const collectDiffPaths = (bs: Block[], map = new Map<string, string>()): Map<string, string> => {
    for (const b of bs) {
      if (b.type === "diff") map.set(b.path, b.id);
      else if (b.type === "group") collectDiffPaths(b.blocks, map);
    }
    return map;
  };
  const pathToId = collectDiffPaths(blocks);
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

  // svg (zoomable) + optional editable link, without the outer <section> — reused by diagram
  // blocks and by diagrams embedded inside a diff/overview. The edit link sits OUTSIDE the
  // zoomable wrapper so clicking it navigates instead of opening the zoom overlay.
  const diagramInner = (r: (typeof rendered)[number], legendHtml = ""): string => {
    const link = r.editable
      ? `<div class="vs-edit"><a href="${escapeHtml(basename(r.editable))}">open in Excalidraw</a></div>`
      : "";
    return `<div class="vs-zoomable">${r.svg}</div>${legendHtml}${link}`;
  };

  const legendFor = (b: import("./blocks.js").DiagramBlock | import("./blocks.js").SchemaBlock): string =>
    renderLegend(rolesInSource(b.d2, "mermaid" in b ? b.mermaid : undefined));

  const renderBlock = async (b: Block): Promise<string> => {
    let html: string;
    switch (b.type) {
      case "diagram":
      case "schema": {
        const r = svgById.get(b.id)!;
        // r.svg is trusted: produced by the d2 binary (or Excalidraw), which emit no <script>.
        html = `<section class="vs-block vs-diagram"><h2>${escapeHtml(b.title)}</h2>${diagramInner(r, legendFor(b))}</section>`;
        break;
      }
      case "prose": html = await renderProse(b, opts.onWarn); break;
      case "file-tree": html = renderFileTree(b, pathToId); break;
      case "diff": {
        let diagramHtml = "";
        if (b.diagram?.type === "diagram") {
          diagramHtml = `<div class="vs-diff-diagram"><h3>${escapeHtml(b.diagram.title)}</h3>${diagramInner(svgById.get(b.diagram.id)!, legendFor(b.diagram))}</div>`;
        } else if (b.diagram?.type === "tabs") {
          diagramHtml = `<div class="vs-diff-diagram">${await renderBlock(b.diagram)}</div>`;
        }
        html = await renderDiff(b, opts.onWarn, diagramHtml);
        break;
      }
      case "overview": {
        // Unlike the diff embed (which captions its diagram with an <h3>), the lead diagram is
        // intentionally untitled — a heading here would be redundant above the overview headline.
        let diagramHtml = "";
        if (b.diagram?.type === "diagram") {
          diagramHtml = `<div class="vs-overview-diagram">${diagramInner(svgById.get(b.diagram.id)!, legendFor(b.diagram))}</div>`;
        } else if (b.diagram?.type === "tabs") {
          diagramHtml = `<div class="vs-overview-diagram">${await renderBlock(b.diagram)}</div>`;
        }
        html = await renderOverview(b, diagramHtml);
        break;
      }
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
        const desc = b.description
          ? `<div class="vs-group-desc">${await renderMarkdown(b.description, opts.onWarn)}</div>`
          : "";
        html =
          `<section class="vs-block vs-group"><details open>` +
          `<summary><span class="vs-group-title">${escapeHtml(b.title)}</span></summary>` +
          `${desc}${children.join("")}</details></section>`;
        break;
      }
      case "tabs": {
        for (const t of b.tabs) {
          if (t.block.type === "group" || t.block.type === "tabs") {
            throw new Error(`tab in "${b.id}" may not contain a group or tabs — one level deep only`);
          }
        }
        if (b.tabs.length > 6) {
          opts.onWarn?.(`tabs "${b.id}" has ${b.tabs.length} tabs; only the first 6 are render-visible (CSS cap)`);
        }
        const heading = b.title ? `<h2>${escapeHtml(b.title)}</h2>` : "";
        const name = `vs-tabs-${b.id}`;
        const radios = b.tabs
          .map((_, i) => `<input type="radio" class="vs-tabradio" name="${escapeHtml(name)}" id="${escapeHtml(b.id)}--${i}"${i === 0 ? " checked" : ""}>`)
          .join("");
        const labels = b.tabs
          .map((t, i) => `<label for="${escapeHtml(b.id)}--${i}">${escapeHtml(t.label)}</label>`)
          .join("");
        const panelsHtml = await Promise.all(b.tabs.map((t) => renderBlock(t.block)));
        const panels = panelsHtml.map((p) => `<div class="vs-tabpanel">${p}</div>`).join("");
        html =
          `<section class="vs-block vs-tabs">${heading}` +
          `<div class="vs-tabset">${radios}<div class="vs-tablabels">${labels}</div>` +
          `<div class="vs-tabpanels">${panels}</div></div></section>`;
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
  const viewer = await readFile(join(ASSETS, "viewer.js"), "utf8");
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
    `<body><main class="vs-doc">${header}${fragments.join("")}${opts.generator ? `<footer class="vs-generator">Generated by ${escapeHtml(opts.generator)}</footer>` : ""}</main><script>${viewer}</script></body></html>\n`
  );
}
