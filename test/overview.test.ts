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

  it("appends a trailing arrow link for an href (not a whole-bullet wrap), renders inline code, leaves no-href plain", async () => {
    const html = await renderOverview(base);
    expect(html).toContain('class="vs-point-link" href="#diff-0"'); // trailing link, not the whole li
    expect(html).toContain("→");                               // the arrow glyph
    expect(html).toContain("<code>capture</code>");
    expect(html).toContain("<li>no link here</li>");
  });

  it("uses the author's inline markdown link and adds NO trailing arrow when text already links", async () => {
    const html = await renderOverview({
      type: "overview", id: "ov2", headline: "H",
      points: [{ text: "see the [router](#diff-3)", href: "#diff-0" }],
    });
    expect(html).toContain('href="#diff-3"');     // author's inline link is used
    expect(html).not.toContain('href="#diff-0"'); // no redundant trailing arrow
    expect(html).not.toContain("vs-point-link");
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
