import { readFile, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname, relative, normalize } from "node:path";
import ts from "typescript";
import type { DiagramBlock } from "./blocks.js";
import { importsOf } from "./imports.js";
import { MERMAID_CLASSDEFS } from "./diagram-colors.js";

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

interface AliasMatcher { prefix: string; suffix: string; star: boolean; target: string; }
interface Aliases { baseUrl: string; matchers: AliasMatcher[]; }

/**
 * Load tsconfig compilerOptions.paths/baseUrl from repoRoot; empty matchers if absent.
 * Heuristic for a diagram aid, not full module resolution: uses each pattern's first
 * target only, matches in declaration order (no longest-prefix specificity), and does
 * not follow `extends`. All of these degrade gracefully to relative-only resolution.
 */
function loadAliases(repoRoot: string): Aliases {
  const res = ts.readConfigFile(join(repoRoot, "tsconfig.json"), (p) => {
    try { return readFileSync(p, "utf8"); } catch { return undefined; }
  });
  const co = (res.config?.compilerOptions ?? {}) as { baseUrl?: string; paths?: Record<string, string[]> };
  const baseUrl = co.baseUrl ?? ".";
  const matchers: AliasMatcher[] = [];
  for (const [pattern, targets] of Object.entries(co.paths ?? {})) {
    if (!Array.isArray(targets) || targets.length === 0) continue;
    const target = targets[0];
    if (pattern.includes("*")) {
      const [prefix, suffix] = pattern.split("*");
      matchers.push({ prefix, suffix, star: true, target });
    } else {
      matchers.push({ prefix: pattern, suffix: "", star: false, target });
    }
  }
  return { baseUrl, matchers };
}

/** Resolve a non-relative specifier through tsconfig path aliases to a module key; null if no alias matches. */
function resolveAlias(spec: string, aliases: Aliases): string | null {
  for (const m of aliases.matchers) {
    if (m.star) {
      if (spec.length < m.prefix.length + m.suffix.length) continue;
      if (!spec.startsWith(m.prefix) || !spec.endsWith(m.suffix)) continue;
      const star = spec.slice(m.prefix.length, spec.length - m.suffix.length);
      const substituted = m.target.includes("*") ? m.target.replace("*", star) : m.target;
      return moduleKey(normalize(join(aliases.baseUrl, substituted)).replace(/\\/g, "/"));
    } else if (spec === m.prefix) {
      return moduleKey(normalize(join(aliases.baseUrl, m.target)).replace(/\\/g, "/"));
    }
  }
  return null;
}

/** Resolve any specifier (relative OR tsconfig-alias) to an in-repo module key; null for bare packages. */
function resolveModule(fromRepoRel: string, spec: string, aliases: Aliases): string | null {
  return spec.startsWith(".") ? resolveRel(fromRepoRel, spec) : resolveAlias(spec, aliases);
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

  const aliases = loadAliases(repoRoot);
  const changedKeys = new Set(sources.map(moduleKey));
  const nodes = new Map<string, Node>();
  const edges = new Set<string>();
  const addNode = (id: string, label: string, changed = false): void => {
    const cur = nodes.get(id);
    if (cur) { if (changed) cur.changed = true; }
    else nodes.set(id, { label, changed });
  };
  const keyId = (key: string) => `m:${key}`;

  for (const p of sources) addNode(keyId(moduleKey(p)), p, true);

  for (const p of sources) {
    const src = await readFile(join(repoRoot, p), "utf8").catch(() => null);
    if (!src) continue;
    for (const spec of importsOf(src)) {
      const mod = resolveModule(p, spec, aliases);
      // In-repo modules only: bare packages (server-only, kysely, vitest, @trpc/server, …) are
      // noise in a "where it fits" neighborhood — omit them so the app structure reads clearly.
      if (mod) { addNode(keyId(mod), mod); edges.add(`${keyId(moduleKey(p))} ${keyId(mod)}`); }
    }
  }

  for (const rel of await walkSource(repoRoot)) {
    if (changedKeys.has(moduleKey(rel))) continue;
    const src = await readFile(join(repoRoot, rel), "utf8").catch(() => null);
    if (!src) continue;
    for (const spec of importsOf(src)) {
      const target = resolveModule(rel, spec, aliases);
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
  neighborIds.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b));
  const keep = new Set<string>([...changedIds, ...neighborIds.slice(0, Math.max(0, cap - changedIds.length))]);
  const dropped = neighborIds.length - (keep.size - changedIds.length);

  const lines: string[] = ["direction: right"];
  for (const [id, n] of nodes) {
    if (!keep.has(id)) continue;
    lines.push(n.changed ? `${q(n.label)}: { class: changed }` : q(n.label));
  }
  if (dropped > 0) lines.push(`${q(`+${dropped} more`)}`);
  for (const e of edges) {
    const [from, to] = e.split(" ");
    if (!keep.has(from) || !keep.has(to)) continue;
    lines.push(`  ${q(nodes.get(from)!.label)} -> ${q(nodes.get(to)!.label)}`);
  }

  // mermaid (editable upgrade): same nodes/edges with mermaid-safe ids + path labels.
  const mid = new Map<string, string>();
  const mlines: string[] = ["graph LR"];
  const changedMids: string[] = [];
  let mi = 0;
  for (const [id, n] of nodes) {
    if (!keep.has(id)) continue;
    const m = `n${mi++}`;
    mid.set(id, m);
    mlines.push(`  ${m}["${n.label.replace(/"/g, "'")}"]`);
    if (n.changed) changedMids.push(m);
  }
  if (dropped > 0) {
    const m = `n${mi++}`;
    mlines.push(`  ${m}["+${dropped} more"]`);
  }
  for (const e of edges) {
    const [from, to] = e.split(" ");
    if (!keep.has(from) || !keep.has(to)) continue;
    mlines.push(`  ${mid.get(from)} --> ${mid.get(to)}`);
  }
  if (changedMids.length) {
    mlines.push(MERMAID_CLASSDEFS);
    for (const m of changedMids) mlines.push(`  class ${m} changed;`);
  }

  return {
    type: "diagram",
    id: "where-it-fits",
    title: "Where it fits",
    kind: "architecture",
    d2: lines.join("\n"),
    mermaid: mlines.join("\n"),
  };
}
