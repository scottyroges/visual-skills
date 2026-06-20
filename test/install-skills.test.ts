import { describe, it, expect } from "vitest";
import { skillLinks } from "../scripts/install-skills.js";

describe("skillLinks", () => {
  it("maps every skill dir from repo/skills into <claudeRoot>/skills", () => {
    const links = skillLinks("/home/me/.claude", "/repo");
    expect(links).toEqual([
      { source: "/repo/skills/visual-recap", target: "/home/me/.claude/skills/visual-recap" },
      { source: "/repo/skills/visual-plan", target: "/home/me/.claude/skills/visual-plan" },
      { source: "/repo/skills/visual-spec", target: "/home/me/.claude/skills/visual-spec" },
      { source: "/repo/skills/visual-atlas", target: "/home/me/.claude/skills/visual-atlas" },
    ]);
  });

  it("honors a custom claude root", () => {
    const links = skillLinks("/custom/cc", "/repo");
    expect(links.map((l) => l.target)).toEqual([
      "/custom/cc/skills/visual-recap",
      "/custom/cc/skills/visual-plan",
      "/custom/cc/skills/visual-spec",
      "/custom/cc/skills/visual-atlas",
    ]);
  });
});
