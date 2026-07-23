#!/usr/bin/env -S node --import tsx
// quiz CLI — render a quiz.json (QuizDoc: opts + blocks) into a single self-contained HTML page.
//
//   npx tsx bin/quiz.ts --blocks <quiz.json> --out <dir> [--title "…"] [--excalidraw]
// Paths may be relative; they resolve against the current working directory.
//
// Writes <out>/quiz.html and re-writes <out>/quiz.json, so the doc folder stays self-contained
// and re-renders in place. Mirrors `spec --blocks`.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { assembleQuiz, type QuizOpts } from "../src/assemble-quiz.js";
import type { QuizBlock } from "../src/quiz-blocks.js";

interface QuizDocFile extends Partial<QuizOpts> { kind?: string; blocks: QuizBlock[]; }

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
    console.error("usage: quiz --blocks <quiz.json> --out <dir> [--title …] [--excalidraw] [--no-excalidraw]");
    process.exit(2);
  }
  // Relative paths resolve against the cwd — parity with the doc/recap/spec/atlas CLIs.
  const blocksPath = resolve(values.blocks);
  const outDir = resolve(values.out);

  const doc = JSON.parse(await readFile(blocksPath, "utf8")) as QuizDocFile;
  if (!Array.isArray(doc.blocks)) {
    console.error(`${blocksPath}: expected a { "blocks": [...] } object`);
    process.exit(2);
  }

  await mkdir(outDir, { recursive: true });
  const warnings: string[] = [];
  const opts: QuizOpts = {
    title: values.title ?? doc.title ?? "Quiz",
    source: doc.source,
    intro: doc.intro,
    outDir,
    excalidraw: values["no-excalidraw"] ? false : (values.excalidraw ?? doc.excalidraw),
    generator: doc.generator ?? "visual-skills · quiz",
    onWarn: (m) => warnings.push(m),
  };

  const html = await assembleQuiz(doc.blocks, opts);
  const htmlPath = join(outDir, "quiz.html");
  await writeFile(htmlPath, html);
  await writeFile(join(outDir, "quiz.json"), JSON.stringify(doc, null, 2));

  for (const w of warnings) console.warn(`⚠ ${w}`);
  console.log(`wrote ${htmlPath}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
