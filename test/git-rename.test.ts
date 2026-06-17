import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedFiles } from "../src/git.js";

const exec = promisify(execFile);

describe("changedFiles rename handling", () => {
  it("reports a renamed file with status R and its real new path (no brace artifact)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "git-rename-"));
    try {
      const g = (args: string[]) => exec("git", args, { cwd: dir });
      await g(["init", "-q"]);
      await g(["config", "user.email", "t@t.com"]);
      await g(["config", "user.name", "t"]);
      await writeFile(join(dir, "old-name.txt"), "line1\nline2\nline3\n");
      await g(["add", "-A"]);
      await g(["commit", "-q", "-m", "add"]);
      const base = (await exec("git", ["rev-parse", "HEAD"], { cwd: dir })).stdout.trim();
      await g(["mv", "old-name.txt", "new-name.txt"]);
      await g(["commit", "-q", "-m", "rename"]);
      const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: dir })).stdout.trim();

      const files = await changedFiles(base, head, dir);
      const renamed = files.find((f) => f.path === "new-name.txt");
      expect(renamed).toBeDefined();
      expect(renamed!.status).toBe("R");
      expect(files.some((f) => f.path.includes("{"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
