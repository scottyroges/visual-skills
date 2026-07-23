import { describe, it, expect } from "vitest";
import { skillLinks, rootLink, linkDecision, type LinkState } from "../scripts/install-skills.js";

describe("skillLinks", () => {
  it("maps every skill to a RELATIVE link through the root symlink (never stale on clone move)", () => {
    const links = skillLinks("/home/me/.claude");
    expect(links).toEqual([
      { source: "../visual-skills/skills/visual-recap", target: "/home/me/.claude/skills/visual-recap" },
      { source: "../visual-skills/skills/visual-doc", target: "/home/me/.claude/skills/visual-doc" },
      { source: "../visual-skills/skills/visual-spec", target: "/home/me/.claude/skills/visual-spec" },
      { source: "../visual-skills/skills/visual-atlas", target: "/home/me/.claude/skills/visual-atlas" },
      { source: "../visual-skills/skills/atlas-review", target: "/home/me/.claude/skills/atlas-review" },
      { source: "../visual-skills/skills/quiz", target: "/home/me/.claude/skills/quiz" },
    ]);
  });

  it("honors a custom claude root", () => {
    expect(skillLinks("/custom/cc").map((l) => l.target)).toEqual([
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

describe("linkDecision — root link (the one machine-specific link, ours by name)", () => {
  const source = "/repo";

  it("creates when missing; no-op when already correct", () => {
    expect(linkDecision({ kind: "missing" }, source, "root")).toBe("create");
    expect(linkDecision({ kind: "symlink", current: source }, source, "root")).toBe("already");
  });

  it("repoints a root symlink aimed anywhere else (moved clone / switching clones)", () => {
    const st: LinkState = { kind: "symlink", current: "/old/clone" };
    expect(linkDecision(st, source, "root")).toBe("repoint");
  });

  it("is FATAL when a real file or directory squats on the root path — a warn-and-continue install would resolve every skill through the wrong tree", () => {
    expect(linkDecision({ kind: "real" }, source, "root")).toBe("fatal");
  });
});

describe("linkDecision — skill links (conservative: never touch foreign links)", () => {
  const source = "../visual-skills/skills/quiz";

  it("creates when missing; no-op when already the canonical relative link", () => {
    expect(linkDecision({ kind: "missing" }, source, "skill")).toBe("create");
    expect(linkDecision({ kind: "symlink", current: source }, source, "skill")).toBe("already");
  });

  it("normalizes a legacy absolute link that resolves to the same real path (old-installer migration)", () => {
    const st: LinkState = { kind: "symlink", current: "/home/me/clone/skills/quiz", resolvesToSource: true };
    expect(linkDecision(st, source, "skill")).toBe("repoint");
  });

  it("skips a dangling symlink — 'points at nothing' is not ownership proof (unmounted drive, temporarily absent checkout)", () => {
    const st: LinkState = { kind: "symlink", current: "/deleted/clone/skills/quiz", resolvesToSource: "dangling" };
    expect(linkDecision(st, source, "skill")).toBe("skip");
  });

  it("skips a symlink that resolves somewhere else — proof of ownership required to replace", () => {
    const st: LinkState = { kind: "symlink", current: "/their/fork/skills/quiz", resolvesToSource: false };
    expect(linkDecision(st, source, "skill")).toBe("skip");
  });

  it("skips a real file or directory", () => {
    expect(linkDecision({ kind: "real" }, source, "skill")).toBe("skip");
  });
});
