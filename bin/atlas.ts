#!/usr/bin/env -S node --import tsx
// visual-atlas CLI.
//   atlas --repo <ABS> --out <ABS dir>              # full scan: config + drift + draft-when-absent + render
//   atlas --repo <ABS> --domain <slug> --out <DIR>  # single domain: rescan + regenerate that page
//   atlas --all <ABS dir> --out <ABS dir>           # render every committed atlas.json + domain-*.json
//   atlas --blocks <ABS file.json> --out <ABS dir>  # render one committed page
// Add --force to overwrite existing draft JSON (default: never clobber authored prose).
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, isAbsolute, basename } from "node:path";
import { parseArgs } from "node:util";
import { assembleAtlas, assembleDomain } from "../src/assemble-atlas.js";
import type { AtlasBlock, AtlasOpts, DomainOpts } from "../src/atlas-blocks.js";
import { scanInventory, aggregateDomainEdges, buildAtlasDraft, buildDomainDraft } from "../src/gather-atlas.js";
import { firstGuessConfig, reconcile, type AtlasConfig } from "../src/atlas-config.js";

interface AtlasDoc extends Partial<AtlasOpts> { kind: "atlas"; blocks: AtlasBlock[]; }
interface DomainDoc extends Partial<DomainOpts> { kind: "domain"; slug: string; blocks: AtlasBlock[]; }
type Doc = AtlasDoc | DomainDoc;

async function renderFile(file: string, outDir: string): Promise<{ outName: string; warnings: number }> {
  const raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(raw["blocks"])) {
    console.error(`${file}: expected a { "blocks": [...] } object`);
    process.exit(2);
  }
  const doc = raw as unknown as Doc;
  const kind = raw["kind"] as string;
  const warnings: string[] = [];
  const onWarn = (m: string) => warnings.push(m);
  let html: string, outName: string;
  if (kind === "domain") {
    const d = doc as DomainDoc;
    const o: DomainOpts = { ...d, title: d.title ?? d.slug, layer: d.layer ?? "engine",
      layerLabel: d.layerLabel ?? "Engine", outDir, onWarn, generator: d.generator ?? "visual-skills · visual-atlas" };
    html = await assembleDomain(d.blocks, o);
    outName = `domain-${d.slug}.html`;
  } else {
    if (kind !== "atlas") console.warn(`⚠ ${basename(file)}: unknown kind "${kind}", rendering as atlas`);
    const a = doc as AtlasDoc;
    const o: AtlasOpts = { ...a, title: a.title ?? "System Atlas", outDir, onWarn, generator: a.generator ?? "visual-skills · visual-atlas" };
    html = await assembleAtlas(a.blocks, o);
    outName = "atlas.html";
  }
  await writeFile(join(outDir, outName), html);
  await writeFile(join(outDir, basename(file)), JSON.stringify(doc, null, 2));
  for (const w of warnings) console.warn(`⚠ ${basename(file)}: ${w}`);
  return { outName, warnings: warnings.length };
}

const today = () => new Date().toISOString().slice(0, 10);

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
  await writeFile(path, JSON.stringify(doc, null, 2));
  return true;
}

