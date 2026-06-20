#!/usr/bin/env -S node --import tsx
// visual-atlas CLI (Phase 2: render-only). Renders committed JSON into self-contained pages.
//
//   npx tsx bin/atlas.ts --blocks <ABS file.json> --out <ABS dir>   # one page
//   npx tsx bin/atlas.ts --all <ABS dir> --out <ABS dir>            # atlas.json + every domain-*.json
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, isAbsolute, basename } from "node:path";
import { parseArgs } from "node:util";
import { assembleAtlas, assembleDomain } from "../src/assemble-atlas.js";
import type { AtlasBlock, AtlasOpts, DomainOpts } from "../src/atlas-blocks.js";

interface AtlasDoc extends Partial<AtlasOpts> { kind: "atlas"; blocks: AtlasBlock[]; }
interface DomainDoc extends Partial<DomainOpts> { kind: "domain"; slug: string; blocks: AtlasBlock[]; }
type Doc = AtlasDoc | DomainDoc;

async function renderFile(file: string, outDir: string): Promise<string> {
  const doc = JSON.parse(await readFile(file, "utf8")) as Doc;
  if (!Array.isArray(doc.blocks)) throw new Error(`${file}: expected { "blocks": [...] }`);
  const warnings: string[] = [];
  const onWarn = (m: string) => warnings.push(m);
  let html: string, outName: string;
  if (doc.kind === "domain") {
    const o: DomainOpts = { ...doc, title: doc.title ?? doc.slug, layer: doc.layer ?? "engine",
      layerLabel: doc.layerLabel ?? "Engine", outDir, onWarn, generator: doc.generator ?? "visual-skills · visual-atlas" };
    html = await assembleDomain(doc.blocks, o);
    outName = `domain-${doc.slug}.html`;
  } else {
    const o: AtlasOpts = { ...doc, title: doc.title ?? "System Atlas", outDir, onWarn, generator: doc.generator ?? "visual-skills · visual-atlas" };
    html = await assembleAtlas(doc.blocks, o);
    outName = "atlas.html";
  }
  await writeFile(join(outDir, outName), html);
  await writeFile(join(outDir, basename(file)), JSON.stringify(doc, null, 2));
  for (const w of warnings) console.warn(`⚠ ${basename(file)}: ${w}`);
  return outName;
}

async function main() {
  const { values } = parseArgs({ options: { blocks: { type: "string" }, all: { type: "string" }, out: { type: "string" } } });
  const outDir = values.out;
  if (!outDir || !isAbsolute(outDir)) { console.error("usage: atlas (--blocks <file> | --all <dir>) --out <ABS dir>"); process.exit(2); }
  await mkdir(outDir, { recursive: true });
  if (values.all) {
    if (!isAbsolute(values.all)) { console.error("--all must be an absolute path"); process.exit(2); }
    const entries = (await readdir(values.all)).filter((f) => f === "atlas.json" || (f.startsWith("domain-") && f.endsWith(".json")));
    entries.sort((a, b) => (a === "atlas.json" ? -1 : b === "atlas.json" ? 1 : a.localeCompare(b)));
    for (const f of entries) console.log(`wrote ${await renderFile(join(values.all, f), outDir)}`);
  } else if (values.blocks) {
    if (!isAbsolute(values.blocks)) { console.error("--blocks must be an absolute path"); process.exit(2); }
    console.log(`wrote ${await renderFile(values.blocks, outDir)}`);
  } else { console.error("need --blocks <file> or --all <dir>"); process.exit(2); }
}
main().catch((e) => { console.error(e); process.exit(1); });
