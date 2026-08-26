---
name: atlas-review
description: Use when atlas-check.mjs reports stale or ungrounded pages, or when the user asks to verify an existing visual atlas against current code. Reviews each stale page's own evidence, rewrites the smallest coherent current-truth account, re-renders, and independently stamps only reviewed pages.
---

# Atlas Review

The semantic half of keeping a visual atlas honest. The deterministic checker
(`atlas-check.mjs`, emitted next to every atlas) can prove *coverage* (every file assigned),
*grounding* (named exports/files/routes still exist), and *attention* (stamps) — but only a
reader can verify that the **prose** still tells the truth. This skill is that reader: for each
stale page, read its own changed evidence, rewrite the smallest coherent current-truth update,
re-render, and re-stamp that page independently.

**Tool location** (resolved through the installer's `~/.claude/visual-skills` symlink — re-run `npm run skills:install` if the repo moves):

    VISUAL_SKILLS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/visual-skills"

**Required language guide.** Before writing user-facing text, read
`$VISUAL_SKILLS_DIR/skills/shared/plain-language.md`. Apply it to every authored field and live
reply.

**Preconditions.** An existing atlas (default `<repo>/.visual/atlas`) containing
`atlas.domains.json`, configured system/domain/topic JSON pages, and `atlas-check.mjs`. If these are
missing—or the review reveals that the page tree or domain grouping is wrong—switch to the
**visual-atlas** skill. Review can coherently rewrite an existing page; creating, moving, or
restructuring pages remains visual-atlas work.

## Workflow

1. **Run the checker** and collect the problem list:

       node <ATLAS_DIR>/atlas-check.mjs

   Green and the user asked for a routine check → report "in sync" and stop. Green but the user
   explicitly asked to *verify the prose anyway* → treat every page as stale and continue (a full
   audit).

2. **Triage the problems.**
   - *Structure/coverage* (unassigned or stale modules, empty source groups, missing pages, broken
     links) → fix ordinary drift in place. A new bounded context, topic extraction, or tree move is
     **visual-atlas** territory.
   - *Grounding* (a named export/file/route no longer exists) → read the code to learn what
     replaced it, then fix the page's structured fields (and any prose that named it).
   - *Stamps* (source changed since verified) → the core loop, next step.

3. **Per stale page, get the actual change.** The stamp usually carries the commit it was verified
   at (`verifiedAgainst.commit`):

       git -C <REPO> diff <verifiedAgainst.commit> -- <that page's evidence files…>

   (diffs commit → working tree, so uncommitted changes are included). No `commit` field or not a
   git repo → fall back to re-reading that page's evidence outright. For topics, use only resolved
   labeled source groups; for domains use owned modules plus child summaries; for the system use
   config and tree summaries. Overlapping source scopes can make several pages stale independently.

4. **Read the diff against the page—block by block.** Open that exact stale page JSON and judge every
   claim its evidence could have invalidated:
   - `domain-tldr` rows and the `bigIdea` — is the load-bearing insight still true?
   - `components` cards — purposes, export lists.
   - `depth` — detail paragraphs, Key files, Key exports, **connections** (did a seam move?).
   - `owns` — new/removed models or fields worth naming.
   - `seams` — exposes/depends, including routes.
   - diagrams — does the flow drawn still match the code path?
   - topic `topic-tldr`, `topic-flow`, `topic-rules`, examples, and implementation reference—does the
     mechanism, algorithm, lifecycle, data model, or integration still read as one current account?

   Judgment guide — *meaningful* (update the page): new/removed/renamed exports or routes, a
   moved responsibility, a changed failure contract or invariant the page states, new data
   ownership, a changed cross-domain edge (also update `atlas.json`'s tile/map + the neighbor
   page's connections). *Not meaningful* (leave the prose alone): internal refactors that keep
   the described behavior, comment/formatting churn, test-only changes, dependency bumps.

5. **Make the smallest coherent current-truth update.** Rewrite enough of the page to leave one clear
   explanation of how the system works now. Remove project history, PR/task/review-round narration,
   superseded designs, migration chronology, and cumulative patch notes. Do not preserve a sentence
   merely because it is individually accurate when it makes the whole page repetitive, historical,
   or misleading. Rewrite surrounding prose into current truth when a local replacement would leave
   a fragmented explanation.

   Field shapes are in `$VISUAL_SKILLS_DIR/src/atlas-blocks.ts`; the component vocabulary is
   `$VISUAL_SKILLS_DIR/skills/shared/atlas-components.md`. Keep hierarchical relative links valid.

   Keep scope page-specific. Update a parent summary only when the child's title, purpose, boundary,
   or relationship changed. Re-rendering a parent is not evidence review and does not justify a new
   parent stamp. Update related/neighbor pages only when a shared claim or seam changed.

6. **Re-render** every page you edited (render-only — never a rescan from here):

       cd "$VISUAL_SKILLS_DIR"
       npx tsx bin/atlas.ts --all <ATLAS_DIR> --out <ATLAS_DIR>

   Close warnings introduced by or located on pages you edited. Record unrelated pre-existing
   advisories; an all-pages render does not silently expand the review scope.

7. **Re-stamp exactly what you reviewed**—including stale pages you read and found accurate. Every
   system, domain, and topic page has an independent stamp:

       node <ATLAS_DIR>/atlas-check.mjs --stamp <page/id> [<page/id>…]

   Then run the bare check once more. Every reviewed page must be fresh and grounded. If the user
   scoped the review below all stale pages, the command may remain nonzero only for the explicitly
   unreviewed pages, which must be listed in the report.

8. **Report per page**: `updated` (what changed and why) or `confirmed` (evidence read, current
   explanation still coherent). List remaining stale pages and anything escalated to visual-atlas.

## Rules

- **Never stamp a page you haven't just read against the current code.** The stamp's only value
  is that it means someone actually looked. If you reviewed only some stale domains, stamp only
  those and say the rest are still pending.
- **Coherent diffs.** Prefer the smallest coherent update, not the fewest edited lines. You may
  rewrite an existing page fully when that is what removes historical accumulation. Use visual-atlas
  only when the hierarchy or page boundaries must change.
- **Ripples cross pages.** A changed seam has two ends: update the neighbor page's
  `connections`/`seams` and the atlas `domain-map`/tile when an edge changes.
- **The checker is the exit gate.** Done means each reviewed page is fresh and grounded. Global green
  is required when the requested scope covers the whole atlas; otherwise every remaining failure
  must belong to an explicitly unreviewed stale page and be reported.
