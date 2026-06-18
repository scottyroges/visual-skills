import { describe, it, expect } from "vitest";
import { summaryMarkdown } from "../src/recap-summary.js";
import type { Scope } from "../src/git.js";
import type { ApiProcedure, FileChange } from "../src/blocks.js";

const scope = { repoRoot: ".", baseRef: "a", headRef: "b", label: "PR #183", unifiedDiff: "" } as Scope;
const files: FileChange[] = [
  { path: "src/server/routers/league.ts", status: "M", added: 20, deleted: 4 },
  { path: "prisma/schema.prisma", status: "M", added: 2, deleted: 2 },
];
const procs: ApiProcedure[] = [
  { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "", change: "added" },
  { name: "league.createCheckout", auth: "protected", kind: "mutation", input: "", change: "removed" },
];

describe("summaryMarkdown", () => {
  it("synthesizes totals, areas, procedure changes, and a schema note", () => {
    const md = summaryMarkdown(scope, files, procs, true);
    expect(md).toContain("PR #183");
    expect(md).toContain("2 files");
    expect(md).toContain("+22/-6");
    expect(md).toContain("src/server/routers");
    expect(md).toContain("league.captureOrder");
    expect(md).toContain("league.createCheckout");
    expect(md.toLowerCase()).toContain("schema");
  });

  it("handles a change with no procedures or schema (totals only)", () => {
    const md = summaryMarkdown(scope, [files[0]], [], false);
    expect(md).toContain("1 files");
    expect(md).not.toMatch(/added procedures|removed procedures/i);
  });
});
