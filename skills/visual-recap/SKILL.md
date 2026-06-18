---
name: visual-recap
description: Use when the user asks to visualize, render, or "make readable" a pull request, commit, branch, or git diff as a self-contained HTML recap. Produces a hand-drawn-styled HTML document grounded in the real repo — file tree, Prisma schema changes, tRPC API-surface diagram, and syntax-highlighted diffs.
---

# Visual Recap

Turn a git target (PR, commit, branch, or working tree) into a single self-contained,
hand-drawn-styled HTML document and open it.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/Users/scottrogener/Projects/visual-skills

## Steps

1. **Identify the target repo.** Default to the current working directory. If the user
   names another repo, use its absolute path.

2. **Identify what to recap** and pick the matching flag:
   - a pull request → `--pr <number>` (needs the `gh` CLI)
   - a commit/SHA/tag → `--commit <ref>`
   - a branch → `--branch <name>` (optionally `--base <ref>` to set the comparison base)
   - uncommitted working changes → no target flag

3. **Choose an output path** — default `<target-repo>/.recaps/<short-label>.html` (use an
   absolute path).

4. **Run the recap** from the tool directory so its dependencies resolve:

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/recap.ts --repo <ABSOLUTE_TARGET_REPO> <target flag> --out <ABSOLUTE_OUT>

5. **Open it:** `open <ABSOLUTE_OUT>` on macOS, otherwise tell the user the path.

## Fallbacks

- **`--pr` fails / no `gh`:** the CLI prints "PR scope needs the gh CLI". Resolve the PR's
  merge or head commit SHA (e.g. via `gh`, the GitHub UI, or `git log`) and re-run with
  `--commit <sha>` instead.
- **`d2` missing:** diagrams degrade to visible placeholders (the recap still produces) —
  tell the user to `brew install d2` for proper hand-drawn sketches.
- Editable Excalidraw diagrams are an optional upgrade — see the tool's README
  (`npm run setup:excalidraw`). Without it, diagrams render as static D2 sketches.

## Example

Recap of a merged PR by its squash-merge SHA, into the target repo's `.recaps/`:

    cd "$VISUAL_SKILLS_DIR"
    npx tsx bin/recap.ts --repo /Users/me/Projects/ppgl --commit 3559f61 \
      --out /Users/me/Projects/ppgl/.recaps/pr-183.html
    open /Users/me/Projects/ppgl/.recaps/pr-183.html
