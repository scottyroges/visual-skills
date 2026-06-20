import { decideTrade, type Team } from "../brain/gm.js";
export interface SimResult { score: number; }
export function simulateGame(home: Team): SimResult { decideTrade(); return { score: home ? 1 : 0 }; }
