import { describe, it, expect } from "vitest";
import { renderMarkdown, renderInlineMarkdown } from "../src/renderers/markdown.js";

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

describe("renderInlineMarkdown", () => {
  it("renders inline markdown without a <p> wrapper", async () => {
    const html = await renderInlineMarkdown("uses `foo` and **bold**");
    expect(html).toContain("<code>foo</code>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<p>");
  });

  it("keeps a safe #fragment link", async () => {
    const html = await renderInlineMarkdown("see [the diff](#diff-0)");
    expect(html).toContain('href="#diff-0"');
  });

  it("strips scripts and javascript: urls", async () => {
    const html = await renderInlineMarkdown("[x](javascript:alert(1)) <script>bad()</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
