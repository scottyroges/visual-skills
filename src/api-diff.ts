import type { ApiBlock, ApiProcedure } from "./blocks.js";

function sig(p: ApiProcedure): string {
  return `${p.auth}|${p.kind}|${p.input}`;
}

/** Diff two procedure lists into an ApiBlock containing only changed procedures. */
export function diffProcedures(
  before: ApiProcedure[],
  after: ApiProcedure[],
  title = "API changes",
  id = "api-diff",
): ApiBlock {
  const beforeByName = new Map(before.map((p) => [p.name, p]));
  const afterByName = new Map(after.map((p) => [p.name, p]));
  const procedures: ApiProcedure[] = [];

  for (const p of after) {
    const prev = beforeByName.get(p.name);
    if (!prev) procedures.push({ ...p, change: "added" });
    else if (sig(prev) !== sig(p)) procedures.push({ ...p, change: "changed" });
  }
  for (const p of before) {
    if (!afterByName.has(p.name)) procedures.push({ ...p, change: "removed" });
  }
  return { type: "api", id, title, procedures };
}
