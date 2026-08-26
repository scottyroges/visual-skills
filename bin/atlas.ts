#!/usr/bin/env -S node --import tsx
// visual-atlas CLI.
//   atlas --repo <dir> --out <dir>                  # full scan: config + drift + draft-when-absent + render
//   atlas --repo <dir> --domain <slug> --out <dir>  # single domain: rescan + regenerate that page
//   atlas --all <dir> --out <dir>                   # render the atlas + every domain-<slug>/ folder
//   atlas --blocks <file.json> --out <dir>          # render one committed page
// Paths may be relative; they resolve against the current working directory.
// Add --force to overwrite existing draft JSON (default: never clobber authored prose).
// Layout: atlas.{html,json} + atlas.domains.json at the top; each domain in its own
// domain-<slug>/ folder (domain-<slug>.{html,json} + that domain's diagram sidecars).
import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assembleAtlas, assembleDomain, assembleTopic } from "../src/assemble-atlas.js";
import type { AtlasBlock, AtlasOpts, DomainOpts, TopicOpts } from "../src/atlas-blocks.js";
import { scanInventory, aggregateDomainEdges, buildAtlasDraft, buildDomainDraft, buildTopicDraft, suggestTopicExtractions } from "../src/gather-atlas.js";
import { firstGuessConfig, reconcile, type AtlasConfig } from "../src/atlas-config.js";
import {
  buildPageNavigation,
  buildPageTree,
  resolveTopicSources,
  validatePageTree,
  type AtlasPageTree,
} from "../src/atlas-tree.js";

interface AtlasDoc extends Partial<AtlasOpts> { kind: "atlas"; blocks: AtlasBlock[]; }
interface DomainDoc extends Partial<DomainOpts> { kind: "domain"; slug: string; blocks: AtlasBlock[]; }
interface TopicDoc extends Partial<TopicOpts> { kind: "topic"; pageId: string; slug: string; blocks: AtlasBlock[]; }
type Doc = AtlasDoc | DomainDoc | TopicDoc;

