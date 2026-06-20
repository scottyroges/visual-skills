# visual-skills

Self-hosted renderer that turns specs and code changes into a single
self-contained, hand-drawn-styled HTML document grounded in the real repo.

## Prerequisites
- Node 20+
- `d2` on PATH — `brew install d2` (the required rendering floor)
- `gh` CLI (optional, only for `--pr`)

## Usage

`--out` is a per-doc **folder**: the tool writes `plan.html` / `recap.html` plus any
`.excalidraw` sidecars together inside it (a trailing `.html` is stripped for convenience).

Plan (hand-authored blocks):

    npx tsx bin/plan.ts --blocks blocks.json --title "My Plan" --out plans/x   # -> plans/x/plan.html

Recap (from a git target):

    npx tsx bin/recap.ts --repo /path/to/repo --commit <sha>  --out .recaps/x  # -> .recaps/x/recap.html
    npx tsx bin/recap.ts --repo /path/to/repo --branch <name> --out .recaps/x
    npx tsx bin/recap.ts --repo /path/to/repo --pr <number>   --out .recaps/x

Every recap includes a synthesized summary and a "where it fits" dependency graph. To
enrich it with an agent-authored behavioral diagram, emit the gathered blocks as JSON,
augment them, and render via the plan CLI (this is what the `visual-recap` skill does):

    npx tsx bin/recap.ts --repo /path/to/repo --commit <sha> --emit-blocks blocks.json
    npx tsx bin/plan.ts --blocks blocks.json --out .recaps/x   # -> .recaps/x/plan.html

## Optional: editable Excalidraw diagrams

By default, flowchart/architecture diagrams render as static D2 sketches. To make them
editable `.excalidraw` scenes (opened in excalidraw.com or the VS Code Excalidraw
extension), opt in once:

    npm run setup:excalidraw

This installs Playwright + Chromium and `@excalidraw/excalidraw` (not saved to
`package.json`) and builds an offline bundle. It is heavy (~hundreds of MB). When it is
not installed, diagrams fall back to the D2 sketch — nothing breaks.

## Invoking from Claude Code

Install the skills once so Claude Code can discover them from any repo:

    npm run skills:install

This symlinks `visual-recap` / `visual-plan` / `visual-spec` / `visual-atlas` into
`~/.claude/skills/` **and stamps each `SKILL.md`'s `VISUAL_SKILLS_DIR` to this clone**, so the
skills work from wherever you cloned the repo — no hand-editing of paths after a clone. (It's
idempotent: a `SKILL.md` already pointing here is left untouched.) To install into a different
Claude config root, pass `--dir`:

    npm run skills:install -- --dir /path/to/.claude

After that, ask Claude Code to "make a visual atlas of this codebase" to trigger `visual-atlas`,
"visualize this PR" / "make a visual recap of <commit>" for `visual-recap`, or "turn this spec
into a visual plan" for `visual-plan`. The skills invoke the CLIs above; their tool path is the
`VISUAL_SKILLS_DIR` constant near the top of each `SKILL.md`, set automatically by the installer.

## Scope
Implemented: D2 floor + assembler + recap gatherer (Prisma+tRPC adapter) (M0/M1),
Shiki syntax highlighting + full renderer set (M2), the opt-in editable Excalidraw
upgrade with API-surface + plan-mermaid diagram producers (M3), and the `visual-plan` /
`visual-recap` Claude Code skills (M4), and contextual recaps — synthesized summary +
"where it fits" dependency graph + `--emit-blocks` enrichment with agent-selected
behavioral diagrams (M6), and review-narrative recaps — agent-authored "Summary",
per-file diff descriptions with in-page cross-links, and importance-ordered `group`s
(M7), and a shared diagram catalog with a `tabs` multi-view block plus widened
Excalidraw editability (sequence/class) (M8). Deprioritized: `gh pr comment`
integration (M5). See `docs/superpowers/specs/`.
