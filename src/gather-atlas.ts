import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { importsOf, exportsOf } from "./imports.js";
import { parseRouter } from "./trpc-parse.js";
import { parsePrismaModels } from "./prisma-schema.js";
import { walkSource, moduleKey, loadAliases, resolveModule } from "./dep-graph.js";
import type { AtlasConfig } from "./atlas-config.js";
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

import type { AtlasBlock, DomainTile, ComponentCard, ComponentDeep, KV } from "./atlas-blocks.js";

/** Serializable atlas-page document (matches bin/atlas.ts's AtlasDoc). */
export interface AtlasDraft {
  kind: "atlas"; title: string; stack?: string; count?: string; date?: string;
  generator: string; blocks: AtlasBlock[];
}
/** Serializable domain-page document (matches bin/atlas.ts's DomainDoc). */
export interface DomainDraft {
  kind: "domain"; slug: string; title: string;
  layer: DomainTile["layer"]; layerLabel: string;
  path?: string; count?: string; depends?: string; date?: string;
  generator: string; blocks: AtlasBlock[];
}

const GENERATOR = "visual-skills · visual-atlas";

/** Common directory prefix of a domain's modules, e.g. "lib/sim". Falls back to the slug. */
function commonPath(modules: string[], slug: string): string {
  if (modules.length === 0) return slug;
  const split = modules.map((m) => m.split("/"));
  const first = split[0];
  let i = 0;
  for (; i < first.length - 1; i++) if (!split.every((p) => p[i] === first[i])) break;
  return first.slice(0, i).join("/") || slug;
}

/** Build the mechanical domain-map as an editable architecture diagram-section's diagram. */
export function domainMapDiagram(config: AtlasConfig, edges: Map<string, Set<string>>): AtlasDiagram {
  const slugs = config.domains.map((d) => d.slug);
  const d2 = ["direction: right", ...slugs.map((s) => s),
    ...slugs.flatMap((s) => [...(edges.get(s) ?? [])].sort().map((t) => `${s} -> ${t}`))].join("\n");

  const mid = new Map(slugs.map((s, i) => [s, `n${i}`]));
  const mlines = ["graph LR", ...slugs.map((s) => `  ${mid.get(s)}["${s}"]`),
    ...slugs.flatMap((s) => [...(edges.get(s) ?? [])].sort().map((t) => `  ${mid.get(s)} --> ${mid.get(t)}`))];

  return { id: "domain-map", kind: "architecture", d2, mermaid: mlines.join("\n") };
}

export function buildAtlasDraft(
  config: AtlasConfig,
  inv: Inventory,
  edges: Map<string, Set<string>>,
  opts: { date?: string } = {},
): AtlasDraft {
  const tiles: DomainTile[] = config.domains.map((d) => ({
    name: d.slug,
    path: commonPath(d.modules, d.slug),
    layer: "engine",
    layerLabel: "Engine",
    purpose: "",                                   // agent fills
    meta: [{ key: `~${d.modules.length}`, value: "files" }],
    deps: [...(edges.get(d.slug) ?? [])].sort(),
    href: `domain-${d.slug}.html`,
  }));

  const blocks: AtlasBlock[] = [
    {
      type: "atlas-tldr", id: "tldr", heading: config.repo,
      rows: [{ key: "Domains", value: String(config.domains.length) }],
      primer: [],
    },
    { type: "diagram-section", id: "map", title: "Domain map", diagram: domainMapDiagram(config, edges) },
    { type: "domain-index", id: "domains", title: "Domains", tiles },
  ];

  return {
    kind: "atlas", title: `System Atlas · ${config.repo}`,
    count: `${config.domains.length} domains`, date: opts.date, generator: GENERATOR, blocks,
  };
}

/** Group a domain's modules by their immediate subdirectory under the common path.
 *  Loose files directly under the path collapse into one group named after the slug. */
function groupBySubdir(modules: string[], base: string, slug: string): { name: string; files: string[] }[] {
  const prefix = base.endsWith("/") ? base : base + "/";
  const groups = new Map<string, string[]>();
  for (const m of modules) {
    const rest = m.startsWith(prefix) ? m.slice(prefix.length) : m;
    const slash = rest.indexOf("/");
    const name = slash < 0 ? slug : rest.slice(0, slash);
    (groups.get(name) ?? groups.set(name, []).get(name)!).push(m);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, files]) => ({ name, files }));
}

export function buildDomainDraft(
  slug: string,
  config: AtlasConfig,
  inv: Inventory,
  edges: Map<string, Set<string>>,
  opts: { date?: string } = {},
): DomainDraft {
  const domain = config.domains.find((d) => d.slug === slug);
  if (!domain) throw new Error(`unknown domain "${slug}"`);
  const base = commonPath(domain.modules, slug);
  const byKey = new Map(inv.modules.map((m) => [moduleKey(m.path), m]));
  const groups = groupBySubdir(domain.modules, base, slug);

  const cards: ComponentCard[] = groups.map((g) => ({
    name: g.name, purpose: "", href: `#c-${g.name}`,
  }));

  const components: ComponentDeep[] = groups.map((g) => {
    const exports: KV[] = g.files
      .flatMap((f) => (byKey.get(moduleKey(f))?.exports ?? []).map((name) => ({ name, desc: "" })));
    const files: KV[] = g.files.map((f) => ({ name: f.replace(base.endsWith("/") ? base : base + "/", ""), desc: "" }));
    return { id: `c-${g.name}`, name: g.name, path: g.files.length === 1 ? g.files[0] : g.name === slug ? base : `${base}/${g.name}`,
      detail: [""], files, exports, connections: [] };
  });

  const deps = [...(edges.get(slug) ?? [])].sort();
  const exposes = domain.modules
    .filter((m) => byKey.get(moduleKey(m))?.isRouter)
    .map((m) => ({ api: m, note: "" }));

  const blocks: AtlasBlock[] = [
    { type: "domain-tldr", id: "tldr", heading: domain.name, rows: [
      { key: "Path", value: base }, { key: "Files", value: String(domain.modules.length) },
    ] },
    { type: "components", id: "components", title: "Components", cards },
    { type: "diagram-section", id: "arch", title: "Internal architecture",
      diagram: { id: "arch-diagram", kind: "architecture",
        d2: ["direction: right", ...groups.map((g) => g.name)].join("\n"),
        mermaid: ["graph LR", ...groups.map((g, i) => `  a${i}["${g.name}"]`)].join("\n") } },
    { type: "depth", id: "depth", title: "In depth", components },
    { type: "seams", id: "seams", title: "Seams", exposes,
      depends: deps.map((s) => ({ name: s, path: commonPath(config.domains.find((d) => d.slug === s)!.modules, s), href: `domain-${s}.html` })) },
  ];

  return {
    kind: "domain", slug, title: domain.name, layer: "engine", layerLabel: "Engine",
    path: base, count: `${domain.modules.length} files`,
    depends: deps.join(" · ") || undefined, date: opts.date, generator: GENERATOR, blocks,
  };
}
