import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html.js";
import {
  assertUniqueAtlasIds, isAtlasChapter, atlasChapterLabel, LAYER_DOTS, collectAtlasDiagrams,
  type AtlasBlock, type AtlasOpts, type DomainOpts, type AtlasDiagram,
  type KV, type ComponentDeep,
} from "./atlas-blocks.js";
import { renderInlineMarkdown } from "./renderers/markdown.js";
import { renderAll, type DiagramResult } from "./render-diagram.js";
import { withDiagramSvgClass } from "./review/sections.js";
import { lintAtlas, lintDomain } from "./lint-atlas.js";

const mi = (s: string) => renderInlineMarkdown(s);

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
    `<a class="topbar-back" href="${escapeHtml(o.backHref ?? "../atlas.html")}"><span aria-hidden="true">&larr;</span> Atlas</a>` +
    `<span class="topbar-title">${escapeHtml(o.title)}</span><div class="topbar-meta">${chips.join("")}</div></header>`;
}

async function doc(title: string, generator: string | undefined, topbar: string, sidebar: string, main: string): Promise<string> {
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const specCss = await readFile(join(ASSETS, "spec.css"), "utf8");
  const atlasCss = await readFile(join(ASSETS, "atlas.css"), "utf8");
  const themeCss = await readFile(join(ASSETS, "theme.css"), "utf8");
  const themeHead = await readFile(join(ASSETS, "theme-head.js"), "utf8");
  const themeToggle = await readFile(join(ASSETS, "theme-toggle.js"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<script>${themeHead}</script>` +
    `${generator ? `<meta name="generator" content="${escapeHtml(generator)}">` : ""}` +
    `<title>${escapeHtml(title)}</title><style>${css}\n${specCss}\n${atlasCss}\n${themeCss}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${ZOOM}<script>${viewer}</script><script>${themeToggle}</script></body></html>\n`;
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
  const rows = (meta ?? [])
    .map((m) => ({ key: String(m?.key ?? ""), value: String(m?.value ?? "") }))
    .filter((m) => m.key || m.value);
  if (!rows.length) return "";
  const html = rows.map((m) => `<div class="meta-row"><span class="mk">${escapeHtml(m.key)}</span><span class="mv">${escapeHtml(m.value)}</span></div>`).join("");
  return `<div class="sidebar-section"><span class="sidebar-label">Meta</span><div class="meta-list">${html}</div></div>`;
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

export function atlasLegend(items?: AtlasDiagram["legend"]): string {
  if (!items?.length) return "";
  const spans = items.map((i) =>
    `<span class="legend-item"><span class="legend-swatch" style="background:${i.fill};border-color:${i.stroke};"></span>${escapeHtml(i.label)}</span>`).join("");
  return `<div class="legend" aria-label="Diagram legend">${spans}</div>`;
}

const ENLARGE = `<button class="diagram-enlarge" type="button" aria-label="Enlarge diagram">&#10530; Enlarge</button>`;

/** A diagram card with NO title above it (the section header supplies context). The svg gets
 *  the diagram-svg class so the zoom overlay + sizing rule apply. domain-map uses its own path. */
export async function renderAtlasDiagram(d: AtlasDiagram, diagrams: Map<string, DiagramResult>): Promise<string> {
  const r = diagrams.get(d.id);
  const svg = r ? withDiagramSvgClass(r.svg) : "";
  const cap = d.caption ? `<p class="diagram-caption">${await mi(d.caption)}</p>` : "";
  return `<div class="diagram-box">${ENLARGE}${svg}</div>${atlasLegend(d.legend)}${cap}`;
}

function sectionHeader(title?: string, badge?: string): string {
  if (!title) return "";
  return `<div class="section-header"><h2 class="section-title">${escapeHtml(title)}</h2>` +
    `${badge ? `<span class="section-badge">${escapeHtml(badge)}</span>` : ""}</div>`;
}

async function renderAtlasTldr(b: Extract<AtlasBlock, { type: "atlas-tldr" }>): Promise<string> {
  const rows = (await Promise.all(b.rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span><span class="tldr-val">${await mi(r.value)}</span></div>`))).join("");
  const card = `<div class="tldr-card"><div class="tldr-header"><span class="tldr-eyebrow">${escapeHtml(b.eyebrow ?? "Start here")}</span>` +
    `<h2 class="tldr-heading">${await mi(b.heading)}</h2></div><div class="tldr-rows">${rows}</div></div>`;
  const primer = b.primer?.length
    ? `<div class="primer">${(await Promise.all(b.primer.map(async (p, i) =>
        `<div class="primer-row"><span class="primer-n">${i + 1}</span><div class="primer-body">` +
        `<div class="primer-h">${await mi(p.h)}</div><div class="primer-p">${await mi(p.p)}</div></div></div>`))).join("")}</div>`
    : "";
  return card + primer;
}

async function renderDomainMap(b: Extract<AtlasBlock, { type: "domain-map" }>): Promise<string> {
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="diagram-box">${ENLARGE}${b.svg}</div>${atlasLegend(b.legend)}` +
    `${b.caption ? `<p class="diagram-caption">${await mi(b.caption)}</p>` : ""}`;
}

async function renderDomainIndex(b: Extract<AtlasBlock, { type: "domain-index" }>): Promise<string> {
  const tiles = (await Promise.all(b.tiles.map(async (t) => {
    const meta = t.meta?.length
      ? `<div class="domain-tile-meta">${(await Promise.all(t.meta.map(async (m) =>
          `<span>${m.key ? `<span class="dm-k">${escapeHtml(m.key)}</span> ` : ""}${await mi(m.value)}</span>`))).join("")}</div>`
      : "";
    const deps = t.deps?.length
      ? `<div class="domain-tile-deps"><span class="dep-label">depends on</span>${t.deps.map((d) => `<span class="dep-chip">${escapeHtml(d)}</span>`).join("")}</div>`
      : "";
    const head = `<div class="domain-tile-head"><span class="domain-tile-name">${escapeHtml(t.name)}</span>` +
      `<span class="domain-tile-path">${escapeHtml(t.path)}</span>` +
      `<span class="layer-chip layer-${escapeHtml(t.layer)}">${escapeHtml(t.layerLabel)}</span></div>`;
    const body = `${head}<p class="domain-tile-purpose">${await mi(t.purpose)}</p>${meta}${deps}`;
    if (t.href)
      return `<a class="domain-tile is-linked" href="${escapeHtml(t.href)}">${body}` +
        `<div class="domain-tile-foot">Open domain <span class="dtf-arrow" aria-hidden="true">&rarr;</span></div></a>`;
    return `<div class="domain-tile is-pending">${body}<div class="domain-tile-foot">Page pending</div></div>`;
  }))).join("");
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}<div class="domain-grid">${tiles}</div>`;
}

async function renderDomainTldr(b: Extract<AtlasBlock, { type: "domain-tldr" }>): Promise<string> {
  const rows = (await Promise.all(b.rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span><span class="tldr-val">${await mi(r.value)}</span></div>`))).join("");
  const card = `<div class="tldr-card"><div class="tldr-header"><span class="tldr-eyebrow">${escapeHtml(b.eyebrow ?? "Domain")}</span>` +
    `<h2 class="tldr-heading">${await mi(b.heading)}</h2></div><div class="tldr-rows">${rows}</div></div>`;
  const big = b.bigIdea
    ? `<div class="bigidea"><div class="bigidea-label">${escapeHtml(b.bigIdea.label ?? "The load-bearing idea")}</div>` +
      `<div class="bigidea-line">${await mi(b.bigIdea.line)}</div>` +
      `${b.bigIdea.sub ? `<p class="bigidea-sub">${await mi(b.bigIdea.sub)}</p>` : ""}</div>`
    : "";
  return card + big;
}

async function renderComponents(b: Extract<AtlasBlock, { type: "components" }>): Promise<string> {
  const cards = (await Promise.all(b.cards.map(async (c) => {
    const chips = (c.exports ?? []).map((e) => `<span class="skill-chip${e.deputy ? " is-deputy" : ""}">${escapeHtml(e.name)}</span>`).join("");
    const row = chips ? `<div class="board-row"><span class="board-row-label">${escapeHtml(c.exportsLabel ?? "exports")}</span>${chips}</div>` : "";
    return `<a class="board-card" href="${escapeHtml(c.href)}"><div class="board-name">${escapeHtml(c.name)}</div>` +
      `<div class="board-purpose">${await mi(c.purpose)}</div>${row}` +
      `<div class="card-jump">Full section <span class="cj-arrow" aria-hidden="true">&darr;</span></div></a>`;
  }))).join("");
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}<div class="board-grid">${cards}</div>`;
}

async function renderDiagramSection(b: Extract<AtlasBlock, { type: "diagram-section" }>, diagrams: Map<string, DiagramResult>): Promise<string> {
  const callout = b.callout
    ? `<div class="callout"><span class="callout-icon" aria-hidden="true">&#9737;</span><span class="callout-text">${await mi(b.callout)}</span></div>`
    : "";
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `${await renderAtlasDiagram(b.diagram, diagrams)}${callout}`;
}

