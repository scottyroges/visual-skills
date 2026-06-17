import { describe, it, expect } from "vitest";
import { parseRouter } from "../src/trpc-parse.js";

const SRC = `
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
export const leagueRouter = router({
  preview: publicProcedure
    .input(z.object({ inviteCode: z.string().min(1) }))
    .query(({ input }) => svc.preview(input.inviteCode)),
  captureOrder: protectedProcedure
    .input(z.object({ leagueId: z.string(), orderId: z.string() }))
    .mutation(({ ctx, input }) => svc.capture(input)),
});
`;

describe("parseRouter", () => {
  it("extracts procedures with auth, kind, and input source", () => {
    const procs = parseRouter(SRC, "league");
    const byName = Object.fromEntries(procs.map((p) => [p.name, p]));
    expect(byName["league.preview"].auth).toBe("public");
    expect(byName["league.preview"].kind).toBe("query");
    expect(byName["league.captureOrder"].auth).toBe("protected");
    expect(byName["league.captureOrder"].kind).toBe("mutation");
    expect(byName["league.captureOrder"].input).toContain("orderId");
  });
});
