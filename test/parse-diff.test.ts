import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "../src/parse-diff.js";

const SAMPLE = `diff --git a/src/server/routers/league.ts b/src/server/routers/league.ts
index 7e8df7b..9682de9 100644
--- a/src/server/routers/league.ts
+++ b/src/server/routers/league.ts
@@ -56,6 +56,12 @@ export const leagueRouter = router({
       leagueService.createCheckoutSession(ctx.userId, input.leagueId),
     ),

+  captureOrder: protectedProcedure
+    .input(z.object({ leagueId: z.string(), orderId: z.string() }))
+    .mutation(({ ctx, input }) =>
+      leagueService.captureOrder(ctx.userId, input.leagueId, input.orderId),
+    ),
+
   join: protectedProcedure
`;

describe("parseUnifiedDiff", () => {
  it("splits into per-file diff blocks with hunks", () => {
    const blocks = parseUnifiedDiff(SAMPLE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].path).toBe("src/server/routers/league.ts");
    expect(blocks[0].hunks).toHaveLength(1);
    expect(blocks[0].hunks[0].header).toContain("@@ -56,6 +56,12 @@");
    expect(blocks[0].hunks[0].lines.some((l) => l.startsWith("+  captureOrder"))).toBe(true);
  });
});
