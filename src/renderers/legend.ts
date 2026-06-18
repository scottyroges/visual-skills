import { escapeHtml } from "../html.js";
import { PALETTE, ROLE_LABELS, type ColorRole } from "../diagram-colors.js";

/** Render a compact color legend for the roles a diagram uses. Empty string when none.
 *  Swatch colors are trusted palette data (never user input), so inline style is safe. */
export function renderLegend(roles: ColorRole[]): string {
  if (!roles.length) return "";
  const items = roles
    .map((r) => {
      const { fill, stroke } = PALETTE[r];
      return (
        `<li class="vs-legend-item">` +
        `<span class="vs-legend-swatch" style="background:${fill};border-color:${stroke}"></span>` +
        `${escapeHtml(ROLE_LABELS[r])}</li>`
      );
    })
    .join("");
  return `<ul class="vs-legend">${items}</ul>`;
}
