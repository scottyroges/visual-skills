import { describe, it, expect } from "vitest";
import { renderProse } from "../src/renderers/prose.js";

describe("renderProse", () => {
  it("renders markdown to an HTML block fragment", () => {
    const html = renderProse({ type: "prose", id: "p", markdown: "# Hi\n\nSome **bold**." });
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('class="vs-block vs-prose"');
  });
});
