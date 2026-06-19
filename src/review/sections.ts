import { basename } from "node:path";
import type {
  ApiBlock,
  DiagramBlock,
  SchemaBlock,
  ProseBlock,
  QuestionsBlock,
  AnnotatedCodeBlock,
  Block,
} from "../blocks.js";
import { escapeHtml } from "../html.js";
import { PALETTE, ROLE_LABELS, rolesInSource, type ColorRole } from "../diagram-colors.js";
import type { DiagramResult } from "../render-diagram.js";
import { renderProse } from "../renderers/prose.js";
import { renderQuestions } from "../renderers/questions.js";
import { renderAnnotatedCode } from "../renderers/annotated-code.js";

/** The d2 binary's root <svg> carries no class, but the zoom overlay binds only to
 *  `svg.diagram-svg`. Inject the class so click-to-enlarge works. */
export function withDiagramSvgClass(svg: string): string {
  // Operate on the FIRST <svg ...> tag only (the d2 root wraps an inner <svg class="d2-...">;
  // the zoom binding must find `diagram-svg` on the root, not the nested element).
  const m = svg.match(/<svg\b[^>]*>/);
  if (!m) return svg;
  const tag = m[0];
  const replaced = /\sclass=["']/.test(tag)
    ? tag.replace(/(\sclass=["'])/, "$1diagram-svg ")
    : tag.replace(/<svg\b/, '<svg class="diagram-svg"');
  return svg.replace(tag, replaced);
}

/** Self-contained legend with inline-sized swatches — renders without any vs- CSS. */
export function renderReviewLegend(roles: ColorRole[]): string {
  if (!roles.length) return "";
  const items = roles.map((r) => {
    const { fill, stroke } = PALETTE[r];
    return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;font-size:var(--text-xs);color:var(--ink-muted);">` +
      `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${fill};border:1px solid ${stroke};"></span>` +
      `${escapeHtml(ROLE_LABELS[r])}</span>`;
  }).join("");
  return `<p class="diagram-caption">${items}</p>`;
}

/** Zoomable diagram card matching the mockup's `.diagram-wrap` vocabulary. */
export function renderDiagramCard(b: DiagramBlock | SchemaBlock, r: DiagramResult): string {
  const mermaid = "mermaid" in b ? b.mermaid : undefined;
  const legend = renderReviewLegend(rolesInSource(b.d2, mermaid));
  const editLink = r.editable
    ? `<p class="diagram-caption"><a href="${escapeHtml(basename(r.editable))}">Open in Excalidraw to edit</a></p>`
    : "";
  return (
    `<div class="diagram-wrap">` +
    `<p class="diagram-title">${escapeHtml(b.title)}</p>` +
    `<div class="diagram-box"><button class="diagram-enlarge" type="button" aria-label="Enlarge diagram">&#x2922; Enlarge</button>${withDiagramSvgClass(r.svg)}</div>` +
    `${legend}` +
    `${editLink}` +
    `</div>`
  );
}

const API_TYPE: Record<NonNullable<import("../blocks.js").ApiProcedure["change"]>, { label: string; style: string }> = {
  added: { label: "&#43; NEW", style: "" },
  changed: { label: "~ CHANGED", style: ` style="color:var(--change);background:var(--change-bg);border-color:var(--change-border);"` },
  removed: { label: "&#8722; REMOVED", style: ` style="color:var(--remove);background:var(--remove-bg);border-color:var(--remove-border);"` },
};

/** One `.api-surface` card per procedure, matching the mockup. */
export function renderApiSurface(block: ApiBlock): string {
  return block.procedures.map((p) => {
    const badge = p.change
      ? `<span class="api-type"${API_TYPE[p.change].style}>${API_TYPE[p.change].label}</span>`
      : "";
    const codeBlock = p.input
      ? `<div class="code-block"><pre>${escapeHtml(p.input)}</pre></div>`
      : "";
    return (
      `<div class="api-surface">` +
      `<div class="api-surface-header">` +
      `<span class="api-name">${escapeHtml(p.name)}</span>` +
      `${badge}` +
      `<span class="chip chip-stat" style="margin-left:auto;">${escapeHtml(`${p.auth} ${p.kind}`)}</span>` +
      `</div>` +
      `${codeBlock}` +
      `</div>`
    );
  }).join("");
}

/** Functional fallback for the rarely-seen reused blocks (readable via base typography). */
export async function renderReusedBlock(
  b: ProseBlock | QuestionsBlock | AnnotatedCodeBlock | Block,
  onWarn?: (msg: string) => void,
): Promise<string> {
  switch (b.type) {
    case "prose": return await renderProse(b, onWarn);
    case "questions": return renderQuestions(b);
    case "annotated-code": return await renderAnnotatedCode(b, onWarn);
    default: return "";
  }
}
