import { describe, it, expect } from "vitest";
import { resolveScope, fileAtRef } from "../src/git.js";

describe("git scope", () => {
  it("resolves a commit target to base/head refs and a diff", async () => {
    const scope = await resolveScope({ kind: "commit", ref: "HEAD" }, { repoRoot: "." });
    expect(scope.headRef).toBe("HEAD");
    expect(scope.baseRef).toBe("HEAD^");
    expect(typeof scope.unifiedDiff).toBe("string");
  });

  it("reads file contents at a ref", async () => {
    const content = await fileAtRef("package.json", "HEAD", ".");
    expect(content).toContain('"name": "visual-skills"');
  });

  it("returns empty string for a path missing at a ref", async () => {
    const content = await fileAtRef("does/not/exist.ts", "HEAD", ".");
    expect(content).toBe("");
  });
});
