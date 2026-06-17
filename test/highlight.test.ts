import { describe, it, expect } from "vitest";
import { highlightCode, highlightLines, langFromPath } from "../src/highlight.js";

describe("langFromPath", () => {
  it("maps known extensions to shiki langs and unknown to text", () => {
    expect(langFromPath("src/server/routers/league.ts")).toBe("ts");
    expect(langFromPath("prisma/schema.prisma")).toBe("prisma");
    expect(langFromPath("query.sql")).toBe("sql");
    expect(langFromPath("notes.unknownext")).toBe("text");
    expect(langFromPath("Makefile")).toBe("text");
  });
});

describe("highlightCode", () => {
  it("highlights a known language with inline color styles", async () => {
    const html = await highlightCode("const x = 1;", "ts");
    expect(html).toContain("<pre");
    expect(html).toContain("style=\"color:");
  });

  it("falls back to escaped plain text for an unknown language and warns", async () => {
    const warnings: string[] = [];
    const html = await highlightCode("a < b && c > d", "text", (m) => warnings.push(m));
    expect(html).toContain("shiki-plain");
    expect(html).toContain("a &lt; b &amp;&amp; c &gt; d");
    expect(html).not.toContain("<pre class=\"shiki ");
  });
});

describe("highlightLines", () => {
  it("returns one entry per input line for a known language", async () => {
    const lines = await highlightLines("const a = 1;\nconst b = 2;\nconst c = 3;", "ts");
    expect(lines).not.toBeNull();
    expect(lines!.length).toBe(3);
    expect(lines!.join("")).toContain("style=\"color:");
  });

  it("returns null for an unloaded language so callers can fall back", async () => {
    const lines = await highlightLines("plain text line", "text");
    expect(lines).toBeNull();
  });
});
