#!/usr/bin/env tsx
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { Target } from "../src/git.js";
import { gatherRecap } from "../src/gather-recap.js";
import { assemble } from "../src/assemble.js";

function parseTarget(values: Record<string, string | undefined>): Target {
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
    },
  });

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

  const outPath = values.out ?? ".recaps/recap.html";
  const html = await assemble(blocks, {
    title: `Recap — ${scope.label}`,
    source: `${repoRoot} · base ${scope.baseRef.slice(0, 10)} → head ${scope.headRef.slice(0, 10)} · stack ${adapter}`,
    status: { level: "green", text: `${blocks.length} blocks` },
    outDir: dirname(outPath),
    onWarn: (m) => console.warn(m),
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  console.log(`wrote ${outPath} (adapter: ${adapter})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
