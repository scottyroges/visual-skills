import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html.js";
import { renderInlineMarkdown, renderMarkdown } from "./renderers/markdown.js";
import { renderAll, type DiagramResult } from "./render-diagram.js";
import { renderDiagramCard } from "./review/sections.js";
import { lintSpec } from "./lint-spec.js";
import {
  assertUniqueSpecIds, collectSpecDiagrams, toDiagramBlock, isChapter, chapterLabel,
  type SpecBlock, type TldrBlock, type SpecDiagramBlock, type ComponentsBlock, type FitsBlock,
  type DecisionsBlock, type ScopeBlock, type RolloutBlock, type DoneBlock, type RisksBlock,
  type ApproveBlock, type ReferenceBlock, type SpecProseBlock,
} from "./spec-blocks.js";

export interface SpecOpts {
  title: string;
  phase?: string;
  status?: string;
  date?: string;
  complexity?: string;
  related?: { kind: string; value: string }[];
  meta?: { key: string; value: string }[];
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
  generator?: string;
}

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));
const mi = (s: string) => renderInlineMarkdown(s);
const CHEVRON =
  `<svg class="ref-chev" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function sectionHeader(title: string, badge?: string): string {
  return (
    `<div class="section-header"><h2 class="section-title">${escapeHtml(title)}</h2>` +
    `${badge ? `<span class="section-badge">${escapeHtml(badge)}</span>` : ""}</div>`
  );
}

function renderTopbar(opts: SpecOpts): string {
  const chips: string[] = [];
  if (opts.phase) chips.push(`<span class="chip chip-phase">${escapeHtml(opts.phase)}</span>`);
  if (opts.status) chips.push(`<span class="chip chip-status">${escapeHtml(opts.status)}</span>`);
  if ((opts.phase || opts.status) && (opts.date || opts.complexity))
    chips.push(`<span class="topbar-sep" aria-hidden="true"></span>`);
  if (opts.date) chips.push(`<span class="chip chip-stat">${escapeHtml(opts.date)}</span>`);
  if (opts.complexity) chips.push(`<span class="chip chip-complexity">${escapeHtml(opts.complexity)}</span>`);
  return (
    `<header class="topbar" role="banner">` +
    `<button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation sidebar" aria-expanded="false">` +
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
    `<rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
    `<rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
    `<rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg></button>` +
    `<span class="topbar-title">${escapeHtml(opts.title)}</span>` +
    `<div class="topbar-meta">${chips.join("")}</div></header>`
  );
}

/** Warn (don't crash) on malformed page-level options — the easy shapes to get wrong. */
function validateSpecOpts(opts: SpecOpts, warn: (m: string) => void): void {
  (opts.related ?? []).forEach((r, i) => {
    const o = r as Record<string, unknown>;
    if (!o || (o.kind === undefined && o.value === undefined))
      warn(`related[${i}] should be { kind, value } (plain strings) — got keys [${o ? Object.keys(o).join(", ") : "—"}]; entry ignored`);
  });
  (opts.meta ?? []).forEach((m, i) => {
    const o = m as Record<string, unknown>;
    if (!o || (o.key === undefined && o.value === undefined))
      warn(`meta[${i}] should be { key, value } (plain strings) — got keys [${o ? Object.keys(o).join(", ") : "—"}]; entry ignored`);
  });
}

interface NavEntry { id: string; label: string; num: string; }
function navEntries(blocks: SpecBlock[]): NavEntry[] {
  let n = 0;
  return blocks.map((b) => {
    if (isChapter(b)) return { id: b.id, label: chapterLabel(b), num: String(++n) };
    const label = b.type === "tldr" ? "TL;DR & the big idea" : "Reference (drill-down)";
    return { id: b.id, label, num: "—" };
  });
}