async function kvList(rows: KV[]): Promise<string> {
  return Promise.all(rows.map(async (r) =>
    `<div class="owns-row"><span class="owns-name">${escapeHtml(r.name)}</span>` +
    `<span class="owns-desc">${await mi(r.desc)}</span></div>`)).then((x) => `<div class="owns-list">${x.join("")}</div>`);
}

function labeled(label: string, body: string): string { return `<div class="conns-label">${label}</div>${body}`; }

async function renderComponentDeep(c: ComponentDeep, diagrams: Map<string, DiagramResult>): Promise<string> {
  const head = `<div class="subsection-header"><h3 class="subsection-title">${escapeHtml(c.name)} ` +
    `<span class="subsection-path">${escapeHtml(c.path)}</span></h3>` +
    `<a href="#components" class="subsection-back">&uarr; back to cards</a></div>`;
  const detail = (await Promise.all(c.detail.map(async (p) => `<p class="detail-p">${await mi(p)}</p>`))).join("");
  const diags = (await Promise.all((c.diagrams ?? []).map((d) => renderAtlasDiagram(d, diagrams)))).join("");
  const code = c.codeHtml ?? "";
  const files = c.files?.length ? labeled("Key files", await kvList(c.files)) : "";
  const exports = c.exports?.length ? labeled("Key exports", await kvList(c.exports)) : "";
  const conns = c.connections?.length
    ? labeled("Connections", `<div class="conns">${(await Promise.all(c.connections.map(async (k) =>
        `<div class="conn"><span class="conn-dir">${escapeHtml(k.dir)}</span><span class="conn-body">${await mi(k.body)}</span></div>`))).join("")}</div>`)
    : "";
  return `<div class="subsection" id="${escapeHtml(c.id)}">${head}${detail}${diags}${code}${files}${exports}${conns}</div>`;
}