async function renderFile(
  file: string,
  outDir: string,
  noExcalidraw = false,
  tree?: AtlasPageTree,
): Promise<{ outName: string; warnings: number }> {
  const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(raw["blocks"])) {
    console.error(`${file}: expected a { "blocks": [...] } object`);
    process.exit(2);
  }
  const doc = raw as unknown as Doc;
  const kind = raw["kind"] as string;
  const warnings: string[] = [];
  const onWarn = (m: string) => warnings.push(m);
  // A domain page lives in its own folder so its diagram sidecars stay self-contained; the atlas
  // page sits at the top of outDir. pageDir is both where the HTML/JSON land and the diagram outDir.
  let html: string, outName: string, jsonName: string, pageDir: string, rel: string;
  if (kind === "domain") {
    const d = doc as DomainDoc;
    const node = tree?.byId.get(d.slug);
    pageDir = join(outDir, node?.outputDir ?? `domain-${d.slug}`);
    await mkdir(pageDir, { recursive: true });
    const o: DomainOpts = { ...d, title: d.title ?? d.slug, layer: d.layer ?? "engine",
      layerLabel: d.layerLabel ?? "Engine", outDir: pageDir, onWarn, generator: d.generator ?? "visual-skills · visual-atlas",
      navigation: tree ? buildPageNavigation(tree, d.slug) : d.navigation,
      // --no-excalidraw forces the d2 floor; otherwise honor the doc's own excalidraw field.
      excalidraw: noExcalidraw ? false : d.excalidraw };
    html = await assembleDomain(d.blocks, o);
    outName = node ? basename(node.htmlPath) : `domain-${d.slug}.html`;
    jsonName = node ? basename(node.jsonPath) : `domain-${d.slug}.json`;
    rel = node?.htmlPath ?? `domain-${d.slug}/${outName}`;
  } else if (kind === "topic") {
    const t = doc as TopicDoc;
    const node = tree?.byId.get(t.pageId);
    if (tree && !node) throw new Error(`topic page "${t.pageId}" is not configured in atlas.domains.json`);
    pageDir = join(outDir, node?.outputDir ?? `topic-${t.slug}`);
    await mkdir(pageDir, { recursive: true });
    const navigation = tree ? buildPageNavigation(tree, t.pageId) : t.navigation;
    const o: TopicOpts = {
      ...t,
      title: t.title ?? node?.title ?? t.slug,
      purpose: t.purpose ?? node?.purpose ?? "",
      shape: t.shape ?? node?.shape,
      outDir: pageDir,
      onWarn,
      navigation,
      backHref: t.backHref ?? navigation?.parent?.href,
      backLabel: t.backLabel ?? navigation?.parent?.title,
      generator: t.generator ?? "visual-skills · visual-atlas",
      excalidraw: noExcalidraw ? false : t.excalidraw,
    };
    html = await assembleTopic(t.blocks, o);
    outName = node ? basename(node.htmlPath) : `topic-${t.slug}.html`;
    jsonName = node ? basename(node.jsonPath) : `topic-${t.slug}.json`;
    rel = node?.htmlPath ?? `topic-${t.slug}/${outName}`;
  } else {
    if (kind !== "atlas") console.warn(`⚠ ${basename(file)}: unknown kind "${kind}", rendering as atlas`);
    const a = doc as AtlasDoc;
    pageDir = outDir;
    const o: AtlasOpts = { ...a, title: a.title ?? "System Atlas", outDir: pageDir, onWarn, generator: a.generator ?? "visual-skills · visual-atlas",
      navigation: tree ? buildPageNavigation(tree) : a.navigation,
      excalidraw: noExcalidraw ? false : a.excalidraw };
    html = await assembleAtlas(a.blocks, o);
    outName = "atlas.html";
    jsonName = "atlas.json";
    rel = outName;
  }
  await writeFile(join(pageDir, outName), html);
  await writeFile(join(pageDir, jsonName), JSON.stringify(doc, null, 2));
  for (const w of warnings) console.warn(`⚠ ${basename(file)}: ${w}`);
  return { outName: rel, warnings: warnings.length };
}

/** Discover configured docs in page-tree order, with a recursive fallback for standalone output. */
async function listDocJsons(dir: string, tree?: AtlasPageTree): Promise<string[]> {
  if (tree) {
    const configured = [join(dir, "atlas.json"), ...tree.nodes.map((node) => join(dir, node.jsonPath))];
    return configured.filter(existsSync);
  }
  const out: string[] = [];
  const walk = async (current: string) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "atlas.domains.json") {
        const stem = entry.name.slice(0, -5);
        if (entry.name === "atlas.json" || stem === basename(current) || stem === `domain-${basename(current).replace(/^domain-/, "")}`)
          out.push(path);
      }
    }
  };
  await walk(dir);
  return out.sort((a, b) => (basename(a) === "atlas.json" ? -1 : basename(b) === "atlas.json" ? 1 : a.localeCompare(b)));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Refresh the self-contained drift checker next to the atlas artifacts. Tool-owned (always
 *  overwritten): target repos commit it and run it from pre-commit/CI with plain Node —
 *  no visual-skills checkout needed. See assets/atlas-check.mjs for what it verifies. */
async function emitChecker(outDir: string): Promise<void> {
  const src = fileURLToPath(new URL("../assets/atlas-check-v2.mjs", import.meta.url));
  await copyFile(src, join(outDir, "atlas-check.mjs"));
  console.log("wrote atlas-check.mjs (drift checker — wire `node .visual/atlas/atlas-check.mjs` into pre-commit)");
}

function parseConfig(cfgPath: string, raw: string): AtlasConfig {
  try {
    return JSON.parse(raw) as AtlasConfig;
  } catch (e) {
    console.error(`atlas.domains.json: could not parse — ${(e as Error).message}`);
    process.exit(2);
  }
}

