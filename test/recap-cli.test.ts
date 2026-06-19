import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

describe("bin/recap.ts --blocks", () => {
  it("renders an existing blocks.json through the review shell (recap.html)", async () => {
    const out = await mkdtemp(join(tmpdir(), "recap-"));
    try {
      await exec("npx", ["tsx", "bin/recap.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Recap — Sample", "--out", join(out, "doc")]);
      const html = await readFile(join(out, "doc", "recap.html"), "utf8");
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain("Recap — Sample");
      expect(html).toContain('class="topbar"');     // review shell, not plan layout
      expect(html).toContain('class="sidebar"');
      expect(html).toContain('class="main"');
      expect((html.match(/<script>/g) || []).length).toBe(1);
      expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);

  it("also writes blocks.json back into the --out folder (round-trips)", async () => {
    const out = await mkdtemp(join(tmpdir(), "recap-"));
    try {
      await exec("npx", ["tsx", "bin/recap.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Recap — Sample", "--out", join(out, "doc")]);
      const written = JSON.parse(await readFile(join(out, "doc", "blocks.json"), "utf8"));
      const input = JSON.parse(await readFile("test/fixtures/sample-plan.blocks.json", "utf8"));
      expect(written).toEqual(input);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);
});
