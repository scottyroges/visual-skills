# Visual Atlas Topic Substance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recursive Atlas topics substantive technical chapters and prevent untouched topic drafts from rendering or receiving verification stamps without explicit failures.

**Architecture:** Keep conceptual discovery and rendering unchanged. Strengthen the authored-content boundary in three places: shape-specific guidance in the skill/catalog, advisory topic lints during rendering, and a deterministic hard content floor in the self-contained recursive checker before stamp writes. Validate the behavior against tests and a complete disposable Telltale Conversation Engine pilot.

**Tech Stack:** Markdown skills/catalogs, TypeScript, Vitest, self-contained Node ESM checker, JSON Atlas artifacts.

**Spec:** `docs/superpowers/specs/2026-08-26-visual-atlas-topic-substance-design.md`

## Global Constraints

- Continue on `/private/tmp/visual-skills-atlas-hierarchy`, branch `feat/visual-atlas-hierarchy`, and the existing PR.
- Use `/private/tmp/telltale-atlas-pilot.C1m5x3` only as a disposable source-driven pilot.
- Do not modify Telltale application source.
- Do not add semantic topic inference, schema changes, renderer layout changes, or hard minimum word counts.
- Keep `skills/visual-atlas/SKILL.md` below 500 lines; put detailed teaching contracts in the required shared catalog.
- Preserve the user-owned untracked `.superpowers/` directory without staging it.

---

### Task 1: Substantive topic authoring and acceptance

**Files:**
- Modify: `src/lint-atlas.ts`
- Modify: `assets/atlas-check-v2.mjs`
- Modify: `test/lint-atlas.test.ts`
- Modify: `test/atlas-check.test.ts`
- Modify: `test/skill-docs.test.ts`
- Modify: `skills/visual-atlas/SKILL.md`
- Modify: `skills/shared/atlas-components.md`
- Regenerate outside this repository: `/private/tmp/telltale-atlas-pilot.C1m5x3/.visual/atlas/domain-conversation-engine/**`

**Interfaces:**
- `lintTopic(blocks: AtlasBlock[], shape?: TopicShape): string[]` adds advisory content diagnostics without changing its signature.
- `atlas-check-v2.mjs --stamp [page/id…]` refuses all writes when any configured topic misses the objective substance floor.
- `visual-atlas` produces a temporary page teaching brief; Atlas JSON remains the durable authoring interface.

- [x] **Step 1: Update checker fixtures to represent a finished topic**

Change `topicDoc` in `test/atlas-check.test.ts` to accept an evidence file and produce two non-empty flow steps, one guarantee, one failure row, and one implementation-reference file with a description. Update every call with the matching source file so existing checker tests continue to describe valid authored pages.

- [x] **Step 2: Add a failing checker test for an untouched draft**

Add a test that empties `summary`, `inputs`, `outputs`, `steps`, `guarantees`, `failures`, and implementation descriptions on `conversation/context-building`, runs targeted stamp mode, and asserts:

```ts
expect(result.ok).toBe(false);
expect(result.output).toMatch(/context-building.*summary/i);
expect(result.output).toMatch(/context-building.*two non-empty flow steps/i);
expect(result.output).toMatch(/context-building.*implementation reference.*description/i);
expect(JSON.parse(readFileSync(path, "utf8")).verifiedAgainst).toBeUndefined();
```

- [x] **Step 3: Run the checker test and verify RED**

Run:

```bash
node_modules/.bin/vitest run test/atlas-check.test.ts -t "refuses to stamp a materially empty topic"
```

Expected: FAIL because stamp mode currently accepts and mutates the empty topic.

- [x] **Step 4: Add failing topic-lint tests**

Add tests in `test/lint-atlas.test.ts` for:

1. an untouched draft that has all required block types but empty content;
2. a four-step mechanism with neither `diagram-section` nor `example`;
3. an algorithm with no worked example;
4. a topic with fewer than roughly 180 visible narrative words.

Assert observable warning categories rather than exact full messages.

- [x] **Step 5: Run the linter tests and verify RED**

Run:

```bash
node_modules/.bin/vitest run test/lint-atlas.test.ts
```

Expected: the new cases FAIL because current lint checks block presence and only upper density limits.

- [x] **Step 6: Implement advisory substance linting**

Extend `lintTopic` in `src/lint-atlas.ts` to inspect the existing typed blocks and report:

- blank lead summary, missing inputs, or missing outputs;
- fewer than two steps or blank step title/body;
- missing guarantees and no explicit failure row or explanatory rules introduction;
- missing implementation reference, empty groups/files, or blank file descriptions;
- four or more flow steps with no diagram/example;
- an algorithm with no example.

