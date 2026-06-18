#!/usr/bin/env tsx
// Symlinks the repo's skill dirs into <claude-root>/skills so Claude Code discovers
// them from any repo. Idempotent: never overwrites a real dir/file or a foreign symlink.
// Run with: npm run skills:install            (default claude root: ~/.claude)
//           npm run skills:install -- --dir /custom/.claude
import { symlink, mkdir, lstat, readlink } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dirname, join } from "node:path";

const SKILLS = ["visual-recap", "visual-plan"];

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

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { dir: { type: "string" } } });
  const claudeRoot = values.dir ?? join(homedir(), ".claude");
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const links = skillLinks(claudeRoot, repoRoot);
  await mkdir(join(claudeRoot, "skills"), { recursive: true });
  for (const { source, target } of links) {
    const st = await lstat(target).catch(() => null);
    if (st?.isSymbolicLink()) {
      const cur = await readlink(target);
      if (cur === source) console.log(`already linked: ${target}`);
      else console.warn(`skip (symlink points elsewhere): ${target} -> ${cur}`);
      continue;
    }
    if (st) {
      console.warn(`skip (exists, not a symlink): ${target}`);
      continue;
    }
    await symlink(source, target);
    console.log(`linked: ${target} -> ${source}`);
  }
}

// Run main only when executed directly (not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
