import { describe, it, expect } from "vitest";
import { skillLinks, stampToolDir } from "../scripts/install-skills.js";

describe("stampToolDir", () => {
  it("rewrites VISUAL_SKILLS_DIR to the given clone path", () => {
    const md = "Tool location:\n\n    VISUAL_SKILLS_DIR=/Users/orig/Projects/visual-skills\n\nrest";
    expect(stampToolDir(md, "/home/friend/code/visual-skills")).toContain(
      "VISUAL_SKILLS_DIR=/home/friend/code/visual-skills",
    );
    expect(stampToolDir(md, "/home/friend/code/visual-skills")).not.toContain("/Users/orig/");
  });

  it("is idempotent and leaves other content untouched", () => {
    const md = "x\n    VISUAL_SKILLS_DIR=/a/b\n`$VISUAL_SKILLS_DIR/bin/atlas.ts`\n";
    const once = stampToolDir(md, "/a/b");
    expect(once).toBe(md);                                  // already correct → unchanged
    expect(stampToolDir(md, "/a/b")).toContain("`$VISUAL_SKILLS_DIR/bin/atlas.ts`"); // usages untouched
  });
});

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
