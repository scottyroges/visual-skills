#!/usr/bin/env tsx
// Symlinks the repo's skill dirs into <claude-root>/skills so Claude Code discovers them from
// any repo, plus one stable root symlink <claude-root>/visual-skills -> this clone. Committed
// SKILL.md files reference that stable path (VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"),
// so the installer NEVER writes into the repo. Idempotent: re-points its own stale symlinks
// (moved-clone recovery) but never overwrites a real file or directory.
// Run with: npm run skills:install            (default claude root: ~/.claude)
//           npm run skills:install -- --dir /custom/.claude
import { symlink, mkdir, lstat, readlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dirname, join, resolve } from "node:path";

const SKILLS = ["visual-recap", "visual-doc", "visual-spec", "visual-atlas", "atlas-review", "quiz"];

export interface SkillLink {
  source: string;
  target: string;
}

/** Pure mapping: each repo skill dir -> its <claudeRoot>/skills symlink target. */
export function skillLinks(claudeRoot: string, repoRoot: string): SkillLink[] {
  return SKILLS.map((name) => ({
    source: join(repoRoot, "skills", name),
    target: join(claudeRoot, "skills", name),
  }));
}

/** The stable indirection the committed SKILL.md files resolve through. */
export function rootLink(claudeRoot: string, repoRoot: string): SkillLink {
  return { source: repoRoot, target: join(claudeRoot, "visual-skills") };
}

export type LinkState =
  | { kind: "missing" }
  | { kind: "symlink"; current: string }
  | { kind: "real" };

export type LinkAction = "create" | "already" | "repoint" | "skip";

/** Link policy: create when missing, no-op when correct, re-point any other symlink
 *  (a moved clone leaves every link stale — one re-run must recover them all), and
 *  never touch a real file or directory. */
export function linkDecision(st: LinkState, source: string): LinkAction {
  if (st.kind === "missing") return "create";
  if (st.kind === "real") return "skip";
  return st.current === source ? "already" : "repoint";
}

async function linkState(target: string): Promise<LinkState> {
  const st = await lstat(target).catch(() => null);
  if (!st) return { kind: "missing" };
  if (st.isSymbolicLink()) return { kind: "symlink", current: await readlink(target) };
  return { kind: "real" };
}

async function applyLink({ source, target }: SkillLink): Promise<void> {
  const st = await linkState(target);
  switch (linkDecision(st, source)) {
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
      console.warn(`skip (exists, not a symlink): ${target}`);
      break;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { dir: { type: "string" } } });
  const defaultRoot = join(homedir(), ".claude");
  const claudeRoot = values.dir ?? defaultRoot;
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  await mkdir(join(claudeRoot, "skills"), { recursive: true });
  await applyLink(rootLink(claudeRoot, repoRoot));
  for (const link of skillLinks(claudeRoot, repoRoot)) await applyLink(link);

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
