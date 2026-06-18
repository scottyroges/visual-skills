import { describe, it, expect } from "vitest";
import { renderProse } from "../src/renderers/prose.js";

describe("renderProse", () => {
  it("renders markdown to an HTML block fragment", async () => {
    const html = await renderProse({ type: "prose", id: "p", markdown: "# Hi\n\nSome **bold**." });
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('class="vs-block vs-prose"');
  });

  it("syntax-highlights fenced code and the highlighting survives sanitization", async () => {
    const md = "```ts\nconst x = 1;\n```";
    const html = await renderProse({ type: "prose", id: "p2", markdown: md });
    expect(html).toContain('class="shiki'); // shiki <pre> survived
    expect(html).toContain('style="color:'); // inline token color survived
  });

  it("strips scripts, event handlers, and javascript: URLs", async () => {
    const md =
      "Hello\n\n<script>alert(1)</script>\n\n" +
      '<a href="javascript:alert(2)" onclick="alert(3)">click</a>';
    const html = await renderProse({ type: "prose", id: "p3", markdown: md });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Hello");
  });

  it("renders the title as a heading when present", async () => {
    const html = await renderProse({ type: "prose", id: "s", title: "Summary", markdown: "body" });
    expect(html).toContain("<h2>Summary</h2>");
  });

  it("renders no heading when the title is absent", async () => {
    const html = await renderProse({ type: "prose", id: "s", markdown: "body" });
    expect(html).not.toContain("<h2");
  });
});
