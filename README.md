# visual-skills

Self-hosted renderer that turns specs and code changes into a single
self-contained, hand-drawn-styled HTML document grounded in the real repo.

## Prerequisites
- Node 20+
- `d2` on PATH — `brew install d2` (the required rendering floor)
- `gh` CLI (optional, only for `--pr`)

## Usage

Plan (hand-authored blocks):

    npx tsx bin/plan.ts --blocks blocks.json --title "My Plan" --out plans/x/plan.html

Recap (from a git target):

    npx tsx bin/recap.ts --repo /path/to/repo --commit <sha>  --out .recaps/x/recap.html
    npx tsx bin/recap.ts --repo /path/to/repo --branch <name> --out .recaps/x/recap.html
    npx tsx bin/recap.ts --repo /path/to/repo --pr <number>   --out .recaps/x/recap.html

## Optional: editable Excalidraw diagrams

By default, flowchart/architecture diagrams render as static D2 sketches. To make them
editable `.excalidraw` scenes (opened in excalidraw.com or the VS Code Excalidraw
extension), opt in once:

    npm run setup:excalidraw

This installs Playwright + Chromium and `@excalidraw/excalidraw` (not saved to
`package.json`) and builds an offline bundle. It is heavy (~hundreds of MB). When it is
not installed, diagrams fall back to the D2 sketch — nothing breaks.

## Scope
This is the M0+M1 slice: D2 floor + assembler + recap gatherer (Prisma+tRPC
adapter). Excalidraw upgrade (M3), Shiki highlighting (M2), and the Claude Code
SKILL.md wiring (M4) are not yet implemented. See `docs/superpowers/specs/`.