Extend `lintReadability` with a topic-only advisory below 180 visible narrative words. Keep all of these as renderer warnings.

- [x] **Step 7: Implement the hard checker floor and no-write stamp preflight**

In `assets/atlas-check-v2.mjs`, validate the same objective fields for every configured topic after documents load. Add each failure to `problems` with the page ID. Before the stamping loop, run a second preflight:

```js
if (stampMode && problems.length) {
  console.error("✗ visual atlas has integrity or freshness problems:\n");
  for (const problem of [...new Set(problems)]) console.error(`  - ${problem}`);
  process.exit(1);
}
```

Mirror only the two editorial advisories that are deterministic from JSON: fewer than 180 visible words and four-plus flow steps without a diagram/example. Do not turn the advisory word floor into a hard error.

- [x] **Step 8: Run focused tests and verify GREEN**

Run:

```bash
node_modules/.bin/vitest run test/lint-atlas.test.ts test/atlas-check.test.ts
```

Expected: PASS.

- [x] **Step 9: Add the page teaching brief and shape contracts**

In `skills/visual-atlas/SKILL.md`, add a concise `## Earn every child page` section after page-tree selection. Require a teaching brief with reader question, mental model, transformed state, decisions/invariants, grounded trace, failures/outcomes, and evidence. State that the acceptance question is whether a reader can predict a representative case.

In `skills/shared/atlas-components.md`, add the full mechanism, algorithm, lifecycle, integration, and data-model contracts from the spec. Explain that progressive disclosure moves explanation into the child and that identical four-block outlines are not completed topics.

Update the skill's standard/red flags and authoring step to require clearing hard content problems and inspecting substance advisories before stamping. Keep the main skill below 500 lines and repository-neutral.

- [x] **Step 10: Protect the skill contract**

Extend `test/skill-docs.test.ts` to confirm the substance section precedes authoring, the detailed shape contract lives in the shared catalog, the hard-vs-advisory distinction is explicit, and the skill remains below 500 lines. Run:

```bash
node_modules/.bin/vitest run test/skill-docs.test.ts
```

Expected: PASS.

- [x] **Step 11: Forward-test the revised skill**

Give an isolated agent the revised skill and a read-only task to author a source-grounded Atlas topic for this repository's Diagram Pipeline. Exclude generated Atlas artifacts, tests, specs, plans, prior output, and expected headings. Confirm the proposed page contains shape-specific decisions, failure/fallback behavior, and a grounded trace or diagram rather than only the default four-block outline.

- [x] **Step 12: Re-author all Conversation Engine topics**

Read every configured topic's evidence in the Telltale snapshot and replace outline-only JSON with substantive, current-truth explanations. Add worked examples or diagrams where behavior has multiple stages. Give special depth to:

- Context building: prompt construction, durable inputs, ordering, memory placement, and output reservation.
- Compaction and summarization: thresholds, buckets, summary chaining, incremental path, hard-cap enforcement, and fallback truncation with a concrete numerical trace.
- One conversation turn and its children: detailed fan-out purpose/convergence, fencing, visible-vs-durable protocol, and reconciliation.

Review the remaining starting, memory, direction, and ending branches against source rather than accepting their existing one-sentence steps.

- [x] **Step 13: Render, check, stamp, and open the pilot**

Run render-only for the full disposable Atlas, then run the emitted checker. Resolve every Conversation Engine hard problem and substance warning; leave unrelated untouched-domain issues recorded. Stamp only the 12 reviewed Conversation Engine page IDs. Open at least the landing, one-turn, context-building, compaction, and one representative ending/memory page in the browser.

- [x] **Step 14: Verify the repository**

Using Node 22 and the D2-capable PATH, run:

```bash
node_modules/.bin/vitest run
node node_modules/typescript/bin/tsc --noEmit
node .visual/atlas/atlas-check.mjs
git diff --check
git status --short
```

Expected: all tests and typecheck pass. Record any pre-existing integrity problems in the ignored
local repository Atlas separately rather than expanding this task to rewrite unrelated generated
pages; `.superpowers/` remains unrelated and untracked.

- [ ] **Step 15: Review, commit, and push**

Request a focused code/skill review. Stage only the intended source, test, skill/catalog, spec, and plan files. Commit with:

```bash
git commit -m "feat: require substantive atlas topics"
git push origin feat/visual-atlas-hierarchy
```

Verify PR #6 points at the new head commit. Do not commit disposable Telltale files.
