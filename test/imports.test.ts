import { describe, it, expect } from "vitest";
import { importsOf } from "../src/imports.js";

describe("importsOf", () => {
  it("collects static, re-export, and dynamic import specifiers (deduped)", () => {
    const src = [
      `import { a } from "./a.js";`,
      `import def from "pkg";`,
      `export * from "./b.js";`,
      `export { x } from "./a.js";`,
      `const y = await import("./c.js");`,
    ].join("\n");
    expect(importsOf(src).sort()).toEqual(["./a.js", "./b.js", "./c.js", "pkg"]);
  });

  it("returns an empty array for source with no imports", () => {
    expect(importsOf("const x = 1;\nexport const y = x + 1;")).toEqual([]);
  });
});
