import { describe, it, expect } from "vitest";
import { renderAnnotatedCode } from "../src/renderers/annotated-code.js";
import type { AnnotatedCodeBlock } from "../src/blocks.js";

const base = (annotations: { line: number; note: string }[]): AnnotatedCodeBlock => ({
  type: "annotated-code", id: "ac", title: "capture flow", lang: "ts",
  code: "const id = order.id;\nawait paypal.capture(id);\nreturn ok;",
  annotations,
});

describe("renderAnnotatedCode", () => {
  it("renders highlighted, line-numbered code with notes aligned to their lines", async () => {
    const html = await renderAnnotatedCode(base([{ line: 2, note: "calls PayPal to capture" }]));
    expect(html).toContain('class="vs-block vs-annotated"');
    expect(html).toContain('class="vs-lineno"');
    expect(html).toContain('style="color:'); // shiki ran
    expect(html).toContain("calls PayPal to capture");
  });

  it("skips out-of-range annotations and warns", async () => {
    const warnings: string[] = [];
    const html = await renderAnnotatedCode(base([{ line: 99, note: "nope" }]), (m) => warnings.push(m));
    expect(html).not.toContain("nope");
    expect(warnings.some((w) => w.includes("out of range"))).toBe(true);
  });

  it("stacks multiple notes on the same line", async () => {
    const html = await renderAnnotatedCode(
      base([{ line: 2, note: "first note" }, { line: 2, note: "second note" }]),
    );
    expect(html).toContain("first note");
    expect(html).toContain("second note");
  });
});
