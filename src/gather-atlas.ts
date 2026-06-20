import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { importsOf, exportsOf } from "./imports.js";
import { parseRouter } from "./trpc-parse.js";
import { parsePrismaModels } from "./prisma-schema.js";
import { walkSource, moduleKey, loadAliases, resolveModule } from "./dep-graph.js";
import type { AtlasConfig } from "./atlas-config.js";
import { matchGlob } from "./atlas-config.js";
import type { AtlasDiagram } from "./atlas-blocks.js";

/** One scanned source module: resolved in-repo import keys + exported names. */
export interface ModuleInfo {
  path: string;          // repo-relative, e.g. "lib/sim/engine.ts"
  imports: string[];     // resolved in-repo module keys (bare packages dropped)
  exports: string[];
  isRouter: boolean;
}
export interface Inventory {
  modules: ModuleInfo[];
  models: string[];      // Prisma model names
}

/** Walk srcRoots, parse imports/exports/routers per module, and collect Prisma models. */
export async function scanInventory(repoRoot: string, srcRoots: string[]): Promise<Inventory> {
  const aliases = loadAliases(repoRoot);
  const seen = new Set<string>();
  const modules: ModuleInfo[] = [];

  for (const root of srcRoots) {
    for (const rel of await walkSource(join(repoRoot, root))) {
      // walkSource returns paths relative to its argument; re-root to the repo.
      const path = `${root.replace(/\/$/, "")}/${rel}`.replace(/\\/g, "/");
      if (seen.has(path)) continue;
      seen.add(path);
      const src = await readFile(join(repoRoot, path), "utf8").catch(() => null);
      if (src == null) continue;
      const imports = [...new Set(
        importsOf(src)
          .map((spec) => resolveModule(path, spec, aliases))
          .filter((k): k is string => k != null && k !== moduleKey(path)),
      )].sort();
      const isRouter = /\brouter\s*\(/.test(src) && parseRouter(src, "appRouter").length > 0;
      modules.push({ path, imports, exports: exportsOf(src), isRouter });
    }
  }
  modules.sort((a, b) => a.path.localeCompare(b.path));

  const schema = await readFile(join(repoRoot, "prisma", "schema.prisma"), "utf8").catch(() => null);
  const models = schema ? [...parsePrismaModels(schema).keys()] : [];
  return { modules, models };
}

/** Resolve each module key to its domain slug (first matching glob wins). */
function moduleDomainIndex(config: AtlasConfig): Map<string, string> {
  const index = new Map<string, string>();
  for (const d of config.domains) for (const m of d.modules) index.set(moduleKey(m), d.slug);
  return index;
}

/** Aggregate module→module import edges up to cross-domain slug→slug edges (intra-domain dropped). */
export function aggregateDomainEdges(config: AtlasConfig, inv: Inventory): Map<string, Set<string>> {
  const dom = moduleDomainIndex(config);
  const edges = new Map<string, Set<string>>();
  for (const d of config.domains) edges.set(d.slug, new Set());
  for (const m of inv.modules) {
    const from = dom.get(moduleKey(m.path));
    if (!from) continue;
    for (const imp of m.imports) {
      const to = dom.get(imp);
      if (to && to !== from) edges.get(from)!.add(to);
    }
  }
  return edges;
}

/** Build the mechanical domain-map as an editable architecture diagram-section's diagram. */
export function domainMapDiagram(config: AtlasConfig, edges: Map<string, Set<string>>): AtlasDiagram {
  const slugs = config.domains.map((d) => d.slug);
  const d2 = ["direction: right", ...slugs.map((s) => s),
    ...slugs.flatMap((s) => [...(edges.get(s) ?? [])].sort().map((t) => `${s} -> ${t}`))].join("\n");

  const mid = new Map(slugs.map((s, i) => [s, `n${i}`]));
  const mlines = ["graph LR", ...slugs.map((s) => `  ${mid.get(s)}["${s}"]`),
    ...slugs.flatMap((s) => [...(edges.get(s) ?? [])].sort().map((t) => `  ${mid.get(s)} --> ${mid.get(t)}`))];

  return { id: "map", kind: "architecture", d2, mermaid: mlines.join("\n") };
}
