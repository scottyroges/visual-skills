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
import { assembleAtlas, assembleDomain } from "../src/assemble-atlas.js";
import type { AtlasBlock, AtlasOpts, DomainOpts } from "../src/atlas-blocks.js";
import { scanInventory, aggregateDomainEdges, buildAtlasDraft, buildDomainDraft } from "../src/gather-atlas.js";
import { firstGuessConfig, reconcile, type AtlasConfig } from "../src/atlas-config.js";

interface AtlasDoc extends Partial<AtlasOpts> { kind: "atlas"; blocks: AtlasBlock[]; }
interface DomainDoc extends Partial<DomainOpts> { kind: "domain"; slug: string; blocks: AtlasBlock[]; }
type Doc = AtlasDoc | DomainDoc;

async function renderFile(file: string, outDir: string, noExcalidraw = false): Promise<{ outName: string; warnings: number }> {
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
    pageDir = join(outDir, `domain-${d.slug}`);
    await mkdir(pageDir, { recursive: true });
    const o: DomainOpts = { ...d, title: d.title ?? d.slug, layer: d.layer ?? "engine",
      layerLabel: d.layerLabel ?? "Engine", outDir: pageDir, onWarn, generator: d.generator ?? "visual-skills · visual-atlas",
      // --no-excalidraw forces the d2 floor; otherwise honor the doc's own excalidraw field.
      excalidraw: noExcalidraw ? false : d.excalidraw };
    html = await assembleDomain(d.blocks, o);
    outName = `domain-${d.slug}.html`;
    jsonName = `domain-${d.slug}.json`;
    rel = `domain-${d.slug}/${outName}`;
  } else {
    if (kind !== "atlas") console.warn(`⚠ ${basename(file)}: unknown kind "${kind}", rendering as atlas`);
    const a = doc as AtlasDoc;
    pageDir = outDir;
    const o: AtlasOpts = { ...a, title: a.title ?? "System Atlas", outDir: pageDir, onWarn, generator: a.generator ?? "visual-skills · visual-atlas",
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

/** Discover the doc JSONs in an atlas dir: atlas.json (top) + each domain-<slug>/domain-<slug>.json. */
async function listDocJsons(dir: string): Promise<string[]> {
  const out: string[] = [];
  if (existsSync(join(dir, "atlas.json"))) out.push(join(dir, "atlas.json"));
  const subs: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith("domain-")) {
      const j = join(dir, e.name, `${e.name}.json`);
      if (existsSync(j)) subs.push(j);
    }
  }
  subs.sort();
  return [...out, ...subs];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Refresh the self-contained drift checker next to the atlas artifacts. Tool-owned (always
 *  overwritten): target repos commit it and run it from pre-commit/CI with plain Node —
 *  no visual-skills checkout needed. See assets/atlas-check.mjs for what it verifies. */
async function emitChecker(outDir: string): Promise<void> {
  const src = fileURLToPath(new URL("../assets/atlas-check.mjs", import.meta.url));
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
      const slugDir = join(outDir, `domain-${liveDomain.slug}`);
      await mkdir(slugDir, { recursive: true });
      const domJson = join(slugDir, `domain-${liveDomain.slug}.json`);
      await writeFile(domJson, JSON.stringify(buildDomainDraft(liveDomain.slug, live, inv, edges, { date: today() }), null, 2));
      const { outName, warnings } = await renderFile(domJson, outDir, noExcalidraw);
      console.log(`refreshed ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
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

    const edges = aggregateDomainEdges(config, inv);
    const date = today();
    let wrote = 0;
    if (await writeDraftIfAbsent(outDir, "atlas.json", buildAtlasDraft(config, inv, edges, { date }), !!values.force)) wrote++;
    for (const d of config.domains)
      if (await writeDraftIfAbsent(outDir, `domain-${d.slug}/domain-${d.slug}.json`, buildDomainDraft(d.slug, config, inv, edges, { date }), !!values.force)) wrote++;
    console.log(`scanned ${inv.modules.length} module(s) → ${config.domains.length} domain(s); wrote ${wrote} new draft(s)`);
    printDrift(drift);

    // Orphaned domain folders: a domain-<slug>/ with no matching domain in the (re)grouped config
    // — left behind after a regroup. Warn so the human can delete it (we never delete files).
    const slugs = new Set(config.domains.map((d) => d.slug));
    for (const e of await readdir(outDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith("domain-") && !slugs.has(e.name.slice("domain-".length)))
        console.warn(`⚠ ${e.name}/: no matching domain in atlas.domains.json (stale after a regroup? delete it)`);
    }

    for (const f of await listDocJsons(outDir)) {
      const { outName, warnings } = await renderFile(f, outDir, noExcalidraw);
      console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
    }
    await emitChecker(outDir);
  } else if (values.all) {
    await mkdir(outDir, { recursive: true });
    for (const f of await listDocJsons(resolve(values.all))) {
      const { outName, warnings } = await renderFile(f, outDir, noExcalidraw);
      console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
    }
    await emitChecker(outDir);
  } else if (values.blocks) {
    await mkdir(outDir, { recursive: true });
    const { outName, warnings } = await renderFile(resolve(values.blocks), outDir, noExcalidraw);
    console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
  } else { console.error("usage: atlas --repo <path> [--domain <slug>] [--force] [--no-excalidraw] --out <dir> | --all <dir> --out <dir> | --blocks <file> --out <dir>"); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
