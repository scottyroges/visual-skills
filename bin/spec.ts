#!/usr/bin/env -S node --import tsx
// visual-spec CLI — render a spec.json (opts + blocks) into a single self-contained HTML page.
//
//   npx tsx bin/spec.ts --blocks <spec.json> --out <dir> [--title "…"] [--excalidraw]
// Paths may be relative; they resolve against the current working directory.
//
// Writes <out>/spec.html and re-writes <out>/spec.json, so the doc folder stays self-contained
// and re-renders in place. Mirrors `recap --blocks`.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { assembleSpec, type SpecOpts } from "../src/assemble-spec.js";
import type { SpecBlock } from "../src/spec-blocks.js";

interface SpecDoc extends Partial<SpecOpts> { blocks: SpecBlock[]; }

async function main() {
  const { values } = parseArgs({
    options: {
      blocks: { type: "string" },
      out: { type: "string" },
      title: { type: "string" },
      excalidraw: { type: "boolean" },
      "no-excalidraw": { type: "boolean" },
    },
  });
  if (!values.blocks || !values.out) {
    console.error("usage: spec --blocks <spec.json> --out <dir> [--title …] [--excalidraw] [--no-excalidraw]");
    process.exit(2);
  }
  // Relative paths resolve against the cwd — parity with the doc/recap/atlas CLIs.
  const blocksPath = resolve(values.blocks);
  const outDir = resolve(values.out);

  const doc = JSON.parse(await readFile(blocksPath, "utf8")) as SpecDoc;
  if (!Array.isArray(doc.blocks)) {
    console.error(`${blocksPath}: expected a { "blocks": [...] } object`);
    process.exit(2);
  }

  await mkdir(outDir, { recursive: true });
  const warnings: string[] = [];
  const opts: SpecOpts = {
    title: values.title ?? doc.title ?? "Visual Spec",
    phase: doc.phase,
    status: doc.status,
    date: doc.date,
    complexity: doc.complexity,
    related: doc.related,
    meta: doc.meta,
    outDir,
    excalidraw: values["no-excalidraw"] ? false : (values.excalidraw ?? doc.excalidraw),
    generator: doc.generator ?? "visual-skills · visual-spec",
    onWarn: (m) => warnings.push(m),
  };

  const html = await assembleSpec(doc.blocks, opts);
  const htmlPath = join(outDir, "spec.html");
  await writeFile(htmlPath, html);
  await writeFile(join(outDir, "spec.json"), JSON.stringify(doc, null, 2));

  for (const w of warnings) console.warn(`⚠ ${w}`);
  console.log(`wrote ${htmlPath}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
