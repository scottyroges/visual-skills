import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

describe("bin/doc.ts", () => {
  it("writes doc.html and groups assets inside the --out folder", async () => {
    const out = await mkdtemp(join(tmpdir(), "plan-"));
    try {
      await exec("npx", ["tsx", "bin/doc.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Sample Plan", "--out", join(out, "doc")]);
      const html = await readFile(join(out, "doc", "doc.html"), "utf8");
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain("Sample Plan");
      expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
      expect(html).not.toMatch(/<script[^>]*\ssrc=/i); // only the inlined viewer, never external
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);

  it("also writes blocks.json into the --out folder so the doc folder round-trips", async () => {
    const out = await mkdtemp(join(tmpdir(), "plan-"));
    try {
      await exec("npx", ["tsx", "bin/doc.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Sample Plan", "--out", join(out, "doc")]);
      const written = JSON.parse(await readFile(join(out, "doc", "blocks.json"), "utf8"));
      const input = JSON.parse(await readFile("test/fixtures/sample-plan.blocks.json", "utf8"));
      expect(written).toEqual(input); // the folder carries its own source, identical to the input
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);

  it("strips a trailing .html on --out to derive the folder", async () => {
    const out = await mkdtemp(join(tmpdir(), "plan-"));
    try {
      await exec("npx", ["tsx", "bin/doc.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Sample Plan", "--out", join(out, "doc.html")]);
      // ".html" stripped -> folder "doc", file inside named doc.html
      const html = await readFile(join(out, "doc", "doc.html"), "utf8");
      expect(html).toMatch(/^<!doctype html>/i);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);
});