function checkedTree(config: AtlasConfig): AtlasPageTree {
  const tree = buildPageTree(config);
  const validation = validatePageTree(tree);
  if (validation.problems.length) throw new Error(`invalid atlas page tree:\n- ${validation.problems.join("\n- ")}`);
  for (const warning of validation.warnings) console.warn(`⚠ ${warning}`);
  return tree;
}

async function loadTree(dir: string): Promise<AtlasPageTree | undefined> {
  const path = join(dir, "atlas.domains.json");
  if (!existsSync(path)) return undefined;
  return checkedTree(parseConfig(path, await readFile(path, "utf8")));
}

async function loadOrGuessConfig(repoRoot: string, outDir: string): Promise<AtlasConfig> {
  const cfgPath = join(outDir, "atlas.domains.json");
  if (existsSync(cfgPath)) return parseConfig(cfgPath, await readFile(cfgPath, "utf8"));
  const inv = await scanInventory(repoRoot, ["src", "lib"]);
  const repoName = basename(repoRoot);
  return firstGuessConfig(repoName, ["src", "lib"], inv.modules.map((m) => m.path));
}

function printDrift(drift: { newModules: string[]; stalePaths: { slug: string; path: string }[]; emptyDomains: string[] }) {
  if (drift.newModules.length) console.warn(`⚠ ${drift.newModules.length} unassigned module(s): ${drift.newModules.slice(0, 8).join(", ")}${drift.newModules.length > 8 ? " …" : ""}`);
  for (const s of drift.stalePaths) console.warn(`⚠ stale path in "${s.slug}": ${s.path}`);
  for (const d of drift.emptyDomains) console.warn(`⚠ domain "${d}" resolves to zero modules`);
}

async function writeDraftIfAbsent(outDir: string, name: string, doc: unknown, force: boolean): Promise<boolean> {
  const path = join(outDir, name);
  if (existsSync(path) && !force) return false;
  await mkdir(dirname(path), { recursive: true });   // name may be nested (domain-<slug>/domain-<slug>.json)
  await writeFile(path, JSON.stringify(doc, null, 2));
  return true;
}