async function renderDepth(b: Extract<AtlasBlock, { type: "depth" }>, diagrams: Map<string, DiagramResult>): Promise<string> {
  const subs = (await Promise.all(b.components.map((c) => renderComponentDeep(c, diagrams)))).join("");
  return sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}${subs}`;
}

async function renderOwns(b: Extract<AtlasBlock, { type: "owns" }>): Promise<string> {
  return sectionHeader(b.title) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}${await kvList(b.rows)}` +
    `${b.note ? `<p class="diagram-caption">${await mi(b.note)}</p>` : ""}`;
}

async function renderSeams(b: Extract<AtlasBlock, { type: "seams" }>): Promise<string> {
  const exposes = b.exposes.map((e) =>
    `<li>${escapeHtml(e.api)}${e.note ? ` <span class="api-note">— ${escapeHtml(e.note)}</span>` : ""}</li>`).join("");
  const neighbors = b.depends.map((d) => {
    const inner = `${escapeHtml(d.name)} <span class="nc-path">${escapeHtml(d.path)}</span>`;
    return d.href
      ? `<a class="neighbor-chip" href="${escapeHtml(d.href)}">${inner}</a>`
      : `<span class="neighbor-chip is-flat">${inner}</span>`;
  }).join("");
  const note = b.note ? `<p class="diagram-caption" style="margin-top:14px;">${await mi(b.note)}</p>` : "";
  return sectionHeader(b.title) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="seam-cols">` +
    `<div class="seam-col seam-exposes"><div class="seam-head"><span aria-hidden="true">&#8593;</span> Exposes</div>` +
    `<div class="seam-body"><ul class="seam-api">${exposes}</ul></div></div>` +
    `<div class="seam-col seam-depends"><div class="seam-head"><span aria-hidden="true">&#8595;</span> Depends on</div>` +
    `<div class="seam-body"><div class="seam-neighbors">${neighbors}</div>${note}</div></div></div>`;
}

