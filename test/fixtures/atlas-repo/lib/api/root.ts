import { simulateGame } from "../sim/engine.js";
export const appRouter = router({
  play: publicProcedure.input(z.object({ id: z.string() })).mutation(() => simulateGame({ name: "x" })),
});
