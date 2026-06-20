import { simulateGame } from "../sim/engine.js";
import type { Team } from "../brain/gm.js"; // type-only — must NOT create an api->brain edge
const seed: Team = { name: "x" };
export const appRouter = router({
  play: publicProcedure.input(z.object({ id: z.string() })).mutation(() => simulateGame({ name: "x" })),
});