/** Dispatch one block to its renderer, wrapped in its <section>. */
export async function renderAtlasBlock(b: AtlasBlock, diagrams: Map<string, DiagramResult>, onWarn?: (m: string) => void): Promise<string> {
  const inner = await (async () => {
    switch (b.type) {
      case "atlas-tldr": return renderAtlasTldr(b);
      case "domain-map": return renderDomainMap(b);
      case "domain-index": return renderDomainIndex(b);
      case "domain-tldr": return renderDomainTldr(b);
      case "components": return renderComponents(b);
      case "diagram-section": return renderDiagramSection(b, diagrams);
      case "depth": return renderDepth(b, diagrams);
      case "owns": return renderOwns(b);
      case "seams": return renderSeams(b);
      default: onWarn?.(`atlas: no renderer for block type "${(b as AtlasBlock).type}"`); return "";
    }
  })();
  return `<section id="${escapeHtml(b.id)}" class="section">${inner}</section>`;
}

async function renderMain(blocks: AtlasBlock[], opts: { outDir?: string; excalidraw?: boolean; onWarn?: (m: string) => void }): Promise<string> {
  const rendered = await renderAll(collectAtlasDiagrams(blocks), { outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn });
  const diagrams = new Map<string, DiagramResult>();
  for (const r of rendered) diagrams.set(r.id, r);
  if (opts.onWarn) {
    const failed = rendered.filter((r) => r.failed).map((r) => r.id);
    if (failed.length) opts.onWarn(`${failed.length} diagram(s) failed to compile: ${failed.join(", ")} — fix their d2 source`);
  }
  const railHtml = rail(blocks);
  const parts: string[] = [];
  let railPlaced = false;
  for (const b of blocks) {
    parts.push(await renderAtlasBlock(b, diagrams, opts.onWarn));
    if (!railPlaced && (b.type === "atlas-tldr" || b.type === "domain-tldr")) { parts.push(railHtml); railPlaced = true; }
  }
  if (!railPlaced) parts.unshift(railHtml);
  return `<main class="main">${parts.join("")}</main>`;
}

export async function assembleAtlas(blocks: AtlasBlock[], opts: AtlasOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  if (opts.onWarn) for (const w of lintAtlas(blocks)) opts.onWarn(w); // demo-standard floor: lead / map / index
  const main = await renderMain(blocks, opts);
  return doc(opts.title, opts.generator, atlasTopbar(opts), sidebar(blocks, opts, null, true), main);
}

export async function assembleDomain(blocks: AtlasBlock[], opts: DomainOpts): Promise<string> {
  assertUniqueAtlasIds(blocks);
  if (opts.onWarn) for (const w of lintDomain(blocks)) opts.onWarn(w); // demo-standard floor: lead / components / arch / seams
  const main = await renderMain(blocks, opts);
  return doc(opts.title, opts.generator, domainTopbar(opts), sidebar(blocks, opts, opts.layer, false), main);
}
