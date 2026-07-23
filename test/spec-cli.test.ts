import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = new URL("../bin/spec.ts", import.meta.url).pathname;
const TSX = new URL("../node_modules/.bin/tsx", import.meta.url).pathname;

const specDoc = {
  title: "Spec · demo",
  blocks: [
    { type: "tldr", id: "tldr", heading: "A tiny spec", rows: [{ key: "What", value: "demo" }] },
    { type: "scope", id: "scope", title: "Scope", inList: ["x"], outList: [{ text: "y" }] },
  ],
};

it("resolves relative --blocks/--out against the cwd (parity with the other CLIs)", () => {
  const dir = mkdtempSync(join(tmpdir(), "spec-cli-"));
  try {
    writeFileSync(join(dir, "spec.json"), JSON.stringify(specDoc));
    execFileSync(TSX, [BIN, "--blocks", "spec.json", "--out", "."], { encoding: "utf8", cwd: dir });
    expect(existsSync(join(dir, "spec.html"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
