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

  it("valueOnly drops fully type-only import/export decls but keeps mixed, value, side-effect, dynamic", () => {
    const src = [
      `import type { T } from "./types.js";`,        // type-only — dropped
      `export type { U } from "./more-types.js";`,   // type-only re-export — dropped
      `import { fn, type V } from "./mixed.js";`,     // mixed (has a value) — kept
      `import { val } from "./value.js";`,            // value — kept
      `import "./side-effect.js";`,                   // side-effect — kept
      `const z = await import("./dyn.js");`,          // dynamic — kept
    ].join("\n");
    expect(importsOf(src, { valueOnly: true }).sort()).toEqual(
      ["./dyn.js", "./mixed.js", "./side-effect.js", "./value.js"].sort(),
    );
    // default (no opts) still includes the type-only specifiers
    expect(importsOf(src).sort()).toEqual(
      ["./dyn.js", "./mixed.js", "./more-types.js", "./side-effect.js", "./types.js", "./value.js"].sort(),
    );
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

  it("captures export interface, export type, and export enum alongside value exports", () => {
    const src = `
      export interface Foo {}
      export type Bar = string;
      export enum Baz { A }
      export const VALUE = 1;
    `;
    expect(exportsOf(src).sort()).toEqual(["Bar", "Baz", "Foo", "VALUE"].sort());
  });
});
