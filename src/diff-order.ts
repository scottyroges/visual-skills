import type { DiffBlock } from "./blocks.js";

// Lower rank = more important = sorted earlier. Ties keep input order (stable sort).
function rank(path: string): number {
  const p = path.toLowerCase();
  const base = p.split("/").pop() ?? p;
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(p) || /\.(snap|lock)$/.test(base)) return 5; // lockfiles/generated
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base) || /(^|\/)(__tests__|tests?)\//.test(p)) return 4;             // tests
  if (/\.(css|scss|sass|less|styl)$/.test(base)) return 3;                                                      // styles
  if (/\.(prisma|sql|json|ya?ml|toml|env|config\.[cm]?[jt]s)$/.test(base) || /(^|\/)(prisma|config)\//.test(p)) return 2; // schema/config
  if (/\.([cm]?[jt]sx?|go|rs|py|rb|java|kt|php|swift)$/.test(base)) return 0;                                   // source code
  return 1; // everything else (docs, assets) sits just after source
}

/** Stable importance sort: source → schema/config → styles → tests → lockfiles/generated. */
export function sortByImportance<T extends DiffBlock>(blocks: T[]): T[] {
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => rank(x.b.path) - rank(y.b.path) || x.i - y.i)
    .map((e) => e.b);
}
