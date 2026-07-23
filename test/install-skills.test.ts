import { describe, it, expect } from "vitest";
import { skillLinks, rootLink, linkDecision, type LinkState } from "../scripts/install-skills.js";

describe("skillLinks", () => {
  it("maps every skill dir from repo/skills into <claudeRoot>/skills", () => {
    const links = skillLinks("/home/me/.claude", "/repo");
    expect(links).toEqual([
      { source: "/repo/skills/visual-recap", target: "/home/me/.claude/skills/visual-recap" },
      { source: "/repo/skills/visual-doc", target: "/home/me/.claude/skills/visual-doc" },
      { source: "/repo/skills/visual-spec", target: "/home/me/.claude/skills/visual-spec" },
      { source: "/repo/skills/visual-atlas", target: "/home/me/.claude/skills/visual-atlas" },
      { source: "/repo/skills/atlas-review", target: "/home/me/.claude/skills/atlas-review" },
      { source: "/repo/skills/quiz", target: "/home/me/.claude/skills/quiz" },
    ]);
  });

  it("honors a custom claude root", () => {
    const links = skillLinks("/custom/cc", "/repo");
    expect(links.map((l) => l.target)).toEqual([
      "/custom/cc/skills/visual-recap",
      "/custom/cc/skills/visual-doc",
      "/custom/cc/skills/visual-spec",
      "/custom/cc/skills/visual-atlas",
      "/custom/cc/skills/atlas-review",
      "/custom/cc/skills/quiz",
    ]);
  });
});

describe("rootLink", () => {
  it("maps the repo root to the stable <claudeRoot>/visual-skills path", () => {
    expect(rootLink("/home/me/.claude", "/repo")).toEqual({
      source: "/repo",
      target: "/home/me/.claude/visual-skills",
    });
  });
});

describe("linkDecision", () => {
  const source = "/repo/skills/quiz";

  it("creates when nothing exists at the target", () => {
    const st: LinkState = { kind: "missing" };
    expect(linkDecision(st, source)).toBe("create");
  });

  it("is a no-op when the symlink already points at the source", () => {
    const st: LinkState = { kind: "symlink", current: source };
    expect(linkDecision(st, source)).toBe("already");
  });

  it("repoints a symlink that points anywhere else (moved-clone recovery)", () => {
    const st: LinkState = { kind: "symlink", current: "/old/clone/skills/quiz" };
    expect(linkDecision(st, source)).toBe("repoint");
  });

  it("never touches a real file or directory", () => {
    const st: LinkState = { kind: "real" };
    expect(linkDecision(st, source)).toBe("skip");
  });
});
