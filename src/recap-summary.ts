import type { Scope } from "./git.js";
import type { ApiProcedure, FileChange } from "./blocks.js";

/** Top-level directory area for a path, e.g. "src/server/routers/league.ts" -> "src/server/routers". */
function area(path: string): string {
  const parts = path.split("/");
  return parts.length <= 1 ? "(root)" : parts.slice(0, -1).join("/");
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].sort();
}

function names(procs: ApiProcedure[], change: ApiProcedure["change"]): string[] {
  return procs.filter((p) => p.change === change).map((p) => p.name);
}

/** Synthesize a short Markdown summary from already-gathered recap data. Pure. */
export function summaryMarkdown(
  scope: Scope,
  files: FileChange[],
  procedures: ApiProcedure[],
  schemaChanged: boolean,
): string {
  const added = files.reduce((n, f) => n + f.added, 0);
  const deleted = files.reduce((n, f) => n + f.deleted, 0);
  const areas = uniqueSorted(files.map((f) => area(f.path)));

  const lines: string[] = [];
  lines.push(`**${scope.label}** — ${files.length} files, +${added}/-${deleted}.`);
  lines.push("");
  lines.push(`**Areas touched:** ${areas.map((a) => `\`${a}\``).join(", ")}`);

  const addedP = names(procedures, "added");
  const removedP = names(procedures, "removed");
  const changedP = names(procedures, "changed");
  if (addedP.length) lines.push(`**Added procedures:** ${addedP.map((n) => `\`${n}\``).join(", ")}`);
  if (removedP.length) lines.push(`**Removed procedures:** ${removedP.map((n) => `\`${n}\``).join(", ")}`);
  if (changedP.length) lines.push(`**Changed procedures:** ${changedP.map((n) => `\`${n}\``).join(", ")}`);
  if (schemaChanged) lines.push(`**Schema:** Prisma schema changed (see the schema diagram below).`);

  return lines.join("\n");
}
