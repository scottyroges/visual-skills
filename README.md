# visual-skills

Self-hosted renderer that turns specs, code changes, and whole codebases into
self-contained, hand-drawn-styled HTML documents grounded in the real repo. Four tools /
Claude Code skills share one app shell + diagram pipeline: **visual-doc** (any authored
doc), **visual-recap** (a code change), **visual-spec** (a design spec → approval), and
**visual-atlas** (a codebase's domains & architecture).

## Prerequisites
- Node 20+
- `d2` on PATH — `brew install d2` (the required rendering floor)
- `gh` CLI (optional, only for `--pr`)

## Usage

`--out` is a per-doc **folder**: the tool writes `doc.html` / `recap.html` plus any
`.excalidraw` sidecars together inside it (a trailing `.html` is stripped for convenience).

Doc (hand-authored blocks):

    npx tsx bin/doc.ts --blocks blocks.json --title "My Doc" --out .visual/docs/x   # -> .visual/docs/x/doc.html

Recap (from a git target):

    npx tsx bin/recap.ts --repo /path/to/repo --commit <sha>  --out .visual/recaps/x  # -> .visual/recaps/x/recap.html
    npx tsx bin/recap.ts --repo /path/to/repo --branch <name> --out .visual/recaps/x
    npx tsx bin/recap.ts --repo /path/to/repo --pr <number>   --out .visual/recaps/x

Every recap includes a synthesized summary and a "where it fits" dependency graph. To
enrich it with an agent-authored behavioral diagram, emit the gathered blocks as JSON,
augment them, and render via the doc CLI (this is what the `visual-recap` skill does):

    npx tsx bin/recap.ts --repo /path/to/repo --commit <sha> --emit-blocks blocks.json
    npx tsx bin/doc.ts --blocks blocks.json --out .visual/recaps/x   # -> .visual/recaps/x/doc.html

Spec (a design doc / RFC, authored for approval):

    npx tsx bin/spec.ts --blocks spec.json --out .visual/specs/x    # -> .visual/specs/x/spec.html

Atlas (a standing map of a codebase's domains & architecture):

    npx tsx bin/atlas.ts --repo /path/to/repo --out .visual/atlas   # scan -> draft JSON -> render
    # enrich the draft JSON (domain purposes, connections, diagrams), then re-render:
    npx tsx bin/atlas.ts --all .visual/atlas --out .visual/atlas    # atlas.html + domain-<slug>/ folders

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

This symlinks `visual-recap` / `visual-doc` / `visual-spec` / `visual-atlas` into
`~/.claude/skills/` **and stamps each `SKILL.md`'s `VISUAL_SKILLS_DIR` to this clone**, so the
skills work from wherever you cloned the repo — no hand-editing of paths after a clone. (It's
idempotent: a `SKILL.md` already pointing here is left untouched.) To install into a different
Claude config root, pass `--dir`:

    npm run skills:install -- --dir /path/to/.claude

After that, ask Claude Code to "make a visual atlas of this codebase" for `visual-atlas`,
"visualize this PR" / "make a visual recap of <commit>" for `visual-recap`, "make this design
spec readable so I can approve it" for `visual-spec`, or "turn this plan/markdown into a readable
doc" for `visual-doc`. The skills invoke the CLIs above; their tool path is the `VISUAL_SKILLS_DIR`
constant near the top of each `SKILL.md`, set automatically by the installer.

## Scope
Implemented: D2 floor + assembler + recap gatherer (Prisma+tRPC adapter) (M0/M1),
Shiki syntax highlighting + full renderer set (M2), the opt-in editable Excalidraw
upgrade with API-surface + plan-mermaid diagram producers (M3), and the `visual-doc` /
`visual-recap` Claude Code skills (M4), and contextual recaps — synthesized summary +
"where it fits" dependency graph + `--emit-blocks` enrichment with agent-selected
behavioral diagrams (M6), and review-narrative recaps — agent-authored "Summary",
per-file diff descriptions with in-page cross-links, and importance-ordered `group`s
(M7), and a shared diagram catalog with a `tabs` multi-view block plus widened
Excalidraw editability (sequence/class) (M8), the `visual-spec` design-spec→approval skill
(its own block model + completeness lint), and the `visual-atlas` codebase-map skill (a
mechanical scanner + human-owned `atlas.domains.json` grouping, per-domain folders, and a
demo-standard lint). Deprioritized: `gh pr comment` integration (M5). See
`docs/superpowers/specs/`.
