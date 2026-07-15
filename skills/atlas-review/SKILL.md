---
name: atlas-review
description: Use when the atlas drift check (atlas-check.mjs) fails with stamp-stale or grounding problems, or when the user asks to review, verify, or re-sync an existing visual atlas against the current code. Re-reads each changed domain's diff against its atlas page, fixes the prose, re-renders, and re-stamps. Maintenance of an existing atlas only — building or restructuring one is visual-atlas.
---

# Atlas Review

The semantic half of keeping a visual atlas honest. The deterministic checker
(`atlas-check.mjs`, emitted next to every atlas) can prove *coverage* (every file assigned),
*grounding* (named exports/files/routes still exist), and *attention* (stamps) — but only a
reader can verify that the **prose** still tells the truth. This skill is that reader: for each
domain whose code changed since its page was last verified, read the diff against the page, fix
what drifted, re-render, and re-stamp.

**Tool location** (edit if the repo moves):

    VISUAL_SKILLS_DIR=/home/srogener/visual-skills

**Preconditions.** An existing atlas (default `<repo>/.visual/atlas`) containing
`atlas.domains.json`, `domain-<slug>/domain-<slug>.json` pages, and `atlas-check.mjs`. If any of
that is missing — or the review reveals the domain *grouping* itself is wrong — this is not a
review job: switch to the **visual-atlas** skill (full scan flow).

## Workflow

1. **Run the checker** and collect the problem list:

       node <ATLAS_DIR>/atlas-check.mjs

   Green and the user asked for a routine check → report "in sync" and stop. Green but the user
   explicitly asked to *verify the prose anyway* → treat every domain as stale and continue (a
   full audit).

2. **Triage the problems.**
   - *Coverage* (unassigned / stale modules, empty domains) → fix `atlas.domains.json` globs and
     the affected page's structure. A handful of new files slotting into existing domains is
     review territory; a new bounded context or a regroup is **visual-atlas** territory — hand off.
   - *Grounding* (a named export/file/route no longer exists) → read the code to learn what
     replaced it, then fix the page's structured fields (and any prose that named it).
   - *Stamps* (source changed since verified) → the core loop, next step.

3. **Per stale domain, get the actual change.** The stamp usually carries the commit it was
   verified at (`verifiedAgainst.commit`):

       git -C <REPO> diff <verifiedAgainst.commit> -- <that domain's modules…>

   (diffs commit → working tree, so uncommitted changes are included). No `commit` field or not a
   git repo → fall back to re-reading the domain's modules outright.

4. **Read the diff against the page — block by block.** Open the domain's
   `domain-<slug>.json` and judge every claim the diff could have invalidated:
   - `domain-tldr` rows and the `bigIdea` — is the load-bearing insight still true?
   - `components` cards — purposes, export lists.
   - `depth` — detail paragraphs, Key files, Key exports, **connections** (did a seam move?).
   - `owns` — new/removed models or fields worth naming.
   - `seams` — exposes/depends, including routes.
   - diagrams — does the flow drawn still match the code path?

   Judgment guide — *meaningful* (update the page): new/removed/renamed exports or routes, a
   moved responsibility, a changed failure contract or invariant the page states, new data
   ownership, a changed cross-domain edge (also update `atlas.json`'s tile/map + the neighbor
   page's connections). *Not meaningful* (leave the prose alone): internal refactors that keep
   the described behavior, comment/formatting churn, test-only changes, dependency bumps.

5. **Edit minimally.** Fix what drifted; do not rewrite accurate prose. Field shapes are in
   `$VISUAL_SKILLS_DIR/src/atlas-blocks.ts`; the component vocabulary is
   `$VISUAL_SKILLS_DIR/skills/shared/atlas-components.md`. Keep cross-page anchor links
   (`../domain-<other>/domain-<other>.html#c-…`) valid.

6. **Re-render** every page you edited (render-only — never a rescan from here):

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/atlas.ts --all <ATLAS_DIR> --out <ATLAS_DIR>

   Close any lint warnings the render prints.

7. **Re-stamp exactly what you reviewed** — including domains you read and found accurate:

       node <ATLAS_DIR>/atlas-check.mjs --stamp <slug> [<slug>…]

   Then run the bare check once more; it must be green.

8. **Report per domain**: `updated` (what changed on the page and why) or `confirmed` (read the
   diff, prose still accurate). Name anything you escalated to visual-atlas instead.

## Rules

- **Never stamp a page you haven't just read against the current code.** The stamp's only value
  is that it means someone actually looked. If you reviewed only some stale domains, stamp only
  those and say the rest are still pending.
- **Minimal diffs.** This is maintenance, not re-authoring. If you find yourself rebuilding a
  page's structure, stop and use visual-atlas.
- **Ripples cross pages.** A changed seam has two ends: update the neighbor page's
  `connections`/`seams` and the atlas `domain-map`/tile when an edge changes.
- **The checker is the exit gate.** Done means `atlas-check.mjs` exits green with every reviewed
  domain freshly stamped.
