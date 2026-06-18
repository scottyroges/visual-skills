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
      out: { type: "string", default: ".recaps/recap.html" },
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

  if (emitPath && values.out === ".recaps/recap.html") {
    // emit-only: blocks requested and --out not overridden; skip HTML.
    return;
  }

  const html = await assemble(blocks, {
    title: `Recap — ${scope.label}`,
    source: `${repoRoot} · base ${scope.baseRef.slice(0, 10)} → head ${scope.headRef.slice(0, 10)} · stack ${adapter}`,
    status: { level: "green", text: `${blocks.length} blocks` },
    outDir: dirname(values.out!),
    onWarn: (m) => console.warn(m),
  });
  await mkdir(dirname(values.out!), { recursive: true });
  await writeFile(values.out!, html);
  console.log(`wrote ${values.out} (adapter: ${adapter})`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
