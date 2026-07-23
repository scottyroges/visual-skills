import { describe, it, expect } from "vitest";
import { pythonImportsOf, pythonExportsOf } from "../src/python-imports.js";
import { resolvePythonModule, moduleKey } from "../src/dep-graph.js";

describe("pythonImportsOf", () => {
  it("collects plain, dotted, aliased, and from-imports (deduped)", () => {
    const src = [
      `import os`,
      `import os.path`,
      `import numpy as np`,
      `import a.b as ab, x.y`,
      `from src.app.matcher import Widget`,
      `from src.app.matcher import Other`, // same module — dedups
    ].join("\n");
    expect(pythonImportsOf(src).sort()).toEqual(
      ["a.b", "numpy", "os", "os.path", "src.app.matcher", "x.y"].sort(),
    );
  });

  it("preserves leading dots on relative imports so depth survives to the resolver", () => {
    const src = [
      `from . import sibling`,
      `from .mod import thing`,
      `from ..pkg.deep import x`,
      `from ...top import y`,
    ].join("\n");
    expect(pythonImportsOf(src).sort()).toEqual([".", "..pkg.deep", "...top", ".mod"].sort());
  });

  it("handles parenthesized multi-line and backslash-continued imports", () => {
    const src = [
      `from src.services.optimizer import (`,
      `    Alpha,`,
      `    Beta,`,
      `)`,
      `from src.util import \\`,
      `    helper`,
    ].join("\n");
    expect(pythonImportsOf(src).sort()).toEqual(["src.services.optimizer", "src.util"].sort());
  });

  it("ignores imports inside docstrings, comments, and string literals", () => {
    const src = [
      `"""`,
      `Example usage:`,
      `    import fake.docstring.module`,
      `"""`,
      `# import fake.comment.module`,
      `sql = "from fake.string.module import x"`,
      `import real.module`,
    ].join("\n");
    expect(pythonImportsOf(src)).toEqual(["real.module"]);
  });

  it("returns [] for a module with no imports", () => {
    expect(pythonImportsOf("x = 1\ndef f():\n    return x\n")).toEqual([]);
  });
});

describe("pythonExportsOf", () => {
  it("extracts top-level defs, classes, async defs, and constants; skips privates", () => {
    const src = [
      `RATE = 1`,
      `TIMEOUT: int = 30`,
      `_PRIVATE = 2`,
      `def compute_plan():`,
      `    pass`,
      `async def fetch():`,
      `    pass`,
      `def _helper():`,
      `    pass`,
      `class Engine:`,
      `    def method(self):`, // nested — not a module export
      `        pass`,
    ].join("\n");
    expect(pythonExportsOf(src).sort()).toEqual(
      ["Engine", "RATE", "TIMEOUT", "compute_plan", "fetch"].sort(),
    );
  });

  it("an explicit __all__ overrides the convention-based scan", () => {
    const src = [
      `__all__ = ["PublicThing", "other_fn"]`,
      `def PublicThing():`,
      `    pass`,
      `def other_fn():`,
      `    pass`,
      `def not_listed():`, // real but undeclared — __all__ is the declared API
      `    pass`,
    ].join("\n");
    expect(pythonExportsOf(src).sort()).toEqual(["PublicThing", "other_fn"].sort());
  });

  it("does not treat comparisons or nested assignments as exports", () => {
    const src = [`def f():`, `    local = 1`, `    if local == 2:`, `        pass`].join("\n");
    expect(pythonExportsOf(src)).toEqual(["f"]);
  });

  it("returns [] for an empty module", () => {
    expect(pythonExportsOf("")).toEqual([]);
  });
});

describe("resolvePythonModule", () => {
  const known = new Set([
    "src/app/matcher",
    "src/app/optimizer",
    "src/services/db",
    "src/util",
    "main",
  ]);

  it("resolves absolute in-repo imports and rejects stdlib/third-party", () => {
    expect(resolvePythonModule("src/app/matcher.py", "src.services.db", known)).toBe("src/services/db");
    expect(resolvePythonModule("src/app/matcher.py", "os.path", known)).toBeNull();
    expect(resolvePythonModule("src/app/matcher.py", "requests", known)).toBeNull();
    expect(resolvePythonModule("src/app/matcher.py", "pandas", known)).toBeNull();
  });

  it("resolves single-dot relative imports against the containing package", () => {
    expect(resolvePythonModule("src/app/matcher.py", ".optimizer", known)).toBe("src/app/optimizer");
  });

  it("walks up one package per extra leading dot", () => {
    expect(resolvePythonModule("src/app/matcher.py", "..services.db", known)).toBe("src/services/db");
    expect(resolvePythonModule("src/app/matcher.py", "..util", known)).toBe("src/util");
  });

  it("honours srcRoots so a `src`-layout absolute import resolves", () => {
    // `from app.matcher import x` with src/ on sys.path (pip install -e . / src layout)
    expect(resolvePythonModule("src/app/optimizer.py", "app.matcher", known, ["src"]))
      .toBe("src/app/matcher");
    // …and stays unresolved without the root, since it isn't repo-root relative
    expect(resolvePythonModule("src/app/optimizer.py", "app.matcher", known)).toBeNull();
  });
});

describe("moduleKey for Python", () => {
  it("strips .py/.pyi and collapses a package __init__ to the package itself", () => {
    expect(moduleKey("src/app/matcher.py")).toBe("src/app/matcher");
    expect(moduleKey("src/app/types.pyi")).toBe("src/app/types");
    expect(moduleKey("src/app/__init__.py")).toBe("src/app");
    // the TS behaviour it mirrors is unchanged
    expect(moduleKey("src/app/index.ts")).toBe("src/app");
  });
});
