#!/usr/bin/env tsx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { Block } from "../src/blocks.js";
import { assemble } from "../src/assemble.js";
import { generatorStamp } from "../src/version.js";
import { promoteMermaidFences } from "../src/promote-mermaid.js";

async function main() {
  const { values } = parseArgs({
    options: {
      blocks: { type: "string" },
      title: { type: "string", default: "Plan" },
      source: { type: "string", default: "" },
      out: { type: "string", default: "plan.html" },
    },
  });
  if (!values.blocks) throw new Error("--blocks <path-to-blocks.json> is required");

  const blocks = JSON.parse(await readFile(values.blocks, "utf8")) as Block[];
  const promoted = promoteMermaidFences(blocks);
  // Create the output dir before assemble: diagram blocks may write .excalidraw
  // sidecars into it during rendering.
  await mkdir(dirname(values.out!), { recursive: true });
  const generator = await generatorStamp();
  const html = await assemble(promoted, {
    title: values.title!,
    source: values.source || values.blocks,
    outDir: dirname(values.out!),
    onWarn: (m) => console.warn(m),
    generator,
  });
  await writeFile(values.out!, html);
  console.log(`wrote ${values.out}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
