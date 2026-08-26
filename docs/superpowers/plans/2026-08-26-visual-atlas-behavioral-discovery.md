# Visual Atlas Behavioral Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require `visual-atlas` to trace representative runtime journeys and account for significant responsibilities before it chooses a conceptual page hierarchy.

**Architecture:** Add a positive, repository-agnostic discovery recipe to the existing skill before its page-tree guidance. Keep discovery agentic and temporary: the scanner, schemas, and renderer remain unchanged. Prove the behavior with a focused documentation-contract test and isolated before/after evaluations against this repository's Atlas-generation capability, then use Telltale as the real-world pilot.

**Tech Stack:** Markdown skill instructions, TypeScript, Vitest, the existing visual-atlas CLI and checker.

**Spec:** `docs/superpowers/specs/2026-08-26-visual-atlas-behavioral-discovery-design.md`

## Global Constraints

- Do not encode Telltale-specific phases, page names, files, or expected answers in the skill or evaluation prompt.
- Do not add scanner topic inference, atlas schema fields, renderer changes, or Telltale application changes.
- Preserve the existing recursive hierarchy, readability, current-truth, historical-prose, and freshness requirements.
- Work only in `/private/tmp/visual-skills-atlas-hierarchy` for visual-skills changes and `/private/tmp/telltale-atlas-pilot.C1m5x3` for the disposable pilot.
- Never add the user-owned `.superpowers/` directory to git.

---

### Task 1: Behavioral discovery contract and isolated validation

**Files:**
- Modify: `test/skill-docs.test.ts`
- Modify: `skills/visual-atlas/SKILL.md`
- Regenerate outside this repository: `/private/tmp/telltale-atlas-pilot.C1m5x3/.visual/atlas/domain-conversation-engine/**`

**Interfaces:**
- Consumes: the current `visual-atlas` authoring workflow and its `atlas.domains.json` topic tree.
- Produces: a required temporary discovery brief with journey traces, a responsibility ledger, and documentation dispositions; the configured atlas remains the durable interface.

- [ ] **Step 1: Preserve a clean-subject baseline**

Run an isolated agent read-only against the prior committed skill at `3139fc5` and this repository's Atlas generation production source. Ask only for a source-grounded domain hierarchy and outline. Exclude `.visual`, tests, specs, plans, the working-tree skill, and git history beyond reading that one committed skill. Record whether the output traces boundary-to-terminal behavior, distinguishes sequencing and fan-out, and assigns all significant responsibilities a documentation home.

- [ ] **Step 2: Write the failing documentation-contract test**

Add this focused test to `test/skill-docs.test.ts`:

```ts
it("visual-atlas accounts for behavior before choosing the page tree", () => {
  for (const phrase of [
    "journey trace",
    "responsibility ledger",
    "documentation disposition",
    "boundary crossings",
    "convergence",
    "durable writes",
    "cleanup",
  ]) {
    expect(atlasSkill.toLowerCase(), `visual-atlas must require ${phrase}`)
      .toContain(phrase.toLowerCase());
  }

  const discovery = atlasSkill.indexOf("## Discover behavior before choosing pages");
  const pageTree = atlasSkill.indexOf("## Choose the page tree before writing prose");
  expect(discovery).toBeGreaterThan(-1);
  expect(pageTree).toBeGreaterThan(discovery);
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx vitest run test/skill-docs.test.ts -t "accounts for behavior before choosing the page tree"
```

Expected: FAIL because the current skill has no required journey trace or responsibility ledger and starts page design first.

- [ ] **Step 4: Add the minimal discovery recipe**

Insert `## Discover behavior before choosing pages` before the current page-tree section in `skills/visual-atlas/SKILL.md`. Require, in this order:

1. inventory entrypoints and central orchestrators;
2. trace representative journeys across boundaries through terminal effects and recovery;
3. capture ordering, branching, convergence, durable effects, failure, cancellation, and cleanup;
4. build a responsibility ledger whose rows include reader meaning, evidence, journey/invariant, and documentation disposition;
5. assign every significant row to a landing summary, topic, nested topic, linked canonical page, or supported omission;
6. challenge the ledger for unaccounted central-orchestrator behavior before choosing pages.

State positively what the discovery brief contains. Keep all examples repository-neutral.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run test/skill-docs.test.ts -t "accounts for behavior before choosing the page tree"
```

Expected: PASS.

- [ ] **Step 6: Run the complete skill-doc test file**

Run:

```bash
npx vitest run test/skill-docs.test.ts
```

Expected: PASS with all existing skill contracts preserved.

- [ ] **Step 7: Run a separate clean-subject GREEN evaluation**

Dispatch a different isolated agent with the same read-only Atlas-generation task and revised skill. Do not pass the baseline, spec, expected stages, or suspected omissions. Compare raw output using the generic rubric from the spec. If it omits a new class of significant responsibility, refine only the generic output contract and repeat Steps 5–7.

- [ ] **Step 8: Regenerate the Conversation Engine pilot from source**

Apply the successful generic discovery contract to current Telltale source, then author and render the Conversation Engine landing and justified child pages in the disposable snapshot. Treat this as the real-world pilot, not another blind evaluation. Preserve existing depth where current source still supports it. Run:

```bash
npx tsx bin/atlas.ts --all /private/tmp/telltale-atlas-pilot.C1m5x3/.visual/atlas --out /private/tmp/telltale-atlas-pilot.C1m5x3/.visual/atlas
node /private/tmp/telltale-atlas-pilot.C1m5x3/.visual/atlas/atlas-check.mjs --stamp conversation-engine
```

Run further page-specific stamp commands only for child pages actually reviewed.

- [ ] **Step 9: Verify the repository**

Run:

```bash
npm test
npm run typecheck
node .visual/atlas/atlas-check.mjs
git diff --check
git status --short
```

Expected: all tests and typecheck pass; the repository atlas is in sync apart from advisory readability warnings; `.superpowers/` remains the only unrelated untracked path.

- [ ] **Step 10: Commit and push the existing PR branch**

Stage only the skill, test, spec, and plan changes:

```bash
git add skills/visual-atlas/SKILL.md test/skill-docs.test.ts docs/superpowers/specs/2026-08-26-visual-atlas-behavioral-discovery-design.md docs/superpowers/plans/2026-08-26-visual-atlas-behavioral-discovery.md
git commit -m "feat: require behavioral atlas discovery"
git push origin feat/visual-atlas-hierarchy
```

Do not add `.superpowers/` or files from the disposable Telltale snapshot.
