import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html.js";
import {
  assertUniqueAtlasIds, isAtlasChapter, atlasChapterLabel, LAYER_DOTS,
  type AtlasBlock, type AtlasOpts, type DomainOpts,
} from "./atlas-blocks.js";

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

const ZOOM =
  `<div id="zoom-overlay" class="zoom-overlay" aria-hidden="true"><div class="zoom-controls">` +
  `<button id="zoom-out" type="button" aria-label="Zoom out">&#8722;</button>` +
  `<button id="zoom-reset" type="button">Reset</button>` +
  `<button id="zoom-in" type="button" aria-label="Zoom in">+</button>` +
  `<button id="zoom-close" type="button" aria-label="Close">&#10006;</button>` +
  `</div><div id="zoom-stage" class="zoom-stage"></div></div>`;

const TOGGLE =
  `<button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation sidebar" aria-expanded="false">` +
  `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
  `<rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
  `<rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
  `<rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg></button>`;

function chip(cls: string, text: string): string { return `<span class="chip ${cls}">${escapeHtml(text)}</span>`; }

function atlasTopbar(o: AtlasOpts): string {
  const chips: string[] = [];
  if (o.stack) chips.push(chip("chip-stack", o.stack));
  if (o.count) chips.push(chip("chip-count", o.count));
  if ((o.stack || o.count) && (o.date || o.note)) chips.push(`<span class="topbar-sep" aria-hidden="true"></span>`);
  if (o.date) chips.push(chip("chip-stat", o.date));
  if (o.note) chips.push(chip("chip-stat", o.note));
  return `<header class="topbar" role="banner">${TOGGLE}<span class="topbar-title">${escapeHtml(o.title)}</span>` +
    `<div class="topbar-meta">${chips.join("")}</div></header>`;
}

function domainTopbar(o: DomainOpts): string {
  const chips: string[] = [];
  chips.push(`<span class="chip layer-chip layer-${escapeHtml(o.layer)}">${escapeHtml(o.layerLabel)}</span>`);
  if (o.path) chips.push(chip("chip-stat", o.path));
  if (o.count) chips.push(chip("chip-count", o.count));
  if (o.depends) { chips.push(`<span class="topbar-sep" aria-hidden="true"></span>`); chips.push(chip("chip-stat", `depends on ${o.depends}`)); }
  return `<header class="topbar" role="banner">${TOGGLE}` +
    `<a class="topbar-back" href="${escapeHtml(o.backHref ?? "atlas.html")}"><span aria-hidden="true">&larr;</span> Atlas</a>` +
    `<span class="topbar-title">${escapeHtml(o.title)}</span><div class="topbar-meta">${chips.join("")}</div></header>`;
}

async function doc(title: string, generator: string | undefined, topbar: string, sidebar: string, main: string): Promise<string> {
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const specCss = await readFile(join(ASSETS, "spec.css"), "utf8");
  const atlasCss = await readFile(join(ASSETS, "atlas.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `${generator ? `<meta name="generator" content="${escapeHtml(generator)}">` : ""}` +
    `<title>${escapeHtml(title)}</title><style>${css}\n${specCss}\n${atlasCss}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${ZOOM}<script>${viewer}</script></body></html>\n`;
}

interface NavEntry { id: string; label: string; num: string; subs?: { id: string; label: string; dot: string }[]; }

function navEntries(blocks: AtlasBlock[], layer: DomainOpts["layer"] | null): NavEntry[] {
  let n = 0;
  return blocks.map((b) => {
    if (!isAtlasChapter(b)) return { id: b.id, label: b.type === "atlas-tldr" ? "Start here" : "What it owns", num: "—" };
    const e: NavEntry = { id: b.id, label: atlasChapterLabel(b), num: String(++n) };
    if (b.type === "depth" && layer) {
      const dot = LAYER_DOTS[layer];
      e.subs = b.components.map((c) => ({ id: c.id, label: c.name, dot }));
    }
    return e;
  });
}

function outlineHtml(entries: NavEntry[]): string {
  return entries.map((e) => {
    const num = e.num === "—" ? "&#8212;" : e.num;
    const sub = e.subs?.length
      ? `<ul class="outline-sub" role="list">${e.subs.map((s) => {
          const [fill, stroke] = s.dot.split(";");
          return `<li><a href="#${escapeHtml(s.id)}" class="outline-subitem">` +
            `<span class="os-dot" style="background:${fill};border-color:${stroke};"></span>${escapeHtml(s.label)}</a></li>`;
        }).join("")}</ul>`
      : "";
    return `<li><a href="#${escapeHtml(e.id)}" class="outline-item" data-target="${escapeHtml(e.id)}">` +
      `<span class="outline-num" aria-hidden="true">${num}</span><span>${escapeHtml(e.label)}</span></a>${sub}</li>`;
  }).join("");
}

function metaHtml(meta?: { key: string; value: string }[]): string {
  if (!meta?.length) return "";
  const rows = meta.map((m) => `<div class="meta-row"><span class="mk">${escapeHtml(m.key)}</span><span class="mv">${escapeHtml(m.value)}</span></div>`).join("");
  return `<div class="sidebar-section"><span class="sidebar-label">Meta</span><div class="meta-list">${rows}</div></div>`;
}

/** The atlas "Domains" sidebar block, derived from the domain-index tiles. */
function domainsNavHtml(blocks: AtlasBlock[]): string {
  const idx = blocks.find((b): b is Extract<AtlasBlock, { type: "domain-index" }> => b.type === "domain-index");
  if (!idx) return "";
  const items = idx.tiles.map((t) => {
    const [fill, stroke] = LAYER_DOTS[t.layer].split(";");
    const href = t.href ?? "#domains";
    const pending = t.href ? "" : `<span class="nd-pending">overview</span>`;
    return `<li><a href="${escapeHtml(href)}" class="nav-domain"><span class="nd-dot" style="background:${fill};border-color:${stroke};"></span>` +
      `<span>${escapeHtml(t.name)}</span>${pending}</a></li>`;
  }).join("");
  return `<div class="sidebar-section"><span class="sidebar-label">Domains</span><ul class="nav-domains" role="list">${items}</ul></div>`;
}

function sidebar(blocks: AtlasBlock[], opts: { meta?: { key: string; value: string }[] }, layer: DomainOpts["layer"] | null, domainsNav: boolean): string {
  const contents = `<div class="sidebar-section"><span class="sidebar-label">Contents</span>` +
    `<ul class="outline-list" role="list">${outlineHtml(navEntries(blocks, layer))}</ul></div>`;
  return `<nav class="sidebar" id="sidebar" aria-label="Document navigation">` +
    `${contents}${domainsNav ? domainsNavHtml(blocks) : ""}${metaHtml(opts.meta)}</nav>`;
}

function rail(blocks: AtlasBlock[]): string {
  const chapters = navEntries(blocks, null).filter((e) => e.num !== "—");
  if (!chapters.length) return "";
  const steps = chapters.map((e, i) =>
    `<a class="progress-step${i === 0 ? " is-active" : ""}" href="#${escapeHtml(e.id)}">` +
    `<div class="progress-step-num" aria-hidden="true">${escapeHtml(e.num)}</div>` +
    `<span class="progress-step-label">${escapeHtml(e.label)}</span></a>`).join("");
  return `<nav class="progress-rail" aria-label="Section progress">${steps}</nav>`;
}

export async function assembleAtlas(blocks: AtlasBlock[], opts: AtlasOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  const main = `<main class="main">${rail(blocks)}</main>`;  // content blocks wired in a later task
  return doc(opts.title, opts.generator, atlasTopbar(opts), sidebar(blocks, opts, null, true), main);
}

export async function assembleDomain(blocks: AtlasBlock[], opts: DomainOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  const main = `<main class="main">${rail(blocks)}</main>`;  // content blocks wired in a later task
  return doc(opts.title, opts.generator, domainTopbar(opts), sidebar(blocks, opts, opts.layer, false), main);
}
