import { escapeHtml } from "../html.js";
import { renderMarkdown, renderInlineMarkdown } from "./markdown.js";
import { normalizeExample, type ExampleBlock, type ExampleStage } from "../blocks.js";

export interface RenderExampleOpts { ownHeader: boolean; onWarn?: (m: string) => void; }

const KIND_LABEL: Record<NonNullable<ExampleStage["kind"]>, string> =
  { input: "Input", step: "Step", output: "Output", counter: "Counter" };

const MISSING = (msg: string) => `<div class="vs-ex-missing">&#9888; ${msg}</div>`;

async function renderStage(s: ExampleStage, onWarn?: (m: string) => void): Promise<string> {
  const kind = s.kind ?? "step";
  const label = s.label.trim() ? escapeHtml(s.label) : "&#9888; unlabeled stage";
  const body = s.body.trim()
    ? await renderMarkdown(s.body, onWarn)
    : MISSING("empty stage");
  const note = s.note ? `<p class="vs-ex-note">${await renderInlineMarkdown(s.note)}</p>` : "";
  return (
    `<div class="vs-ex-stage" data-kind="${kind}">` +
    `<div class="vs-ex-stage-h"><span class="vs-ex-kind">${KIND_LABEL[kind]}</span>${label}</div>` +
    `<div class="vs-ex-stage-body">${body}</div>${note}</div>`
  );
}

/** Wrap a reveal-flagged stage in <details>; review-viewer's hash-open walker opens these. */
async function stageOrReveal(s: ExampleStage, revealMode: boolean, onWarn?: (m: string) => void): Promise<string> {
  const inner = await renderStage(s, onWarn);
  if (!revealMode || !s.reveal) return inner;
  const hint = s.label.trim() ? escapeHtml(s.label) : "this stage";
  return `<details class="vs-ex-reveal"><summary>Show: ${hint}</summary>${inner}</details>`;
}

async function renderRail(b: ExampleBlock, onWarn?: (m: string) => void): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < b.stages.length; i++) {
    if (i > 0) parts.push(`<div class="vs-ex-arrow" aria-hidden="true">&darr;</div>`);
    parts.push(await stageOrReveal(b.stages[i], b.mode === "reveal", onWarn));
  }
  return `<div class="vs-ex-rail">${parts.join("")}</div>`;
}

async function renderContrast(b: ExampleBlock, onWarn?: (m: string) => void): Promise<string> {
  const shared = b.stages.filter((s) => !s.side);
  const col = async (side: "a" | "b", header: string) => {
    const stages = b.stages.filter((s) => s.side === side);
    const body = stages.length
      ? (await Promise.all(stages.map((s) => stageOrReveal(s, b.mode === "reveal", onWarn)))).join("")
      : MISSING("empty column");
    return `<div class="vs-ex-col" data-side="${side}"><div class="vs-ex-col-h">${escapeHtml(header)}</div>${body}</div>`;
  };
  const sharedHtml = (await Promise.all(shared.map((s) => stageOrReveal(s, b.mode === "reveal", onWarn)))).join("");
  const [ha, hb] = b.columns ?? ["Before", "After"];
  return `<div class="vs-ex-rail">${sharedHtml}</div><div class="vs-ex-cols">${await col("a", ha)}${await col("b", hb)}</div>`;
}

async function renderStepped(b: ExampleBlock, onWarn?: (m: string) => void): Promise<string> {
  const name = `ex-${b.id}`;
  const n = b.stages.length;
  const radios = b.stages.map((s, i) =>
    `<input class="vs-ex-radio" type="radio" name="${escapeHtml(name)}" id="${escapeHtml(b.id)}--${i + 1}"` +
    ` aria-label="Stage ${i + 1} of ${n}: ${escapeHtml(s.label.trim() || "unlabeled")}"${i === 0 ? " checked" : ""}>`,
  ).join("");
  const allRadio =
    `<input class="vs-ex-radio is-all" type="radio" name="${escapeHtml(name)}" id="${escapeHtml(b.id)}--all"` +
    ` aria-label="Show all stages">`;
  const labels = b.stages.map((_, i) => `<label for="${escapeHtml(b.id)}--${i + 1}">${i + 1}</label>`).join("");
  const allLabel = `<label for="${escapeHtml(b.id)}--all">All</label>`;
  const stagesHtml = (await Promise.all(b.stages.map((s) => renderStage(s, onWarn)))).join("");
  // Fieldset wraps radios, labels, AND the rail: the :checked ~ selectors need the radios as
  // preceding siblings of the rail, and the group name must cover the whole switcher.
  return (
    `<fieldset class="vs-ex-stepper"><legend class="vs-ex-srlegend">Walkthrough stages</legend>` +
    `${radios}${allRadio}<div class="vs-ex-steps">${labels}${allLabel}</div>` +
    `<div class="vs-ex-rail">${stagesHtml}</div></fieldset>`
  );
}

export async function renderExample(raw: ExampleBlock, opts: RenderExampleOpts): Promise<string> {
  const { block: b, problems } = normalizeExample(raw);
  for (const p of problems) opts.onWarn?.(p);

  const head = opts.ownHeader
    ? `<div class="vs-ex-head"><h2 class="vs-ex-title">${escapeHtml(b.title)}</h2>` +
      `${b.badge ? `<span class="vs-ex-badge">${escapeHtml(b.badge)}</span>` : ""}</div>`
    : "";
  const intro = b.intro ? `<p class="vs-ex-intro">${await renderInlineMarkdown(b.intro)}</p>` : "";
  const source = b.source.trim()
    ? `<p class="vs-ex-src"><span class="vs-ex-src-tag">source</span>${escapeHtml(b.source)}</p>`
    : `<p class="vs-ex-src is-missing">&#9888; no source given</p>`;
  const lesson = b.lesson.trim()
    ? `<div class="vs-ex-lesson"><span class="vs-ex-lesson-tag">Lesson</span>${await renderInlineMarkdown(b.lesson)}</div>`
    : `<div class="vs-ex-lesson is-missing">&#9888; no lesson written</div>`;

  let bodyHtml: string;
  if (!b.stages.length) bodyHtml = MISSING("no stages");
  else if (b.variant === "contrast") bodyHtml = await renderContrast(b, opts.onWarn);
  else if (b.mode === "step") bodyHtml = await renderStepped(b, opts.onWarn);
  else bodyHtml = await renderRail(b, opts.onWarn);

  const stepCls = b.mode === "step" && b.variant === "walkthrough" && b.stages.length ? " is-step" : "";
  return `<div class="vs-example${stepCls}">${head}${intro}${source}${bodyHtml}${lesson}</div>`;
}
