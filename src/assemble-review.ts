import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Block } from "./blocks.js";
import { escapeHtml } from "./html.js";
import { assertUniqueIds, collectDiagrams, renderAllDiagrams } from "./review/diagrams.js";
import { renderTldr, renderOverviewPoints } from "./review/tldr.js";
import { renderFilesTable } from "./review/files-table.js";
import { renderWalkthrough } from "./review/walkthrough.js";
import { renderDiagramCard, renderApiSurface, renderReusedBlock, renderDiagramLike } from "./review/sections.js";
import { renderTopbar } from "./review/topbar.js";
import { renderSidebar, renderProgressRail } from "./review/sidebar.js";
import { groupLooseDiffs } from "./review/normalize.js";
import { lintBlocks } from "./lint-blocks.js";
import { lintCompleteness } from "./lint-completeness.js";

function collectDiffPaths(bs: Block[], map = new Map<string, string>()): Map<string, string> {
  for (const b of bs) {
    if (b.type === "diff") map.set(b.path, b.id);
    else if (b.type === "group") collectDiffPaths(b.blocks, map);
  }
  return map;
}

export interface ReviewStatus { level: "green" | "yellow" | "red"; text: string; }
export interface ReviewOpts {
  title: string;
  source: string;
  status?: ReviewStatus;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
  generator?: string;
}

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

export async function assembleReview(blocks: Block[], opts: ReviewOpts): Promise<string> {
  assertUniqueIds(blocks);
  const view = groupLooseDiffs(blocks);
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const themeCss = await readFile(join(ASSETS, "theme.css"), "utf8");
  const themeHead = await readFile(join(ASSETS, "theme-head.js"), "utf8");
  const themeToggle = await readFile(join(ASSETS, "theme-toggle.js"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");

  const topbar = renderTopbar(view, opts);
  const pathToId = collectDiffPaths(view);
  const sidebar = renderSidebar(view, pathToId, opts);
  const diagrams = await renderAllDiagrams(view, {
    outDir: opts.outDir,
    excalidraw: opts.excalidraw,
    onWarn: opts.onWarn,
  });
  if (opts.onWarn) {
    for (const w of lintBlocks(blocks)) opts.onWarn(w); // NOTE: lint the ORIGINAL blocks, not `view`
    for (const w of lintCompleteness(blocks)) opts.onWarn(w); // demo-standard floor: overview/TL;DR/annotations/grouping
    const failed = [...diagrams.values()].filter((r) => r.failed).map((r) => r.id);
    if (failed.length) opts.onWarn(`${failed.length} diagram(s) failed to compile and show a placeholder: ${failed.join(", ")} — fix their d2 source`);
  }
  let walkthroughRendered = false;
  const mainSections = (await Promise.all(view.map(async (b) => {
    if (b.type === "overview") {
      const leadDiagram = b.diagram
        ? `<section id="${escapeHtml(b.id)}-diagram" class="section">${renderDiagramLike(b.diagram, diagrams)}</section>`
        : "";
      return (
        `<section id="tldr" class="section">${await renderTldr(b)}</section>` +
        `<section id="overview" class="section">` +
        `<div class="section-header"><h2 class="section-title">Overview</h2></div>` +
        `${await renderOverviewPoints(b)}</section>` +
        leadDiagram
      );
    }
    if (b.type === "file-tree") {
      return (
        `<section id="files-changed" class="section">` +
        `<div class="section-header"><h2 class="section-title">Files changed</h2></div>` +
        `${renderFilesTable(b, pathToId)}</section>`
      );
    }
    if (b.type === "group") {
      // All chapters live in one <section id="walkthrough">: render it on the first
      // group block encountered and skip the rest.
      if (walkthroughRendered) return "";
      walkthroughRendered = true;
      return (
        `<section id="walkthrough" class="section">` +
        `<div class="section-header"><h2 class="section-title">Guided walkthrough</h2></div>` +
        `${renderProgressRail(view)}${await renderWalkthrough(view, opts.onWarn, diagrams)}</section>`
      );
    }
    if (b.type === "diagram" || b.type === "schema") {
      return `<section id="${escapeHtml(b.id)}" class="section">${renderDiagramCard(b, diagrams.get(b.id)!)}</section>`;
    }
    if (b.type === "tabs") {
      return `<section id="${escapeHtml(b.id)}" class="section">${renderDiagramLike(b, diagrams)}</section>`;
    }
    if (b.type === "api") {
      return (
        `<section id="${escapeHtml(b.id)}" class="section">` +
        `<div class="section-header"><h2 class="section-title">${escapeHtml(b.title)}</h2></div>` +
        `${renderApiSurface(b)}</section>`
      );
    }
    if (b.type === "prose" || b.type === "questions" || b.type === "annotated-code") {
      return `<section id="${escapeHtml(b.id)}" class="section">${await renderReusedBlock(b, opts.onWarn)}</section>`;
    }
    opts.onWarn?.(`review: no renderer for block type "${b.type}" (id ${b.id})`);
    return `<section class="section" id="${escapeHtml(b.id)}"></section>`;
  }))).join("");
  const main = `<main class="main">${mainSections}</main>`;
  const zoomOverlay =
    `<div id="zoom-overlay" class="zoom-overlay" aria-hidden="true">` +
    `<div class="zoom-controls">` +
    `<button id="zoom-out" type="button" aria-label="Zoom out">&#8722;</button>` +
    `<button id="zoom-reset" type="button">Reset</button>` +
    `<button id="zoom-in" type="button" aria-label="Zoom in">+</button>` +
    `<button id="zoom-close" type="button" aria-label="Close">&#10006;</button>` +
    `</div><div id="zoom-stage" class="zoom-stage"></div></div>`;

  return (
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<script>${themeHead}</script>` +
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}\n${themeCss}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${zoomOverlay}` +
    `<script>${viewer}</script><script>${themeToggle}</script></body></html>\n`
  );
}
