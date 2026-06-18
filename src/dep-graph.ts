import { readFile, readdir } from "node:fs/promises";
import { join, dirname, relative, normalize } from "node:path";
import type { DiagramBlock } from "./blocks.js";
import { importsOf } from "./imports.js";

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".turbo"]);

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Strip a source extension and a trailing /index so two specifiers to the same module match. */
function moduleKey(repoRelPath: string): string {
  return repoRelPath.replace(/\\/g, "/").replace(SOURCE_RE, "").replace(/\/index$/, "");
}

/** Resolve a relative import specifier (from a repo-relative file) to a module key; null for bare packages. */
function resolveRel(fromRepoRel: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const joined = normalize(join(dirname(fromRepoRel), spec)).replace(/\\/g, "/");
  return moduleKey(joined);
}

/** Recursively list repo-relative source files, skipping vendor/build dirs. */
async function walkSource(root: string, dir = root, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walkSource(root, abs, acc);
    } else if (SOURCE_RE.test(e.name)) {
      acc.push(relative(root, abs).replace(/\\/g, "/"));
    }
  }
  return acc;
}

interface Node { label: string; changed: boolean; }

export interface DepGraphOpts { maxNodes?: number; }

/**
 * Build a bounded 1-hop import-neighborhood diagram around the changed source files:
 * their imports (outgoing) and importers (incoming). Returns null when there are no
 * source files among the changes or no edges resolve. TS/JS only.
 */
export async function dependencyNeighborhood(
  changedPaths: string[],
  repoRoot: string,
  opts: DepGraphOpts = {},
): Promise<DiagramBlock | null> {
  const cap = opts.maxNodes ?? 15;
  const sources = changedPaths.filter((p) => SOURCE_RE.test(p));
  if (sources.length === 0) return null;

  const changedKeys = new Set(sources.map(moduleKey));
  const nodes = new Map<string, Node>();
  const edges = new Set<string>();
  const addNode = (id: string, label: string, changed = false): void => {
    const cur = nodes.get(id);
    if (cur) { if (changed) cur.changed = true; }
    else nodes.set(id, { label, changed });
  };
  const keyId = (key: string) => `m:${key}`;
  const pkgId = (name: string) => `p:${name}`;

  for (const p of sources) addNode(keyId(moduleKey(p)), p, true);

  for (const p of sources) {
    const src = await readFile(join(repoRoot, p), "utf8").catch(() => null);
    if (!src) continue;
    for (const spec of importsOf(src)) {
      const rel = resolveRel(p, spec);
      if (rel) { addNode(keyId(rel), rel); edges.add(`${keyId(moduleKey(p))} ${keyId(rel)}`); }
      else { addNode(pkgId(spec), spec); edges.add(`${keyId(moduleKey(p))} ${pkgId(spec)}`); }
    }
  }

  for (const rel of await walkSource(repoRoot)) {
    if (changedKeys.has(moduleKey(rel))) continue;
    const src = await readFile(join(repoRoot, rel), "utf8").catch(() => null);
    if (!src) continue;
    for (const spec of importsOf(src)) {
      const target = resolveRel(rel, spec);
      if (target && changedKeys.has(target)) {
        addNode(keyId(moduleKey(rel)), rel);
        edges.add(`${keyId(moduleKey(rel))} ${keyId(target)}`);
      }
    }
  }

  if (edges.size === 0) return null;

  const degree = new Map<string, number>();
  for (const e of edges) {
    const [from, to] = e.split(" ");
    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
  }
  const changedIds = [...nodes].filter(([, n]) => n.changed).map(([id]) => id);
  const neighborIds = [...nodes.keys()].filter((id) => !nodes.get(id)!.changed);
  neighborIds.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));
  const keep = new Set<string>([...changedIds, ...neighborIds.slice(0, Math.max(0, cap - changedIds.length))]);
  const dropped = neighborIds.length - (keep.size - changedIds.length);

  const lines: string[] = ["direction: right"];
  for (const [id, n] of nodes) {
    if (!keep.has(id)) continue;
    lines.push(n.changed ? `${q(n.label)}: { style.fill: "#e6ffec" }` : q(n.label));
  }
  if (dropped > 0) lines.push(`${q(`+${dropped} more`)}`);
  for (const e of edges) {
    const [from, to] = e.split(" ");
    if (!keep.has(from) || !keep.has(to)) continue;
    lines.push(`  ${q(nodes.get(from)!.label)} -> ${q(nodes.get(to)!.label)}`);
  }

  return { type: "diagram", id: "where-it-fits", title: "Where it fits", kind: "architecture", d2: lines.join("\n") };
}
