#!/usr/bin/env tsx
// Symlinks the repo's skill dirs into <claude-root>/skills so Claude Code discovers
// them from any repo, and stamps each SKILL.md's VISUAL_SKILLS_DIR to THIS clone so the
// skills are portable (no hand-editing after a clone). Idempotent: never overwrites a real
// dir/file or a foreign symlink, and only rewrites a SKILL.md whose path actually differs.
// Run with: npm run skills:install            (default claude root: ~/.claude)
//           npm run skills:install -- --dir /custom/.claude
import { symlink, mkdir, lstat, readlink, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dirname, join, resolve } from "node:path";

const SKILLS = ["visual-recap", "visual-doc", "visual-spec", "visual-atlas"];

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

/** Rewrite every `VISUAL_SKILLS_DIR=<path>` so the skill points at this clone. Idempotent. */
export function stampToolDir(md: string, repoRoot: string): string {
  return md.replace(/VISUAL_SKILLS_DIR=\S+/g, () => `VISUAL_SKILLS_DIR=${repoRoot}`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { dir: { type: "string" } } });
  const claudeRoot = values.dir ?? join(homedir(), ".claude");
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const links = skillLinks(claudeRoot, repoRoot);
  await mkdir(join(claudeRoot, "skills"), { recursive: true });
  for (const { source, target } of links) {
    const st = await lstat(target).catch(() => null);
    if (st?.isSymbolicLink()) {
      const cur = await readlink(target);
      if (cur === source) console.log(`already linked: ${target}`);
      else console.warn(`skip (symlink points elsewhere): ${target} -> ${cur}`);
    } else if (st) {
      console.warn(`skip (exists, not a symlink): ${target}`);
    } else {
      await symlink(source, target);
      console.log(`linked: ${target} -> ${source}`);
    }

    // Make the skill portable: point VISUAL_SKILLS_DIR at this clone (no-op if already correct).
    const skillMd = join(source, "SKILL.md");
    const md = await readFile(skillMd, "utf8").catch(() => null);
    if (md != null) {
      const stamped = stampToolDir(md, repoRoot);
      if (stamped !== md) {
        await writeFile(skillMd, stamped);
        console.log(`stamped VISUAL_SKILLS_DIR=${repoRoot} in ${skillMd}`);
      }
    }
  }
}

// Run main only when executed directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
