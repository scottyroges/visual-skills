import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

describe("bin/plan.ts", () => {
  it("renders a hand-authored block array to a self-contained plan.html", async () => {
    const out = await mkdtemp(join(tmpdir(), "plan-"));
    try {
      await exec("npx", ["tsx", "bin/plan.ts",
        "--blocks", "test/fixtures/sample-plan.blocks.json",
        "--title", "Sample Plan", "--out", join(out, "plan.html")]);
      const html = await readFile(join(out, "plan.html"), "utf8");
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain("Sample Plan");
      expect(html.match(/<svg/g)?.length).toBeGreaterThanOrEqual(2);
      expect(html).not.toContain("<script");
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 30_000);
});
