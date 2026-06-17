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

## Scope
This is the M0+M1 slice: D2 floor + assembler + recap gatherer (Prisma+tRPC
adapter). Excalidraw upgrade (M3), Shiki highlighting (M2), and the Claude Code
SKILL.md wiring (M4) are not yet implemented. See `docs/superpowers/specs/`.
