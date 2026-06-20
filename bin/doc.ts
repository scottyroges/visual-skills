#!/usr/bin/env tsx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Block } from "../src/blocks.js";
import { assemble } from "../src/assemble.js";
import { generatorStamp } from "../src/version.js";
import { promoteMermaidFences } from "../src/promote-mermaid.js";

async function main() {
  const { values } = parseArgs({
    options: {
      blocks: { type: "string" },
      title: { type: "string", default: "Doc" },
      source: { type: "string", default: "" },
      out: { type: "string", default: "doc" },
    },
  });
  if (!values.blocks) throw new Error("--blocks <path-to-blocks.json> is required");

  const blocks = JSON.parse(await readFile(values.blocks, "utf8")) as Block[];
  const promoted = promoteMermaidFences(blocks);
  // --out is a directory (a trailing .html is stripped for convenience). The HTML
  // and any .excalidraw sidecars are written together inside it.
  const outDir = values.out!.replace(/\.html?$/i, "");
  const htmlPath = join(outDir, "doc.html");
  await mkdir(outDir, { recursive: true });
  const generator = await generatorStamp();
  const html = await assemble(promoted, {
    title: values.title!,
    source: values.source || values.blocks,
    outDir,
    onWarn: (m) => console.warn(m),
    generator,
  });
  await writeFile(htmlPath, html);
  // Keep the source grouped with the doc: persist the input blocks inside the folder so it is
  // self-contained and re-renders in place (doc --blocks <dir>/blocks.json --out <dir>).
  await writeFile(join(outDir, "blocks.json"), JSON.stringify(blocks, null, 2));
  console.log(`wrote ${htmlPath}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
