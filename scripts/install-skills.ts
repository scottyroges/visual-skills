#!/usr/bin/env tsx
// Symlinks the repo's skills into <claude-root> so Claude Code discovers them from any repo:
//
//   <claude-root>/visual-skills        -> this clone          (the ONE machine-specific link)
//   <claude-root>/skills/<name>        -> ../visual-skills/skills/<name>   (relative, via root)
//
// Committed SKILL.md files resolve their tool location through the root link
// (VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"), so the installer
// NEVER writes into the repo. Because skill links are relative, moving the clone only requires
// re-pointing the root link — which this installer does on re-run. Skill links are conservative:
// a symlink is replaced only when it provably points at our content (legacy absolute form) or at
// nothing (dangling); foreign links and real files are never touched. A real file squatting on
// the root path aborts the install — continuing would resolve every skill through the wrong tree.
// Run with: npm run skills:install            (default claude root: ~/.claude)
//           npm run skills:install -- --dir /custom/.claude
import { symlink, mkdir, lstat, readlink, unlink, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dirname, join, resolve } from "node:path";

const SKILLS = ["visual-recap", "visual-doc", "visual-spec", "visual-atlas", "atlas-review", "quiz"];

export interface SkillLink {
  source: string;
  target: string;
}

/** Pure mapping: each skill name -> a RELATIVE symlink through the root link, so skill links
 *  never go stale when the clone moves. */
export function skillLinks(claudeRoot: string): SkillLink[] {
  return SKILLS.map((name) => ({
    source: join("..", "visual-skills", "skills", name),
    target: join(claudeRoot, "skills", name),
  }));
}

/** The stable indirection the committed SKILL.md files resolve through. */
export function rootLink(claudeRoot: string, repoRoot: string): SkillLink {
  return { source: repoRoot, target: join(claudeRoot, "visual-skills") };
}

export type LinkState =
  | { kind: "missing" }
  | { kind: "symlink"; current: string; resolvesToSource?: boolean | "dangling" }
  | { kind: "real" };

export type LinkAction = "create" | "already" | "repoint" | "skip" | "fatal";

/** Link policy.
 *  root: the <claudeRoot>/visual-skills name is unambiguously ours — re-point any symlink
 *  (moved clone / switching clones), but a real file/dir there is fatal: continuing would
 *  install skills that resolve through the wrong tree.
 *  skill: never touch a link without proof of ownership — replace only the canonical form's
 *  equivalents (a legacy absolute link resolving to the same real path) or a dangling link;
 *  anything else is foreign and skipped. Real files/dirs are always skipped. */
export function linkDecision(st: LinkState, source: string, mode: "root" | "skill"): LinkAction {
  if (st.kind === "missing") return "create";
  if (st.kind === "real") return mode === "root" ? "fatal" : "skip";
  if (st.current === source) return "already";
  if (mode === "root") return "repoint";
  return st.resolvesToSource === true || st.resolvesToSource === "dangling" ? "repoint" : "skip";
}

async function linkState(target: string, desiredReal: string | null): Promise<LinkState> {
  const st = await lstat(target).catch(() => null);
  if (!st) return { kind: "missing" };
  if (!st.isSymbolicLink()) return { kind: "real" };
  const current = await readlink(target);
  if (desiredReal === null) return { kind: "symlink", current };
  const actualReal = await realpath(target).catch(() => null);
  return {
    kind: "symlink",
    current,
    resolvesToSource: actualReal === null ? "dangling" : actualReal === desiredReal,
  };
}

async function applyLink(link: SkillLink, mode: "root" | "skill"): Promise<void> {
  const { source, target } = link;
  // For skill links, ownership = the existing link resolves to the same real path our
  // canonical relative link would (i.e. it already points at this clone's skill dir).
  const desiredReal =
    mode === "skill"
      ? await realpath(resolve(dirname(target), source)).catch(() => null)
      : null;
  const st = await linkState(target, desiredReal);
  switch (linkDecision(st, source, mode)) {
    case "create":
      await symlink(source, target);
      console.log(`linked: ${target} -> ${source}`);
      break;
    case "already":
      console.log(`already linked: ${target}`);
      break;
    case "repoint": {
      const old = st.kind === "symlink" ? st.current : "?";
      await unlink(target);
      await symlink(source, target);
      console.log(`re-pointed: ${target} -> ${source} (was ${old})`);
      break;
    }
    case "skip":
      console.warn(`skip (not ours — foreign link or real path): ${target}`);
      break;
    case "fatal":
      throw new Error(
        `${target} exists and is a real file or directory — the skills would resolve their ` +
        `tool location through it. Move it aside (or install with --dir elsewhere) and re-run.`,
      );
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { dir: { type: "string" } } });
  const defaultRoot = join(homedir(), ".claude");
  const claudeRoot = values.dir ?? defaultRoot;
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  await mkdir(join(claudeRoot, "skills"), { recursive: true });
  // Root link first — skill-link ownership checks resolve through it, and a fatal root
  // conflict must abort before any skill link is created.
  await applyLink(rootLink(claudeRoot, repoRoot), "root");
  for (const link of skillLinks(claudeRoot)) await applyLink(link, "skill");

  if (claudeRoot !== defaultRoot) {
    console.warn(
      `note: custom claude root — skills resolve VISUAL_SKILLS_DIR only when ` +
      `CLAUDE_CONFIG_DIR=${claudeRoot} is set in the shell where they run.`,
    );
  }
}

// Run main only when executed directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
