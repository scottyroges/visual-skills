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

  it("derives auth from any <x>Procedure builder", () => {
    const src = `
import { router, publicProcedure, adminProcedure } from "@/server/trpc";
export const adminRouter = router({
  list: adminProcedure.query(() => svc.list()),
  ping: publicProcedure.query(() => "pong"),
});
`;
    const byName = Object.fromEntries(parseRouter(src, "admin").map((p) => [p.name, p]));
    expect(byName["admin.list"].auth).toBe("admin");
    expect(byName["admin.ping"].auth).toBe("public");
  });
});
