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