function renderSidebar(blocks: SpecBlock[], opts: SpecOpts): string {
  const sections: string[] = [];
  const outline = navEntries(blocks)
    .map((e) =>
      `<li><a href="#${escapeHtml(e.id)}" class="outline-item" data-target="${escapeHtml(e.id)}">` +
      `<span class="outline-num" aria-hidden="true">${e.num === "—" ? "&#8212;" : e.num}</span>` +
      `<span>${escapeHtml(e.label)}</span></a></li>`)
    .join("");
  sections.push(
    `<div class="sidebar-section"><span class="sidebar-label">Contents</span>` +
    `<ul class="outline-list" role="list">${outline}</ul></div>`);

  // Tolerant of malformed page options: coerce + drop empties so a wrong shape degrades to a
  // (warned) skip rather than crashing escapeHtml. validateSpecOpts() surfaces the mistake.
  const related = (opts.related ?? [])
    .map((r) => ({ kind: String(r?.kind ?? ""), value: String(r?.value ?? "") }))
    .filter((r) => r.kind || r.value);
  if (related.length) {
    const items = related
      .map((r) => `<li><span class="rk">${escapeHtml(r.kind)}</span><br><span class="rv">${escapeHtml(r.value)}</span></li>`)
      .join("");
    sections.push(
      `<div class="sidebar-section"><span class="sidebar-label">Related</span>` +
      `<ul class="related-list" role="list">${items}</ul></div>`);
  }
  const meta = (opts.meta ?? [])
    .map((m) => ({ key: String(m?.key ?? ""), value: String(m?.value ?? "") }))
    .filter((m) => m.key || m.value);
  if (meta.length) {
    const rows = meta
      .map((m) => `<div class="meta-row"><span class="mk">${escapeHtml(m.key)}</span><span class="mv">${escapeHtml(m.value)}</span></div>`)
      .join("");
    sections.push(
      `<div class="sidebar-section"><span class="sidebar-label">Meta</span>` +
      `<div class="meta-list">${rows}</div></div>`);
  }
  return `<nav class="sidebar" id="sidebar" aria-label="Document navigation">${sections.join("")}</nav>`;
}

function renderRail(blocks: SpecBlock[]): string {
  const chapters = navEntries(blocks).filter((e) => e.num !== "—");
  if (!chapters.length) return "";
  const steps = chapters
    .map((e, i) =>
      `<a class="progress-step${i === 0 ? " is-active" : ""}" href="#${escapeHtml(e.id)}">` +
      `<div class="progress-step-num" aria-hidden="true">${escapeHtml(e.num)}</div>` +
      `<span class="progress-step-label">${escapeHtml(e.label)}</span></a>`)
    .join("");
  return `<nav class="progress-rail" aria-label="Jump to section">${steps}</nav>`;
}

// ---- per-block section renderers ----

