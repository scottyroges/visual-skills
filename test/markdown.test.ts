import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/renderers/markdown.js";

describe("renderMarkdown", () => {
  it("keeps a #fragment cross-link (for in-page anchors)", async () => {
    const html = await renderMarkdown("see [there](#diff-3)");
    expect(html).toContain('href="#diff-3"');
  });

  it("strips scripts, event handlers, and javascript: URLs", async () => {
    const html = await renderMarkdown('<script>x</script>\n\n<a href="javascript:1" onclick="y">z</a>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
  });

  it("syntax-highlights fenced code", async () => {
    const html = await renderMarkdown("```ts\nconst x = 1;\n```");
    expect(html).toContain('class="shiki');
    expect(html).toContain('style="color:');
  });
});
