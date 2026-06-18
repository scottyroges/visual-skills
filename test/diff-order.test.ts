import { describe, it, expect } from "vitest";
import { sortByImportance } from "../src/diff-order.js";
import type { DiffBlock } from "../src/blocks.js";

const d = (path: string): DiffBlock => ({
  type: "diff", id: path, title: path, path, hunks: [],
});

describe("sortByImportance", () => {
  it("orders source before styles, tests, and lockfiles; stable within a rank", () => {
    const input = [
      d("app.css"),
      d("package-lock.json"),
      d("src/a.test.ts"),
      d("src/server/router.ts"),
      d("prisma/schema.prisma"),
      d("src/server/service.ts"),
    ];
    const out = sortByImportance(input).map((b) => b.path);
    expect(out).toEqual([
      "src/server/router.ts",   // source
      "src/server/service.ts",  // source (stable: keeps input order vs router)
      "prisma/schema.prisma",   // schema/config
      "app.css",                // styles
      "src/a.test.ts",          // tests
      "package-lock.json",      // lockfiles/generated
    ]);
  });
});
