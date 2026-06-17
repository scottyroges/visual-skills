import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// These power the opt-in Excalidraw upgrade and must stay OUT of the default install
// (installed unsaved by `npm run setup:excalidraw`). Guards the lean-by-default principle.
const OPT_IN_ONLY = [
  "@excalidraw/excalidraw",
  "@excalidraw/mermaid-to-excalidraw",
  "react",
  "react-dom",
  "playwright",
  "esbuild",
];

describe("lean default install", () => {
  it("keeps the opt-in Excalidraw deps out of package.json deps/devDeps", () => {
    const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const dep of OPT_IN_ONLY) expect(declared).not.toHaveProperty(dep);
  });
});
