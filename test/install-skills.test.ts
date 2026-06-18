import { describe, it, expect } from "vitest";
import { skillLinks } from "../scripts/install-skills.js";

describe("skillLinks", () => {
  it("maps both skill dirs from repo/skills into ~/.claude/skills", () => {
    const links = skillLinks("/home/me", "/repo");
    expect(links).toEqual([
      { source: "/repo/skills/visual-recap", target: "/home/me/.claude/skills/visual-recap" },
      { source: "/repo/skills/visual-plan", target: "/home/me/.claude/skills/visual-plan" },
    ]);
  });
});
