import { describe, it, expect } from "vitest";
import { escapeHtml } from "../src/html.js";

describe("escapeHtml", () => {
  it("escapes the five XML-significant characters", () => {
    expect(escapeHtml(`<a href="x" & 'y'>`)).toBe(
      "&lt;a href=&quot;x&quot; &amp; &#39;y&#39;&gt;",
    );
  });
});
