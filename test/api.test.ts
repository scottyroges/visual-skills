import { describe, it, expect } from "vitest";
import { renderApi } from "../src/renderers/api.js";
import type { ApiBlock } from "../src/blocks.js";

describe("renderApi", () => {
  it("renders a contract table with change classes", () => {
    const block: ApiBlock = {
      type: "api", id: "api", title: "tRPC changes",
      procedures: [
        { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "{ leagueId: string; orderId: string }", change: "added" },
        { name: "league.createCheckoutSession", auth: "protected", kind: "mutation", input: "{ leagueId: string }", change: "changed" },
      ],
    };
    const html = renderApi(block);
    expect(html).toContain('class="vs-block vs-api"');
    expect(html).toContain("league.captureOrder");
    expect(html).toContain('data-change="added"');
    expect(html).toContain('data-change="changed"');
    expect(html).toContain("mutation");
    expect(html).toContain("protected");
  });
});
