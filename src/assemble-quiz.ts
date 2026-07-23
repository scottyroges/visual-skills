import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml } from "./html.js";
import { renderInlineMarkdown, renderMarkdown } from "./renderers/markdown.js";
import { renderProse } from "./renderers/prose.js";
import { renderAll, type DiagramResult } from "./render-diagram.js";
import { renderQuizQuestion } from "./renderers/quiz-question.js";
import { lintQuiz } from "./lint-quiz.js";
import {
  allBlockIds, allQuestions, assertUniqueQuizIds, collectQuizDiagrams,
  type QuizBlock, type QuizGroupBlock, type QuizQuestionBlock,
} from "./quiz-blocks.js";
import type { ProseBlock } from "./blocks.js";

export interface QuizOpts {
  title: string;
  source?: string;
  intro?: string;
  outDir?: string;
  excalidraw?: boolean;
  onWarn?: (msg: string) => void;
  generator?: string;
}

const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

function renderTopbar(opts: QuizOpts, qCount: number): string {
  return (
    `<header class="topbar" role="banner">` +
    `<button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation sidebar" aria-expanded="false">` +
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
    `<rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
    `<rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>` +
    `<rect x="2" y="11.5" width="12" height="1.5" rx="0.75" fill="currentColor"/></svg></button>` +
    `<span class="topbar-title">${escapeHtml(opts.title)}</span>` +
    `<div class="topbar-meta"><span class="chip chip-stat">${qCount} questions</span></div></header>`
  );
}

interface NavEntry { id: string; label: string; num: string; indent: boolean; }

/** One entry per navigable block; question numbering is continuous across groups. */
function navEntries(blocks: QuizBlock[]): NavEntry[] {
  const entries: NavEntry[] = [{ id: "tldr", label: "TL;DR", num: "—", indent: false }];
  let n = 0;
  const qEntry = (q: QuizQuestionBlock, indent: boolean): NavEntry => {
    n++;
    return { id: q.id, label: q.title ?? `Question ${n}`, num: String(n), indent };
  };
  for (const b of blocks) {
    if (b.type === "quiz-question") entries.push(qEntry(b, false));
    else if (b.type === "quiz-group") {
      entries.push({ id: b.id, label: b.title, num: "—", indent: false });
      for (const c of b.blocks) if (c.type === "quiz-question") entries.push(qEntry(c, true));
    } else {
      entries.push({ id: b.id, label: b.title ?? "Notes", num: "—", indent: false });
    }
  }
  return entries;
}

function renderSidebar(blocks: QuizBlock[]): string {
  const outline = navEntries(blocks)
    .map((e) =>
      `<li><a href="#${escapeHtml(e.id)}" class="outline-item" data-target="${escapeHtml(e.id)}"` +
      `${e.indent ? ` style="padding-left:28px;"` : ""}>` +
      `<span class="outline-num" aria-hidden="true">${e.num === "—" ? "&#8212;" : e.num}</span>` +
      `<span>${escapeHtml(e.label)}</span></a></li>`)
    .join("");
  return (
    `<nav class="sidebar" id="sidebar" aria-label="Document navigation">` +
    `<div class="sidebar-section"><span class="sidebar-label">Questions</span>` +
    `<ul class="outline-list" role="list">${outline}</ul></div></nav>`
  );
}

async function renderTldrFold(opts: QuizOpts, qs: QuizQuestionBlock[]): Promise<string> {
  const byFamily = new Map<string, number>();
  for (const q of qs) byFamily.set(q.family, (byFamily.get(q.family) ?? 0) + 1);
  const famLabel: Record<string, string> = { "system-fit": "system fit", rationale: "rationale", mechanism: "mechanism" };
  const mix = [...byFamily.entries()].map(([f, c]) => `${c} ${famLabel[f] ?? f}`).join(" · ");
  const rows: { key: string; value: string }[] = [];
  if (opts.source) rows.push({ key: "Source", value: opts.source });
  rows.push({ key: "Questions", value: `${qs.length} questions${mix ? ` — ${mix}` : ""}` });
  rows.push({ key: "How", value: "Answer each in your head (or aloud) **before** revealing; a hand-wave is a miss." });
  const rowsHtml = (await Promise.all(rows.map(async (r) =>
    `<div class="tldr-row"><span class="tldr-key">${escapeHtml(r.key)}</span>` +
    `<span class="tldr-val">${await renderInlineMarkdown(r.value)}</span></div>`))).join("");
  const intro = opts.intro
    ? `<div class="quiz-intro">${await renderMarkdown(opts.intro, opts.onWarn)}</div>` : "";
  return (
    `<section id="tldr" class="section"><div class="tldr-card">` +
    `<div class="tldr-header"><span class="tldr-eyebrow">Quiz</span>` +
    `<h2 class="tldr-heading">Prove you got it — before you act on it</h2></div>` +
    `<div class="tldr-rows">${rowsHtml}</div></div>${intro}</section>`
  );
}

async function renderGroup(
  g: QuizGroupBlock, num: () => string, ids: Set<string>,
  diagrams: Map<string, DiagramResult>, opts: QuizOpts,
): Promise<string> {
  const desc = g.description
    ? `<p class="quiz-group-desc">${await renderInlineMarkdown(g.description)}</p>` : "";
  const children = await Promise.all(g.blocks.map(async (c) =>
    c.type === "quiz-question"
      ? renderQuizQuestion(c, { num: num(), ids, diagrams, onWarn: opts.onWarn })
      : renderProseWithAnchor(c, opts)));
  return (
    `<section id="${escapeHtml(g.id)}" class="section">` +
    `<div class="section-header"><h2 class="section-title">${escapeHtml(g.title)}</h2></div>` +
    `${desc}${children.join("")}</section>`
  );
}

async function renderProseWithAnchor(b: ProseBlock, opts: QuizOpts): Promise<string> {
  return `<div id="${escapeHtml(b.id)}">${await renderProse(b, opts.onWarn)}</div>`;
}

export async function assembleQuiz(blocks: QuizBlock[], opts: QuizOpts): Promise<string> {
  assertUniqueQuizIds(blocks);
  const css = await readFile(join(ASSETS, "review.css"), "utf8");
  const specCss = await readFile(join(ASSETS, "spec.css"), "utf8");
  const quizCss = await readFile(join(ASSETS, "quiz.css"), "utf8");
  const viewer = await readFile(join(ASSETS, "review-viewer.js"), "utf8");

  const rendered = await renderAll(collectQuizDiagrams(blocks), {
    outDir: opts.outDir, excalidraw: opts.excalidraw, onWarn: opts.onWarn,
  });
  const diagrams = new Map<string, DiagramResult>();
  for (const r of rendered) diagrams.set(r.id, r);
  if (opts.onWarn) {
    for (const w of lintQuiz(blocks)) opts.onWarn(w);
    const failed = rendered.filter((r) => r.failed).map((r) => r.id);
    if (failed.length) opts.onWarn(`${failed.length} diagram(s) failed to compile: ${failed.join(", ")} — fix their d2 source`);
  }

  const qs = allQuestions(blocks);
  const ids = allBlockIds(blocks);
  let n = 0;
  const num = () => String(++n);

  const parts: string[] = [await renderTldrFold(opts, qs)];
  for (const b of blocks) {
    if (b.type === "quiz-question")
      parts.push(`<section class="section">${await renderQuizQuestion(b, { num: num(), ids, diagrams, onWarn: opts.onWarn })}</section>`);
    else if (b.type === "quiz-group") parts.push(await renderGroup(b, num, ids, diagrams, opts));
    else parts.push(`<section class="section">${await renderProseWithAnchor(b, opts)}</section>`);
  }
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
    `${opts.generator ? `<meta name="generator" content="${escapeHtml(opts.generator)}">` : ""}` +
    `<title>${escapeHtml(opts.title)}</title><style>${css}\n${specCss}\n${quizCss}</style></head>` +
    `<body>${renderTopbar(opts, qs.length)}<div class="sidebar-overlay" id="sidebar-overlay"></div>` +
    `<div class="layout">${renderSidebar(blocks)}${main}</div>${zoomOverlay}` +
    `<script>${viewer}</script></body></html>\n`
  );
}
