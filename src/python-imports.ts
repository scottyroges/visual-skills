/**
 * Python counterpart to `imports.ts` (which is TS/JS via the TypeScript AST).
 *
 * There is no Python parser in this toolchain's dependency tree, so this is a line-oriented
 * scanner rather than a real AST walk. That is the same tradeoff the rest of the tool already
 * makes for non-TS inputs (see `prisma-schema.ts`): the atlas needs module edges and public
 * names, not semantic precision, and a wrong edge is cheaper here than a native dependency.
 *
 * Deliberate limitations (all degrade to "fewer edges", never wrong-looking output):
 *   - `importlib.import_module("a.b")` and other dynamic imports are not followed.
 *   - Conditional imports inside `try:`/`if TYPE_CHECKING:` are treated like any other import.
 *   - Star imports (`from .x import *`) contribute the module edge but no export names.
 */

/** Strings and comments would otherwise yield phantom imports/exports (e.g. an `import` inside a
 *  docstring). Blank them out while preserving line structure so line-anchored rules still hold. */
function stripStringsAndComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    // Triple-quoted blocks (docstrings): replace with newlines so line numbering survives.
    if ((ch === '"' || ch === "'") && source.startsWith(ch.repeat(3), i)) {
      const quote = ch.repeat(3);
      const end = source.indexOf(quote, i + 3);
      const body = end === -1 ? source.slice(i) : source.slice(i, end + 3);
      out += body.replace(/[^\n]/g, " ");
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && source[j] !== quote && source[j] !== "\n") {
        if (source[j] === "\\") j++; // skip escaped char
        j++;
      }
      out += " ".repeat(Math.min(j + 1, n) - i);
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Join lines continued with a trailing backslash or an open paren, so a wrapped
 *  `from x import (\n  a,\n  b,\n)` is scannable as one logical line. */
function logicalLines(source: string): string[] {
  const raw = source.split(/\r?\n/);
  const lines: string[] = [];
  let buf = "";
  let depth = 0;
  for (const line of raw) {
    buf = buf ? `${buf} ${line.trim()}` : line;
    for (const c of line) {
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
    }
    if (depth > 0 || /\\\s*$/.test(line)) {
      buf = buf.replace(/\\\s*$/, "");
      continue;
    }
    lines.push(buf);
    buf = "";
    depth = 0;
  }
  if (buf) lines.push(buf);
  return lines;
}

/**
 * Extract module specifiers from a Python source file, normalized to the dot-notation the
 * resolver in `dep-graph.ts` expects:
 *
 *   `import a.b.c`              → "a.b.c"
 *   `import a.b as ab, x.y`     → "a.b", "x.y"
 *   `from a.b import thing`     → "a.b"
 *   `from . import sibling`     → "."            (package-relative, resolved against the file)
 *   `from .mod import thing`    → ".mod"
 *   `from ..pkg.mod import x`   → "..pkg.mod"
 *
 * Leading dots are preserved verbatim — `resolvePythonModule` needs them to walk up packages.
 */
export function pythonImportsOf(source: string): string[] {
  const specs: string[] = [];
  for (const line of logicalLines(stripStringsAndComments(source))) {
    const text = line.trim();

    const from = /^from\s+((?:\.*)[A-Za-z0-9_.]*)\s+import\s+/.exec(text);
    if (from) {
      if (from[1]) specs.push(from[1]);
      continue;
    }

    const plain = /^import\s+(.+)$/.exec(text);
    if (plain) {
      for (const part of plain[1].split(",")) {
        // `a.b as ab` → `a.b`
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name)) specs.push(name);
      }
    }
  }
  return [...new Set(specs)];
}

/**
 * Extract the public names a Python module offers. Python has no `export` keyword, so this
 * follows the language's actual conventions, in priority order:
 *
 *   1. An explicit `__all__ = [...]` wins outright — that IS the module's declared public API.
 *   2. Otherwise: top-level (column-0) `def` / `async def` / `class`, plus top-level constant
 *      assignments, minus `_`-prefixed names (Python's private convention).
 *
 * Nested defs/methods are excluded by the column-0 rule — a method is not a module export.
 */
export function pythonExportsOf(source: string): string[] {
  const clean = stripStringsAndComments(source);

  // 1. Explicit __all__ declaration. Matched against the RAW source: the names live inside
  //    string literals, which `stripStringsAndComments` blanks out by design.
  const all = /^__all__\s*[:=]\s*[[(]([\s\S]*?)[\])]/m.exec(source);
  if (all) {
    const names = [...all[1].matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map((m) => m[1]);
    if (names.length) return [...new Set(names)];
  }

  const names: string[] = [];
  for (const line of clean.split(/\r?\n/)) {
    // Column 0 only: top-level declarations, not methods or closures.
    const def = /^(?:async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
    if (def) {
      if (!def[1].startsWith("_")) names.push(def[1]);
      continue;
    }
    // Top-level assignment: module constants/singletons (`RATE = 1`, `engine: Engine = ...`).
    const assign = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=(?!=)/.exec(line);
    if (assign && !assign[1].startsWith("_")) names.push(assign[1]);
  }
  return [...new Set(names)];
}
