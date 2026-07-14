#!/usr/bin/env tsx
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import type { Target } from "../src/git.js";
import type { Block } from "../src/blocks.js";
import { gatherRecap } from "../src/gather-recap.js";
import { assembleReview } from "../src/assemble-review.js";
import { generatorStamp } from "../src/version.js";

function parseTarget(values: { pr?: string; commit?: string; branch?: string; base?: string }): Target {
  if (values.pr) return { kind: "pr", number: Number(values.pr) };
  if (values.commit) return { kind: "commit", ref: values.commit };
  if (values.branch) return { kind: "branch", ref: values.branch, base: values.base };
  return { kind: "working" };
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: "string", default: "." },
      pr: { type: "string" },
      commit: { type: "string" },
      branch: { type: "string" },
      base: { type: "string" },
      out: { type: "string" },
      "emit-blocks": { type: "string" },
      blocks: { type: "string" },
      title: { type: "string" },
      source: { type: "string" },
      excalidraw: { type: "boolean" },
      "no-excalidraw": { type: "boolean" },
    },
  });
  // Excalidraw is off by default (the dependable d2 floor). --excalidraw opts in to editable
  // diagrams when the toolchain is present; --no-excalidraw is kept as an explicit off.
  const excalidraw = values["no-excalidraw"] ? false : values.excalidraw ? true : undefined;

  // --blocks: render an existing (e.g. enriched) blocks.json through the review shell,
  // skipping git gather. This is the enrichment round-trip target for the visual-recap skill.
  if (values.blocks) {
    const loaded = JSON.parse(await readFile(values.blocks, "utf8")) as Block[];
    const outDir = (values.out ?? dirname(values.blocks)).replace(/\.html?$/i, "");
    const htmlPath = join(outDir, "recap.html");
    await mkdir(outDir, { recursive: true });
    const generator = await generatorStamp();
    const html = await assembleReview(loaded, {
      title: values.title ?? "Recap",
      source: values.source ?? "",
      outDir,
      excalidraw,
      onWarn: (m) => console.warn(m),
      generator,
    });
    await writeFile(htmlPath, html);
    await writeFile(join(outDir, "blocks.json"), JSON.stringify(loaded, null, 2));
    console.log(`wrote ${htmlPath} (from ${values.blocks})`);
    return;
  }

  const repoRoot = values.repo!;
  const { scope, blocks, adapter } = await gatherRecap(parseTarget(values), repoRoot, (m) => console.warn(m));
  const emitPath = values["emit-blocks"];
  if (emitPath) {
    await mkdir(dirname(emitPath), { recursive: true });
    await writeFile(emitPath, JSON.stringify(blocks, null, 2));
    console.log(`wrote ${emitPath} (${blocks.length} blocks, adapter: ${adapter})`);
  }

  // emit-only: blocks requested and --out genuinely not passed; skip HTML.
  if (emitPath && values.out === undefined) return;

  // --out is a directory (a trailing .html is stripped for convenience). The HTML
  // and any .excalidraw sidecars are written together inside it.
  const outDir = (values.out ?? ".recaps/recap").replace(/\.html?$/i, "");
  const htmlPath = join(outDir, "recap.html");
  await mkdir(outDir, { recursive: true });
  const generator = await generatorStamp();
  const html = await assembleReview(blocks, {
    title: `Recap — ${scope.label}`,
    source: `${repoRoot} · base ${scope.baseRef.slice(0, 10)} → head ${scope.headRef.slice(0, 10)} · stack ${adapter}`,
    status: { level: "green", text: `${blocks.length} blocks` },
    outDir,
    excalidraw,
    onWarn: (m) => console.warn(m),
    generator,
  });
  await writeFile(htmlPath, html);
  // Keep the source grouped with the doc: persist the gathered blocks inside the folder so it is
  // self-contained (enrich them and re-render with recap --blocks <dir>/blocks.json --out <dir>).
  await writeFile(join(outDir, "blocks.json"), JSON.stringify(blocks, null, 2));
  console.log(`wrote ${htmlPath} (adapter: ${adapter})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
