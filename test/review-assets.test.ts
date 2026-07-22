import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const asset = (n: string) => fileURLToPath(new URL("../assets/" + n, import.meta.url));

describe("review assets", () => {
  it("review.css carries the variant-C design system (tokens + key components)", async () => {
    const css = await readFile(asset("review.css"), "utf8");
    expect(css).toContain("--accent: #2563eb");
    expect(css).toContain("--ink-faint: #646b75");          // AA-corrected token
    expect(css).toMatch(/\.topbar\s*\{/);
    expect(css).toMatch(/\.sidebar\s*\{/);
    expect(css).toMatch(/\.tldr-card\s*\{/);
    expect(css).toMatch(/\.diff-pre\s*\{/);                 // line-numbered diff
    expect(css).toMatch(/\.chapter-no\s*\{/);               // chapter number pill
    expect(css).toContain("prefers-reduced-motion");
  });
  it("review-viewer.js carries sidebar/scroll-spy/zoom behavior", async () => {
    const js = await readFile(asset("review-viewer.js"), "utf8");
    expect(js).toContain("zoom-overlay");
    expect(js).toContain("progress-step");                  // scroll-spy on the rail
    expect(js).toContain("sidebar");
    expect(js).not.toContain("<script");                    // raw JS, not an HTML block
  });
});

describe("dark-mode surface variables", () => {
  it("theme.css defines dark values for the shared surface variables", async () => {
    const css = await readFile(asset("theme.css"), "utf8");
    for (const v of ["--card", "--code-bg", "--add-bg", "--del-bg", "--paper", "--ink"]) {
      expect(css).toContain(v);
    }
  });
  it("no card/pill hex leaks remain unthemed in template.css", async () => {
    const css = await readFile(asset("template.css"), "utf8");
    // The hex still appears exactly once each as the light default inside :root{}
    // (that default is what keeps light mode pixel-identical) — but every rule body
    // that used to paint with the literal must now reference the variable instead.
    expect(css).toMatch(/--add-bg:\s*#e6ffec/);
    expect(css).toMatch(/--del-bg:\s*#ffebe9/);
    expect(css).not.toMatch(/background:\s*#e6ffec/);
    expect(css).not.toMatch(/background:\s*#ffebe9/);
  });

  it("theme.css dark block overrides the review design-token chrome", async () => {
    const css = await readFile(asset("theme.css"), "utf8");
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    for (const v of ["--bg", "--panel", "--border", "--accent", "--remove", "--change", "--tier-engine", "--reused", "--good"]) {
      expect(dark).toContain(v);
    }
  });

  it("review.css diff-renderer colors are themable (no baked light literals)", async () => {
    const css = await readFile(asset("review.css"), "utf8");
    // The hex still appears exactly once each as the light default inside :root{}
    // (that default is what keeps light mode pixel-identical) — but every rule body
    // that used to paint with the literal must now reference the variable instead.
    expect(css).toMatch(/--diff-add-bg:\s*#e9f7ee/);
    expect(css).toMatch(/--diff-del-bg:\s*#fdecec/);
    expect(css).not.toMatch(/background:\s*#e9f7ee/);
    expect(css).not.toMatch(/background:\s*#fdecec/);
  });
  it("theme.css defines dark diff-renderer values", async () => {
    const css = await readFile(asset("theme.css"), "utf8");
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    for (const v of ["--diff-add-bg", "--diff-del-fg", "--syntax-kw"]) expect(dark).toContain(v);
  });

  it("theme.css overrides the one-off light chrome constructs fixed in the final review pass", async () => {
    const css = await readFile(asset("theme.css"), "utf8");
    // Guards against a NEW unthemed light-background hex leaking back in for these
    // specific selectors: each must carry an explicit dark override.
    for (const selector of [".vs-overview", ".vs-group", ".risk-r"]) {
      const re = new RegExp(`\\[data-theme="dark"\\][^{]*\\${selector}[^{]*\\{`);
      expect(css).toMatch(re);
    }
  });

  it("theme.css gives every diagram container a light card in dark mode", async () => {
    const css = await readFile(asset("theme.css"), "utf8");
    // Recap/doc pages (template.css): .vs-diagram, .vs-diff-diagram, .vs-overview-diagram.
    // Review/spec/atlas pages (review.css, via sections.ts renderDiagramCard / assemble-atlas.ts): .diagram-box.
    for (const selector of [".vs-diagram", ".vs-diff-diagram", ".vs-overview-diagram", ".diagram-box"]) {
      const re = new RegExp(
        `\\[data-theme="dark"\\][^{]*\\${selector}[^{]*\\{[^}]*background:\\s*#faf9f6`,
      );
      expect(css).toMatch(re);
    }
  });
});