async function renderTldr(b: TldrBlock): Promise<string> {
  const rows = (await Promise.all(b.rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span>` +
    `<span class="tldr-val">${await mi(r.value)}</span></div>`))).join("");
  const card =
    `<div class="tldr-card"><div class="tldr-header"><span class="tldr-eyebrow">TL;DR</span>` +
    `<h2 class="tldr-heading">${await mi(b.heading)}</h2></div>` +
    `<div class="tldr-rows">${rows}</div></div>`;
  const big = b.bigIdea
    ? `<div class="bigidea"><div class="bigidea-label">${escapeHtml(b.bigIdea.label ?? "The big idea")}</div>` +
      `<div class="bigidea-line">${await mi(b.bigIdea.line)}</div>` +
      `${b.bigIdea.sub ? `<p class="bigidea-sub">${await mi(b.bigIdea.sub)}</p>` : ""}</div>`
    : "";
  return card + big;
}

async function renderDiagramSection(b: SpecDiagramBlock, diagrams: Map<string, DiagramResult>): Promise<string> {
  const r = diagrams.get(b.id);
  const head = b.sectionTitle ? sectionHeader(b.sectionTitle, b.badge) : "";
  const intro = b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : "";
  const card = r ? renderDiagramCard(toDiagramBlock(b), r) : "";
  return head + intro + card;
}

async function renderComponents(b: ComponentsBlock): Promise<string> {
  let anat = "";
  if (b.anatomy) {
    const a = b.anatomy;
    const panel = async (side: { title: string; desc: string; eg?: string }, cls: string) =>
      `<div class="anatomy-panel ${cls}"><div class="anatomy-h"><span>&#9632;</span> ${escapeHtml(side.title)}</div>` +
      `<div class="anatomy-desc">${await mi(side.desc)}</div>` +
      `${side.eg ? `<div class="anatomy-eg">${await mi(side.eg)}</div>` : ""}</div>`;
    anat =
      `<div class="anatomy">${await panel(a.left, "anatomy-factual")}` +
      `<div class="anatomy-mid"><div class="anatomy-arrow" aria-hidden="true">&rarr;</div>` +
      `<div class="anatomy-fn">${escapeHtml(a.mid.fn)}</div></div>` +
      `${await panel(a.right, "anatomy-perceived")}</div>` +
      `${a.caption ? `<p class="anatomy-caption">${await mi(a.caption)}</p>` : ""}`;
  }
  const cards = (await Promise.all(b.cards.map(async (c) => {
    const skills = (c.skills ?? [])
      .map((s) => `<span class="skill-chip${s.deputy ? " is-deputy" : ""}">${escapeHtml(s.name)}</span>`)
      .join("");
    const skillRow = skills ? `<div class="board-row"><span class="board-row-label">skill</span>${skills}</div>` : "";
    const split = c.split
      ? `<span class="split-badge"><span class="sb-fact">${escapeHtml(c.split.fact)}</span>` +
        `<span class="sb-perc">${escapeHtml(c.split.perc)}</span></span>`
      : "";
    const fieldLine = (tag: string, cls: string, names?: string[]) =>
      names?.length
        ? `<div class="field-line ${cls}"><span class="field-tag">${tag}</span>` +
          `<span class="field-names">${escapeHtml(names.join(", "))}</span></div>`
        : "";
    const fields = c.fields
      ? `<div class="board-fields">${fieldLine("F", "field-fact", c.fields.fact)}${fieldLine("P", "field-perc", c.fields.perc)}</div>`
      : "";
    return (
      `<div class="board-card"><div class="board-name">${escapeHtml(c.name)}</div>` +
      `<div class="board-purpose">${await mi(c.purpose)}</div>${skillRow}${split}${fields}</div>`
    );
  }))).join("");
  return (
    sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    anat +
    `<div class="board-grid">${cards}</div>` +
    `${b.note ? `<p class="anatomy-caption" style="margin-top:14px;">${await mi(b.note)}</p>` : ""}`
  );
}

async function renderFits(b: FitsBlock): Promise<string> {
  const nodes: string[] = [];
  for (let i = 0; i < b.chain.length; i++) {
    const c = b.chain[i];
    nodes.push(
      `<div class="fits-node${c.isThis ? " is-this" : ""}"><div class="fits-role">${escapeHtml(c.role)}</div>` +
      `<div class="fits-title">${escapeHtml(c.title)}</div>` +
      `<div class="fits-desc">${await mi(c.desc)}</div></div>`);
    if (i < b.chain.length - 1) nodes.push(`<div class="fits-arrow" aria-hidden="true"><span>&rarr;</span></div>`);
  }
  const stack = b.stack?.length
    ? `<div class="layer-stack">${b.stack.map((s) =>
        `<div class="layer is-${s.kind}"><span class="layer-tag">${escapeHtml(s.tag)}</span>` +
        `<span class="layer-label">${escapeHtml(s.label)}</span>` +
        `<span class="layer-note">${escapeHtml(s.note)}</span></div>`).join("")}</div>`
    : "";
  return (
    sectionHeader(b.title ?? "Where it fits") +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="fits-chain">${nodes.join("")}</div>${stack}`
  );
}

async function renderDecisions(b: DecisionsBlock): Promise<string> {
  const cards = (await Promise.all(b.decisions.map(async (d, i) =>
    `<div class="decision-card"><span class="decision-num">${i + 1}</span><div>` +
    `<div class="decision-q">${await mi(d.q)}</div>` +
    `<div class="decision-a">${await mi(d.a)}</div>` +
    `${d.why ? `<div class="decision-why">${await mi(d.why)}</div>` : ""}` +
    `${d.rejected ? `<div class="decision-alt"><span class="decision-alt-tag">Rejected</span>${await mi(d.rejected)}</div>` : ""}` +
    `</div></div>`))).join("");
  return (
    sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="decision-grid">${cards}</div>`
  );
}

async function renderScope(b: ScopeBlock): Promise<string> {
  const inItems = (await Promise.all(b.inList.map(async (t) =>
    `<li><span class="scope-marker">&#10003;</span><span>${await mi(t)}</span></li>`))).join("");
  const outItems = (await Promise.all(b.outList.map(async (o) =>
    `<li><span class="scope-marker">&times;</span><span>${await mi(o.text)}` +
    `${o.defer ? ` <span class="defer">&rarr; ${escapeHtml(o.defer)}</span>` : ""}</span></li>`))).join("");
  return (
    sectionHeader(b.title ?? "Scope") +
    `<div class="scope-cols">` +
    `<div class="scope-col scope-in"><div class="scope-head">${escapeHtml(b.inTitle ?? "In scope")} ` +
    `<span class="scope-count">&#183; ${b.inList.length} goals</span></div>` +
    `<ul class="scope-list">${inItems}</ul></div>` +
    `<div class="scope-col scope-out"><div class="scope-head">${escapeHtml(b.outTitle ?? "Out of scope")} ` +
    `<span class="scope-count">&#183; anti-goals</span></div>` +
    `<ul class="scope-list">${outItems}</ul></div></div>`
  );
}

async function renderRollout(b: RolloutBlock): Promise<string> {
  const phases = (await Promise.all(b.phases.map(async (p) => {
    const gate = (await Promise.all(p.gate.map(async (g) =>
      `<li><span class="gate-check">&#10003;</span>${await mi(g)}</li>`))).join("");
    return (
      `<div class="phase"><div class="phase-head"><span class="phase-tag">${escapeHtml(p.tag)}</span>` +
      `<span class="phase-title">${escapeHtml(p.title)}</span></div>` +
      `<div class="phase-body"><div class="phase-scope"><div class="phase-sub">Scope</div>` +
      `<p>${await mi(p.scope)}</p></div>` +
      `<div class="phase-gate"><div class="phase-sub">Acceptance gate</div>` +
      `<ul class="gate-list">${gate}</ul></div></div></div>`
    );
  }))).join("");
  return (
    sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="phases">${phases}</div>`
  );
}

async function renderDone(b: DoneBlock): Promise<string> {
  const movers = b.movers?.length
    ? `<div class="movers">${b.movers.map((m) =>
        `<div class="mover"><div class="mover-name">${escapeHtml(m.name)}</div>` +
        `<div class="mover-vals"><span class="mover-now">now <s>${escapeHtml(m.now)}</s></span>` +
        `<span class="mover-arrow">&rarr;</span><span class="mover-target">${escapeHtml(m.target)}</span></div>` +
        `${m.label ? `<div class="mover-label">${escapeHtml(m.label)}</div>` : ""}</div>`).join("")}</div>`
    : "";
  let table = "";
  if (b.table) {
    const head = `<thead><tr>${b.table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
    const rows = (await Promise.all(b.table.rows.map(async (row) => {
      const cells = (await Promise.all(row.cells.map(async (c, ci) => {
        const good = (row.goodCols ?? []).includes(ci);
        return `<td${good ? ` class="num good"` : ""}>${await mi(c)}</td>`;
      }))).join("");
      return `<tr>${cells}</tr>`;
    }))).join("");
    table = `<table class="spec-table">${head}<tbody>${rows}</tbody></table>`;
  }
  return (
    sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    movers + table +
    `${b.note ? `<p class="tbl-note">${await mi(b.note)}</p>` : ""}`
  );
}

async function renderRisks(b: RisksBlock): Promise<string> {
  const cards = (await Promise.all(b.risks.map(async (r) =>
    `<div class="risk-card"><div class="risk-r"><span class="risk-icon">&#9888;</span>` +
    `<span>${await mi(r.risk)}</span></div>` +
    `<div class="risk-m"><b>Mitigation:</b> ${await mi(r.mitigation)}</div></div>`))).join("");
  return (
    sectionHeader(b.title) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="risk-grid">${cards}</div>`
  );
}

async function renderApprove(b: ApproveBlock): Promise<string> {
  const openNote = b.open.note ? `${await mi(b.open.note)}` : "";
  const open = openNote + `<ol class="approve-q">${(await Promise.all(b.open.questions.map(async (q) => `<li>${await mi(q)}</li>`))).join("")}</ol>`;
  return (
    sectionHeader(b.title, b.badge) +
    `${b.intro ? `<p class="section-intro">${await mi(b.intro)}</p>` : ""}` +
    `<div class="approve-grid">` +
    `<div class="approve-card commit"><div class="approve-head"><span aria-hidden="true">&#9634;</span> ${escapeHtml(b.commit.title ?? "What you're approving")}</div>` +
    `<div class="approve-body">${await mi(b.commit.body)}</div></div>` +
    `<div class="approve-card scrutinize"><div class="approve-head"><span aria-hidden="true">&#9888;</span> ${escapeHtml(b.scrutinize.title ?? "Scrutinize hardest")}</div>` +
    `<div class="approve-body">${await mi(b.scrutinize.body)}</div></div>` +
    `<div class="approve-card open"><div class="approve-head"><span aria-hidden="true">&#9711;</span> ${escapeHtml(b.open.title ?? "Still open — non-blocking")}</div>` +
    `<div class="approve-body">${open}</div></div></div>`
  );
}

async function renderReference(b: ReferenceBlock, onWarn?: (m: string) => void): Promise<string> {
  const items = (await Promise.all(b.items.map(async (it) => {
    const body = it.html ?? (it.markdown ? await renderMarkdown(it.markdown, onWarn) : "");
    const tally = it.tally ? `<span class="ref-tally">${escapeHtml(it.tally)}</span>` : "";
    return (
      `<details class="ref" id="${escapeHtml(it.id)}">` +
      `<summary>${CHEVRON}${await mi(it.summary)}${tally}</summary>` +
      `<div class="ref-body">${body}</div></details>`
    );
  }))).join("");
  return (
    sectionHeader(b.title ?? "Reference", "drill-down") +
    `${b.intro ? `<p class="ref-intro">${await mi(b.intro)}</p>` : ""}${items}`
  );
}

async function renderProse(b: SpecProseBlock, onWarn?: (m: string) => void): Promise<string> {
  return (b.title ? sectionHeader(b.title) : "") + (await renderMarkdown(b.markdown, onWarn));
}

async function renderBlock(
  b: SpecBlock, diagrams: Map<string, DiagramResult>, opts: SpecOpts,
): Promise<string> {
  const inner = await (async () => {
    switch (b.type) {
      case "tldr": return renderTldr(b);
      case "diagram": return renderDiagramSection(b, diagrams);
      case "components": return renderComponents(b);
      case "fits": return renderFits(b);
      case "decisions": return renderDecisions(b);
      case "scope": return renderScope(b);
      case "rollout": return renderRollout(b);
      case "done": return renderDone(b);
      case "risks": return renderRisks(b);
      case "approve": return renderApprove(b);
      case "reference": return renderReference(b, opts.onWarn);
      case "spec-prose": return renderProse(b, opts.onWarn);
      default: {
        opts.onWarn?.(`spec: no renderer for block type "${(b as SpecBlock).type}"`);
        return "";
      }
    }
  })();
  return `<section id="${escapeHtml(b.id)}" class="section">${inner}</section>`;
}

export async function assembleSpec(blocks: SpecBlock[], opts: SpecOpts): Promise<string> {
  assertUniqueSpecIds(blocks);
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const specCss = await readFile(join(ASSETS, "spec.css"), "utf8");
  const themeCss = await readFile(join(ASSETS, "theme.css"), "utf8");
  const themeHead = await readFile(join(ASSETS, "theme-head.js"), "utf8");
  const themeToggle = await readFile(join(ASSETS, "theme-toggle.js"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");

  const diagramBlocks = collectSpecDiagrams(blocks);
  const rendered = await renderAll(diagramBlocks, {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const diagrams = new Map<string, DiagramResult>();
  for (const r of rendered) diagrams.set(r.id, r);
  if (opts.onWarn) {
    validateSpecOpts(opts, opts.onWarn);                 // friendly warning on malformed related/meta (vs a crash)
    for (const w of lintSpec(blocks)) opts.onWarn(w);   // demo-standard floor: lead / decisions / scope / size-scaled surfaces
    const failed = rendered.filter((r) => r.failed).map((r) => r.id);
    if (failed.length) opts.onWarn(`${failed.length} diagram(s) failed to compile: ${failed.join(", ")} — fix their d2 source`);
  }

  const topbar = renderTopbar(opts);
  const sidebar = renderSidebar(blocks, opts);
  const rail = renderRail(blocks);

  // Place the progress rail right after the TL;DR (or at the top when there is none).
  const parts: string[] = [];
  let railPlaced = false;
  for (const b of blocks) {
    parts.push(await renderBlock(b, diagrams, opts));
    if (!railPlaced && b.type === "tldr") { parts.push(rail); railPlaced = true; }
  }
  if (!railPlaced) parts.unshift(rail);
  const main = `<main class="main">${parts.join("")}</main>`;

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
    `<title>${escapeHtml(opts.title)}</title><style>${css}\n${specCss}\n${themeCss}</style></head>` +
    `<body>${topbar}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${sidebar}${main}</div>${zoomOverlay}` +
    `<script>${viewer}</script><script>${themeToggle}</script></body></html>\n`
  );
}
