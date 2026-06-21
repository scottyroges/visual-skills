# Visual Skills M4 — Claude Code Skills (`visual-plan` + `visual-recap`) Design

**Date:** 2026-06-17
**Status:** Approved
**Builds on:** M0–M3 (the `plan` and `recap` CLIs and all renderers/producers)

## Goal

Make the tool invokable from Claude Code in any repo by adding two skills —
`visual-recap` (turn a git target into a readable HTML recap) and `visual-plan` (turn a
spec/plan into a grounded HTML plan doc) — version-controlled in this repo and installed
globally via symlink.

## Decisions

1. **Location + discovery.** The two `SKILL.md` files live in the repo under `skills/`,
   and are made available everywhere by symlinking each skill directory into
   `~/.claude/skills/` (matches the user's existing `coding-agent-configs` pattern). A
   `scripts/install-skills.mjs` (`npm run skills:install`) creates the symlinks
   idempotently.
2. **CLI invocation.** The skills call the CLIs by **absolute repo path**, held in one
   clearly-marked constant line per skill. No `npm link` / global PATH state.
3. **`visual-plan` authoring depth.** A structured recipe: the skill documents each Block
   type with a concrete JSON example and a content→block mapping, and instructs the agent
   to read `src/blocks.ts` as the authoritative schema and ground references in the real
   target repo.
4. **Conservative auto-trigger.** Each skill's `description` triggers on an explicit
   "render/visualize this as HTML" intent — not aggressively on any PR/spec mention.

## Architecture / Components

### `skills/visual-recap/SKILL.md`

Frontmatter:
- `name: visual-recap`
- `description:` triggers when the user wants to render/visualize a PR, commit, branch, or
  diff as a self-contained, readable HTML recap.

Body (thin wrapper — mostly intent→flag mapping):
1. Determine the **target repo** (default: the current working directory) and the
   **target**: PR number (`--pr`), commit SHA (`--commit`), branch (`--branch [--base]`),
   or the working tree (no flag).
2. Choose an output path (default `.recaps/<label>.html` inside the target repo).
3. Run: `npx tsx <VISUAL_SKILLS_DIR>/bin/recap.ts --repo <repo> [target flag] --out <out>`.
4. **gh fallback:** if `--pr` fails because the `gh` CLI is unavailable, resolve the PR's
   merge/head commit SHA (or ask the user for it) and re-run with `--commit <sha>`.
5. Open the result (`open <out>` on macOS) or report the path.
6. Prereq notes: `d2` must be on PATH (`brew install d2`); editable Excalidraw is the
   optional M3 opt-in.

`<VISUAL_SKILLS_DIR>` is a single constant line near the top of the body
(`~/Projects/visual-skills`), edited if the repo moves.

### `skills/visual-plan/SKILL.md`

Frontmatter:
- `name: visual-plan`
- `description:` triggers when the user wants to turn a spec/plan/markdown into a
  self-contained, readable HTML plan document grounded in the real codebase.

Body (structured recipe):
1. Read the **source** spec/plan (a file path the user provides, or the plan in context).
2. Read `<VISUAL_SKILLS_DIR>/src/blocks.ts` for the **authoritative Block shapes** (source
   of truth — prevents the skill drifting from the types).
3. **Ground in the target repo:** reference real file paths, Prisma models, and tRPC
   routers/procedures relevant to the plan rather than inventing names.
4. Author a `Block[]` JSON using the content→block mapping, each with a concrete example:
   - narrative / sections → `prose` (markdown; ` ```mermaid ` fences auto-promote to
     editable diagrams per M3)
   - architecture / flow → `diagram` (`d2` required; `mermaid` optional for the editable
     upgrade; quote d2 keys/values containing dots)
   - affected / new files → `file-tree`
   - key code to explain → `annotated-code` (per-line notes; use for the few most important
     snippets, not everything)
   - open decisions → `questions`
5. Write `blocks.json` to a temp path; run
   `npx tsx <VISUAL_SKILLS_DIR>/bin/plan.ts --blocks <blocks.json> --title <title>
   --source <source> --out <out>`.
6. Open the result or report the path.

The body includes a concise inline Block reference but explicitly directs the agent to
verify against `src/blocks.ts`.

### `scripts/install-skills.mjs` + `npm run skills:install`

- For each of `visual-recap`, `visual-plan`: symlink `<repo>/skills/<name>` →
  `~/.claude/skills/<name>`.
- Idempotent: if a correct symlink already exists, leave it; if a different symlink to our
  target exists, leave it; if the path exists as a non-symlink (real dir/file), do NOT
  overwrite — warn and skip. Report each action (linked / already-linked / skipped).
- Anchor paths via `fileURLToPath(import.meta.url)` so it is cwd-independent.

### `README.md`

Add an "Invoking from Claude Code" section: `npm run skills:install`, what it links, and
that the skills then trigger when you ask to visualize a PR/spec.

## Error Handling

The skills degrade conversationally:
- Missing `d2` → instruct `brew install d2`.
- `--pr` without `gh` → fall back to `--commit <sha>`.
- The underlying CLIs already degrade (placeholder SVGs, skipped adapters, inline-code for
  unconvertible mermaid), so a partial input still yields a document.

## Testing

- **Block-coverage guard** (`test/skill-docs.test.ts`): parse the `type: "<literal>"`
  values from `src/blocks.ts` and assert each appears in `skills/visual-plan/SKILL.md`, so
  adding a Block type later forces a skill update. Also assert both `SKILL.md` files have
  valid frontmatter with `name` and `description`.
- **Install-script path logic:** unit-test the pure path-computation (repo skill dir →
  target symlink path) without touching `~/.claude` (e.g. export a small `skillLinks()`
  helper that returns the `{ source, target }` pairs; assert it lists both skills with
  correct paths).
- **Manual verification** (documented; run by the user): `npm run skills:install`, then in
  a real Claude Code session invoke each skill — a recap on ppgl and a plan from a spec —
  and confirm a document is produced and opens. Whether Claude Code auto-loads the skill is
  inherently a behavioral check.

Regression: the existing 58 tests and `tsc` remain green (this milestone adds files and a
test; it does not change `src/`).

## Risks

- **Absolute path coupling.** The skills hardcode the repo path. Mitigated by isolating it
  to one constant line per skill and documenting it. Acceptable for a personal tool at a
  fixed location.
- **Skill auto-trigger is not unit-testable.** Mitigated by the manual verification step;
  the `description` is written conservatively to avoid over-triggering.
- **Skill/schema drift.** Mitigated by the block-coverage guard test and the instruction to
  read `src/blocks.ts` at authoring time.
