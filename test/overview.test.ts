import { describe, it, expect } from "vitest";
import { renderOverview } from "../src/renderers/overview.js";
import type { OverviewBlock } from "../src/blocks.js";

const base: OverviewBlock = {
  type: "overview", id: "ov",
  headline: "Add **PayPal** capture",
  points: [
    { text: "new `capture` route", href: "#diff-0" },
    { text: "no link here" },
    { text: "bad link", href: "javascript:alert(1)" },
  ],
};

describe("renderOverview", () => {
  it("renders the headline as inline markdown (no <p>)", async () => {
    const html = await renderOverview(base);
    expect(html).toContain('class="vs-overview-headline"');
    expect(html).toContain("<strong>PayPal</strong>");
    expect(html).not.toContain("<p>");
  });

  it("links a point with a safe #fragment href, renders inline code, leaves no-href plain", async () => {
    const html = await renderOverview(base);
    expect(html).toContain('<a href="#diff-0">');
    expect(html).toContain("<code>capture</code>");
    expect(html).toContain("<li>no link here</li>");
  });

  it("does NOT linkify an unsafe javascript: href (renders plain text)", async () => {
    const html = await renderOverview(base);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<li>bad link</li>");
  });

  it("places the diagram fragment between the headline and the points", async () => {
    const html = await renderOverview(base, "<div class='vs-overview-diagram'>DIAG</div>");
    const headIdx = html.indexOf("vs-overview-headline");
    const diagIdx = html.indexOf("vs-overview-diagram");
    const pointsIdx = html.indexOf("vs-overview-points");
    expect(headIdx).toBeGreaterThanOrEqual(0);
    expect(diagIdx).toBeGreaterThan(headIdx);
    expect(pointsIdx).toBeGreaterThan(diagIdx);
  });
});
