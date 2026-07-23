# Design: installer indirection — stable symlink instead of SKILL.md stamping

**Date:** 2026-07-22
**Status:** Approved design, pre-implementation

## Problem

`npm run skills:install` rewrites `VISUAL_SKILLS_DIR=<abs path>` inside every symlinked
SKILL.md (`stampToolDir`), permanently dirtying six committed files in the working tree.
Consequences: recurring `git status` noise, `git pull` refuses to merge when upstream touches a
stamped SKILL.md, and one machine-specific path was accidentally committed (caught in review).

## Design

### 1. Stable root symlink

The installer creates `<claudeRoot>/visual-skills → <repoRoot>` alongside the six skill links.
Committed SKILL.md files reference the stable path and are never rewritten:

    VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"

Valid in bash and zsh; expanded at command time in the shell where the skill runs. All
downstream `$VISUAL_SKILLS_DIR` usages in skill bodies are unchanged.

### 2. Link semantics (all seven links — six skills + root)

Decided by a pure, testable function `linkDecision(state, source)`:

| Existing state at target path | Action |
|---|---|
| nothing | **create** |
| symlink → already `source` | **already** (no-op) |
| symlink → anything else | **repoint** (unlink + relink; log the old target) |
| real file or directory | **skip** with warning (genuinely foreign) |

Repointing symlinks unconditionally (not only dead ones) is deliberate: a moved clone leaves
all seven links pointing at the old path, and one `skills:install` re-run must recover them.
Real files/dirs are never touched.

### 3. Installer changes (`scripts/install-skills.ts`)

- New pure `rootLink(claudeRoot, repoRoot): SkillLink` → `{ source: repoRoot, target: join(claudeRoot, "visual-skills") }`.
- New pure `linkDecision(...)` implementing the table above; `main()` applies it to all links.
- **Delete `stampToolDir` and the stamping loop** — the installer never writes into the repo.
- When `--dir` is custom (≠ `~/.claude`): print a note that skills resolve `VISUAL_SKILLS_DIR`
  only if `CLAUDE_CONFIG_DIR` is set to that dir in the shell where skills run.
- Header comment rewritten to describe the indirection.

### 4. SKILL.md edits (all six skills)

Tool-location line becomes the stable form above; the surrounding comment changes from
"(edit if the repo moves)" to "(resolved through the installer's `~/.claude/visual-skills`
symlink — re-run `npm run skills:install` if the repo moves)".

### 5. Guard test

`test/skill-docs.test.ts` gains a case asserting every `skills/*/SKILL.md` contains the exact
stable line and no absolute machine path (`/home/`, `/Users/`) — a regression guard against
future stamping or hand-edits.

### 6. README

Setup step 3's "records wherever this lives" wording → describes the stable symlink; add the
`CLAUDE_CONFIG_DIR` caveat for custom `--dir` installs.

### 7. Migration on an existing machine

Restore the locally-stamped SKILL.md files (`git checkout`), re-run the installer (creates the
root link; skill links report "already linked"), smoke-verify resolution:
`zsh -c 'VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"; ls "$VISUAL_SKILLS_DIR/bin"'`.

## User lifecycle (the flow this buys)

- **Install:** seven symlinks created, zero repo writes, `git status` clean forever.
- **Pull an update:** live immediately through the symlinks; re-run the installer only when an
  update adds a new skill directory.
- **Move the clone:** one `skills:install` re-run repoints all seven links.
- **Custom config dir:** works iff `CLAUDE_CONFIG_DIR` is set at runtime; installer says so.

## Out of scope

- Copy-and-stamp installation mode (rejected: stale copies until reinstall).
- Renaming `VISUAL_SKILLS_DIR` (all skill bodies already use it).
- Windows-native (non-WSL) symlink support.

## Known tradeoff

SKILL.md no longer contains a literal absolute path, so Claude reading a skill must expand
`$HOME`/`CLAUDE_CONFIG_DIR` (or run commands through the shell, which all skills already do)
rather than copying a concrete path out of the file. Accepted: skill workflows are shell-first.