async function main() {
  const { values } = parseArgs({ options: {
    blocks: { type: "string" }, all: { type: "string" }, out: { type: "string" },
    repo: { type: "string" }, domain: { type: "string" }, force: { type: "boolean" },
    "no-excalidraw": { type: "boolean" },
  } });
  const outDir = values.out ? resolve(values.out) : undefined;   // relative paths resolve against cwd
  const noExcalidraw = !!values["no-excalidraw"];   // force the d2 floor, skip editable upgrade
  if (!outDir) { console.error("usage: atlas --repo <path> [--domain <slug>] [--force] [--no-excalidraw] --out <dir> | --all <dir> --out <dir> | --blocks <file> --out <dir>"); process.exit(2); }
  if (values.repo) {
    const repo = resolve(values.repo);
    await mkdir(outDir, { recursive: true });
    if (values.domain) {
      const cfgPath = join(outDir, "atlas.domains.json");
      if (!existsSync(cfgPath)) { console.error(`--domain needs an existing ${cfgPath} (run a full scan first)`); process.exit(2); }
      const config = parseConfig(cfgPath, await readFile(cfgPath, "utf8"));
      const domain = config.domains.find((d) => d.slug === values.domain);
      if (!domain) { console.error(`unknown domain "${values.domain}" — not in atlas.domains.json`); process.exit(2); }
      const inv = await scanInventory(repo, config.srcRoots);
      const { config: live, drift } = reconcile(config, inv.modules.map((m) => m.path));
      const liveDomain = live.domains.find((d) => d.slug === values.domain)!;
      const edges = aggregateDomainEdges(live, inv);
      await writeFile(cfgPath, JSON.stringify(live, null, 2));
      const tree = checkedTree(live);
      const subtree = tree.nodes.filter((node) => node.id === liveDomain.slug || node.id.startsWith(`${liveDomain.slug}/`));
      const date = today();
      for (const node of subtree) {
        const draft = node.kind === "domain"
          ? buildDomainDraft(node.slug, live, inv, edges, { date })
          : buildTopicDraft(node, await resolveTopicSources(repo, node.topic!), { date });
        const json = join(outDir, node.jsonPath);
        await mkdir(dirname(json), { recursive: true });
        await writeFile(json, JSON.stringify(draft, null, 2));
      }
      for (const node of subtree) {
        const { outName, warnings } = await renderFile(join(outDir, node.jsonPath), outDir, noExcalidraw, tree);
        console.log(`refreshed ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
      }
      // tile-only note (do not recompute the atlas map; see spec "Resolved during review")
      console.log(`note: atlas tile for "${liveDomain.slug}" — ${liveDomain.modules.length} files, deps: ${[...(edges.get(liveDomain.slug) ?? [])].sort().join(", ") || "none"} (update atlas.json's tile if changed)`);
      printDrift(drift);
      await emitChecker(outDir);
      return; // end main()
    }
    const config0 = await loadOrGuessConfig(repo, outDir);
    const inv = await scanInventory(repo, config0.srcRoots);
    const { config, drift } = reconcile(config0, inv.modules.map((m) => m.path));
    await writeFile(join(outDir, "atlas.domains.json"), JSON.stringify(config, null, 2));
    const tree = checkedTree(config);

    const edges = aggregateDomainEdges(config, inv);
    const date = today();
    let wrote = 0;
    if (await writeDraftIfAbsent(outDir, "atlas.json", buildAtlasDraft(config, inv, edges, { date }), !!values.force)) wrote++;
    for (const node of tree.nodes) {
      const draft = node.kind === "domain"
        ? buildDomainDraft(node.slug, config, inv, edges, { date })
        : buildTopicDraft(node, await resolveTopicSources(repo, node.topic!), { date });
      if (await writeDraftIfAbsent(outDir, node.jsonPath, draft, !!values.force)) wrote++;
    }
    console.log(`scanned ${inv.modules.length} module(s) → ${config.domains.length} domain(s); wrote ${wrote} new draft(s)`);
    printDrift(drift);
    for (const suggestion of suggestTopicExtractions(config, inv)) {
      const hint = suggestion.titleHint ? ` (possible topic: "${suggestion.titleHint}")` : "";
      console.warn(`⚠ extraction suggestion for "${suggestion.domainSlug}"${hint}: ${suggestion.reason}`);
    }

    // Orphaned domain folders: a domain-<slug>/ with no matching domain in the (re)grouped config
    // — left behind after a regroup. Warn so the human can delete it (we never delete files).
    const slugs = new Set(config.domains.map((d) => d.slug));
    for (const e of await readdir(outDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith("domain-") && !slugs.has(e.name.slice("domain-".length)))
        console.warn(`⚠ ${e.name}/: no matching domain in atlas.domains.json (stale after a regroup? delete it)`);
    }

    for (const f of await listDocJsons(outDir, tree)) {
      const { outName, warnings } = await renderFile(f, outDir, noExcalidraw, tree);
      console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
    }
    await emitChecker(outDir);
  } else if (values.all) {
    await mkdir(outDir, { recursive: true });
    const sourceDir = resolve(values.all);
    const tree = await loadTree(sourceDir);
    for (const f of await listDocJsons(sourceDir, tree)) {
      const { outName, warnings } = await renderFile(f, outDir, noExcalidraw, tree);
      console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
    }
    await emitChecker(outDir);
  } else if (values.blocks) {
    await mkdir(outDir, { recursive: true });
    const tree = await loadTree(outDir);
    const { outName, warnings } = await renderFile(resolve(values.blocks), outDir, noExcalidraw, tree);
    console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
  } else { console.error("usage: atlas --repo <path> [--domain <slug>] [--force] [--no-excalidraw] --out <dir> | --all <dir> --out <dir> | --blocks <file> --out <dir>"); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
