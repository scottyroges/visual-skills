import type { Team } from "../brain/gm.js";
export interface SimResult { score: number; }
export function simulateGame(home: Team): SimResult { return { score: 0 }; }
