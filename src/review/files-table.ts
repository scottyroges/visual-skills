import { escapeHtml } from "../html.js";
import type { FileChange, FileTreeBlock } from "../blocks.js";

const STATUS_COLOR: Record<FileChange["status"], string> = {
  A: "var(--add)", M: "var(--change)", D: "var(--remove)", R: "var(--change)",
};

export function renderFilesTable(block: FileTreeBlock, pathToId: Map<string, string>): string {
  const rows = block.files.map((f) => {
    const id = pathToId.get(f.path);
    const path = id
      ? `<a href="#${escapeHtml(id)}">${escapeHtml(f.path)}</a>`
      : escapeHtml(f.path);
    const plus = f.added ? `<span style="color:var(--add);font-weight:600;">+${f.added}</span>` : "";
    const minus = f.deleted ? ` <span style="color:var(--remove);font-weight:600;">-${f.deleted}</span>` : "";
    return (
      `<tr>` +
      `<td class="col-status" style="color:${STATUS_COLOR[f.status]};font-weight:700;">${f.status}</td>` +
      `<td class="col-path">${path}</td>` +
      `<td class="col-stat">${plus}${minus}</td>` +
      `<td class="col-role"></td></tr>`
    );
  }).join("");
  return (
    `<table class="files-table" aria-label="Files changed">` +
    `<thead><tr>` +
    `<th class="col-status" scope="col" aria-label="Status">St.</th>` +
    `<th class="col-path" scope="col">Path</th>` +
    `<th class="col-stat" scope="col">Lines</th>` +
    `<th class="col-role" scope="col">Role</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}