async function main() {
  const { values } = parseArgs({ options: {
    blocks: { type: "string" }, all: { type: "string" }, out: { type: "string" },
    repo: { type: "string" }, domain: { type: "string" }, force: { type: "boolean" },
  } });
  const outDir = values.out;
  if (!outDir || !isAbsolute(outDir)) { console.error("usage: atlas --repo <abs> [--domain <slug>] [--force] --out <abs> | --all <dir> --out <abs> | --blocks <file> --out <abs>"); process.exit(2); }
  if (values.repo) {
    if (!isAbsolute(values.repo)) { console.error("--repo must be an absolute path"); process.exit(2); }
    await mkdir(outDir, { recursive: true });
    if (values.domain) {
      const cfgPath = join(outDir, "atlas.domains.json");
      if (!existsSync(cfgPath)) { console.error(`--domain needs an existing ${cfgPath} (run a full scan first)`); process.exit(2); }
      const config = parseConfig(cfgPath, await readFile(cfgPath, "utf8"));
      const domain = config.domains.find((d) => d.slug === values.domain);
      if (!domain) { console.error(`unknown domain "${values.domain}" — not in atlas.domains.json`); process.exit(2); }
      const inv = await scanInventory(values.repo, config.srcRoots);
      const { config: live, drift } = reconcile(config, inv.modules.map((m) => m.path));
      const liveDomain = live.domains.find((d) => d.slug === values.domain)!;
      const edges = aggregateDomainEdges(live, inv);
      await writeFile(join(outDir, `domain-${liveDomain.slug}.json`),
        JSON.stringify(buildDomainDraft(liveDomain.slug, live, inv, edges, { date: today() }), null, 2));
      const { outName, warnings } = await renderFile(join(outDir, `domain-${liveDomain.slug}.json`), outDir);
      console.log(`refreshed ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
      // tile-only note (do not recompute the atlas map; see spec "Resolved during review")
      console.log(`note: atlas tile for "${liveDomain.slug}" — ${liveDomain.modules.length} files, deps: ${[...(edges.get(liveDomain.slug) ?? [])].sort().join(", ") || "none"} (update atlas.json's tile if changed)`);
      printDrift(drift);
      return; // end main()
    }
    const config0 = await loadOrGuessConfig(values.repo, outDir);
    const inv = await scanInventory(values.repo, config0.srcRoots);
    const { config, drift } = reconcile(config0, inv.modules.map((m) => m.path));
    await writeFile(join(outDir, "atlas.domains.json"), JSON.stringify(config, null, 2));

    const edges = aggregateDomainEdges(config, inv);
    const date = today();
    let wrote = 0;
    if (await writeDraftIfAbsent(outDir, "atlas.json", buildAtlasDraft(config, inv, edges, { date }), !!values.force)) wrote++;
    for (const d of config.domains)
      if (await writeDraftIfAbsent(outDir, `domain-${d.slug}.json`, buildDomainDraft(d.slug, config, inv, edges, { date }), !!values.force)) wrote++;
    console.log(`scanned ${inv.modules.length} module(s) → ${config.domains.length} domain(s); wrote ${wrote} new draft(s)`);
    printDrift(drift);

    // render every present JSON (reuses --all behavior)
    const entries = (await readdir(outDir)).filter((f) => f === "atlas.json" || (f.startsWith("domain-") && f.endsWith(".json")));
    entries.sort((a, b) => (a === "atlas.json" ? -1 : b === "atlas.json" ? 1 : a.localeCompare(b)));
    for (const f of entries) {
      const { outName, warnings } = await renderFile(join(outDir, f), outDir);
      console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
    }
  } else if (values.all) {
    if (!isAbsolute(values.all)) { console.error("--all must be an absolute path"); process.exit(2); }
    await mkdir(outDir, { recursive: true });
    const entries = (await readdir(values.all)).filter((f) => f === "atlas.json" || (f.startsWith("domain-") && f.endsWith(".json")));
    entries.sort((a, b) => (a === "atlas.json" ? -1 : b === "atlas.json" ? 1 : a.localeCompare(b)));
    for (const f of entries) {
      const { outName, warnings } = await renderFile(join(values.all, f), outDir);
      console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
    }
  } else if (values.blocks) {
    if (!isAbsolute(values.blocks)) { console.error("--blocks must be an absolute path"); process.exit(2); }
    await mkdir(outDir, { recursive: true });
    const { outName, warnings } = await renderFile(values.blocks, outDir);
    console.log(`wrote ${outName}${warnings ? ` (${warnings} warning(s))` : ""}`);
  } else { console.error("usage: atlas --repo <abs> [--domain <slug>] [--force] --out <abs> | --all <dir> --out <abs> | --blocks <file> --out <abs>"); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
