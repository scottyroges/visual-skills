import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Block } from "./blocks.js";
import { escapeHtml } from "./html.js";
import { assertUniqueIds, collectDiagrams, renderAllDiagrams } from "./review/diagrams.js";
import { renderTldr, renderOverviewPoints } from "./review/tldr.js";
import { renderFilesTable } from "./review/files-table.js";
import { renderWalkthrough } from "./review/walkthrough.js";

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
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");

  // Placeholder shell — real topbar/sidebar/main sections are filled by later tasks.
  const topbar = `<header class="topbar"><div class="topbar-title">${escapeHtml(opts.title)}</div></header>`;
  const sidebar = `<nav class="sidebar"></nav>`;
  const pathToId = collectDiffPaths(blocks);
  let walkthroughRendered = false;
  const mainSections = (await Promise.all(blocks.map(async (b) => {
    if (b.type === "overview") {
      return (
        `<section id="tldr" class="section">${await renderTldr(b)}</section>` +
        `<section id="overview" class="section">` +
        `<div class="section-header"><h2 class="section-title">Overview</h2></div>` +
        `${await renderOverviewPoints(b)}</section>`
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
        `${await renderWalkthrough(blocks, opts.onWarn)}</section>`
      );
    }
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
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${zoomOverlay}` +
    `<script>${viewer}</script></body></html>\n`
  );
}
