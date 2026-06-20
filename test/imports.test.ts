import { describe, it, expect } from "vitest";
import { importsOf } from "../src/imports.js";
import { exportsOf } from "../src/imports.js";

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

describe("exportsOf", () => {
  it("extracts named, const, class, and re-exported names; dedups", () => {
    const src = `
      export function computePlan() {}
      export const RATE = 1;
      export class Engine {}
      export { helper, helper as aliased } from "./util.js";
      export default function main() {}
      function private1() {}
    `;
    expect(exportsOf(src).sort()).toEqual(
      ["Engine", "RATE", "aliased", "computePlan", "default", "helper"].sort(),
    );
  });

  it("returns [] for a module with no exports", () => {
    expect(exportsOf("const x = 1;")).toEqual([]);
  });
});
