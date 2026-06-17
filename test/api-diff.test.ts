import { describe, it, expect } from "vitest";
import { diffProcedures } from "../src/api-diff.js";
import type { ApiProcedure } from "../src/blocks.js";

const before: ApiProcedure[] = [
  { name: "league.preview", auth: "public", kind: "query", input: "{ inviteCode }" },
  { name: "league.createCheckoutSession", auth: "protected", kind: "mutation", input: "{ leagueId }" },
];
const after: ApiProcedure[] = [
  { name: "league.preview", auth: "public", kind: "query", input: "{ inviteCode }" },
  { name: "league.createCheckoutSession", auth: "protected", kind: "mutation", input: "{ leagueId }" },
  { name: "league.captureOrder", auth: "protected", kind: "mutation", input: "{ leagueId, orderId }" },
];

describe("diffProcedures", () => {
  it("marks added/removed/changed and omits unchanged", () => {
    const block = diffProcedures(before, after, "tRPC changes");
    const byName = Object.fromEntries(block.procedures.map((p) => [p.name, p.change]));
    expect(byName["league.captureOrder"]).toBe("added");
    expect(byName["league.preview"]).toBeUndefined();
    expect(block.procedures.every((p) => p.change)).toBe(true);
  });
});
