import { escapeHtml } from "../html.js";
import type { ApiBlock, ApiProcedure } from "../blocks.js";

function row(p: ApiProcedure): string {
  const change = p.change ?? "";
  return (
    `<tr data-change="${change}">` +
    `<td class="vs-proc">${escapeHtml(p.name)}</td>` +
    `<td>${escapeHtml(p.kind)}</td>` +
    `<td>${escapeHtml(p.auth)}</td>` +
    `<td><code>${escapeHtml(p.input || "—")}</code></td>` +
    `<td class="vs-change">${escapeHtml(change)}</td>` +
    `</tr>`
  );
}

export function renderApi(block: ApiBlock): string {
  const rows = block.procedures.map(row).join("");
  return (
    `<section class="vs-block vs-api">` +
    `<h2>${escapeHtml(block.title)}</h2>` +
    `<table class="vs-api-table"><thead><tr>` +
    `<th>Procedure</th><th>Kind</th><th>Auth</th><th>Input</th><th>Change</th>` +
    `</tr></thead><tbody>${rows}</tbody></table></section>`
  );
}
