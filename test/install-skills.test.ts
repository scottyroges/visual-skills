import { describe, it, expect } from "vitest";
import { skillLinks } from "../scripts/install-skills.js";

describe("skillLinks", () => {
  it("maps both skill dirs from repo/skills into <claudeRoot>/skills", () => {
    const links = skillLinks("/home/me/.claude", "/repo");
    expect(links).toEqual([
      { source: "/repo/skills/visual-recap", target: "/home/me/.claude/skills/visual-recap" },
      { source: "/repo/skills/visual-plan", target: "/home/me/.claude/skills/visual-plan" },
    ]);
  });

  it("honors a custom claude root", () => {
    const links = skillLinks("/custom/cc", "/repo");
    expect(links.map((l) => l.target)).toEqual([
      "/custom/cc/skills/visual-recap",
      "/custom/cc/skills/visual-plan",
    ]);
  });
});
