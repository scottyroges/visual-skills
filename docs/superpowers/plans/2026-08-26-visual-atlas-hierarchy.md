# Visual Atlas Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authored recursive atlas topics, orientation-first topic rendering, flexible evidence scopes, per-page verification, and readability guidance, then validate the result against Telltale's conversation engine.

**Architecture:** `atlas.domains.json` owns a conceptual page tree while a new tree module derives stable paths, breadcrumbs, navigation, evidence files, and page identities. The existing renderer gains topic-specific structured blocks and page context rather than duplicating the app shell. The CLI and emitted standalone checker walk the same configured tree so generation, links, fingerprints, and validation agree.

**Tech Stack:** TypeScript, Node.js, Vitest, self-contained HTML/CSS/JavaScript, JSON configuration.

**Spec:** `docs/superpowers/specs/2026-08-26-visual-atlas-hierarchy-design.md`

## Global Constraints

- The human or authoring agent controls the topic tree; scanners never mutate it.
- A topic evidence scope may overlap another scope and may span domains or folders.
- Fingerprints are file-level and include every resolved file from every labeled source group.
- Warn beyond two topic levels beneath a domain; do not reject deeper authored trees.
- Domain landing pages warn around 1,200 visible words; topic pages warn around 2,000.
- Historical task, PR, review-round, supersession, and chronology prose warns.
- Integrity failures and advisory readability warnings remain separate.
- Backward migration is not required; clean regeneration is allowed.
- All visual-skills changes ship in one feature PR; tasks may use separate commits inside it.
- Telltale validation uses the `misc` lane from fresh `origin/main`; it is not silently mixed into the visual-skills repository.
- Run focused tests after each behavior change and `npm run typecheck` after code changes.

---

### Task 1: Recursive Configuration, Paths, and Evidence Scopes

**Files:**
- Create: `src/atlas-tree.ts`
- Create: `test/atlas-tree.test.ts`
- Create: `test/fixtures/atlas-repo/packages/db/src/stored-summary.ts`
- Modify: `src/atlas-config.ts`
- Modify: `test/atlas-config.test.ts`

**Interfaces:**
- Produces `TopicConfig`, `TopicShape`, `SourceGroup`, and `ReadingPathConfig` from `atlas-config.ts`.
- Produces `buildPageTree(config): AtlasPageTree`, `pageOutputPaths(node)`, `resolveTopicSources(repoRoot, topic)`, and `validatePageTree(tree)` from `atlas-tree.ts`.
- `AtlasPageNode.id` is the slash-joined conceptual path, for example `conversation-engine/context-building/compaction`.
- `AtlasPageNode.outputDir`, `.jsonPath`, and `.htmlPath` are repository-output-relative paths used by the renderer, CLI, checker, and search index.

- [x] **Step 1: Write failing recursive-tree tests**

```ts
const config: AtlasConfig = {
  repo: "demo", srcRoots: ["lib"],
  domains: [{ slug: "conversation", name: "Conversation", purpose: "Runs a turn", globs: ["lib/sim/**"], modules: [], topics: [{
    slug: "context-building", title: "Context building", purpose: "Builds ordered input",
    sources: [{ label: "Assembly", include: ["lib/sim/**"], exclude: ["**/*.test.ts"] }],
    topics: [{ slug: "compaction", title: "Compaction", purpose: "Reduces older input", sources: [] }],
  }] }],
};
const tree = buildPageTree(config);
expect(tree.nodes.map((n) => n.id)).toEqual([
  "conversation", "conversation/context-building", "conversation/context-building/compaction",
]);
expect(tree.nodes[2].htmlPath).toBe(
  "domain-conversation/context-building/compaction/compaction.html",
);
expect(tree.nodes[2].breadcrumbs.map((b) => b.title)).toEqual([
  "System Atlas · demo", "Conversation", "Context building", "Compaction",
]);
```

- [x] **Step 2: Run `npm test -- test/atlas-tree.test.ts` and confirm it fails because the module and types do not exist**

- [x] **Step 3: Add config types and minimal deterministic tree derivation**

```ts
export type TopicShape = "mechanism" | "algorithm" | "data-model" | "lifecycle" | "integration";
export interface SourceGroup { label: string; include: string[]; exclude?: string[]; }
export interface TopicConfig {
  slug: string; title: string; purpose: string; shape?: TopicShape; aliases?: string[];
  sources: SourceGroup[]; topics?: TopicConfig[]; related?: string[];
}
export interface ReadingPathConfig { title: string; purpose?: string; pages: string[]; }
```

`buildPageTree` recursively derives parents, ordered children, topic depth, breadcrumbs, and paths.
`validatePageTree` returns hard problems for duplicate sibling slugs, duplicate page IDs/paths,
unreachable related/reading-path IDs, and empty required identity fields; it returns a warning for
topic depth greater than two below a domain.

- [x] **Step 4: Run the focused tree tests and confirm path, breadcrumb, uniqueness, and depth behavior passes**

- [x] **Step 5: Write failing evidence-scope tests**

```ts
const groups = await resolveTopicSources(REPO, {
  slug: "context", title: "Context", purpose: "p",
  sources: [
    { label: "Assembly", include: ["lib/sim/**"], exclude: ["**/loop.ts"] },
    { label: "Stored summaries", include: ["packages/db/src/**/*summary*.ts"] },
  ],
});
expect(groups.map((g) => [g.label, g.files])).toEqual([
  ["Assembly", ["lib/sim/engine.ts"]],
  ["Stored summaries", ["packages/db/src/stored-summary.ts"]],
]);
```

- [x] **Step 6: Implement file walking plus include/exclude matching and confirm overlapping groups retain their independent matches**

- [x] **Step 7: Run `npm test -- test/atlas-config.test.ts test/atlas-tree.test.ts` and `npm run typecheck`**

- [x] **Step 8: Commit `feat: add recursive atlas page model`**

---

### Task 2: Topic Blocks, Hierarchical Rendering, Search, and Recursive CLI Output

**Files:**
- Modify: `src/atlas-blocks.ts`
- Modify: `src/assemble-atlas.ts`
- Modify: `src/gather-atlas.ts`
- Modify: `bin/atlas.ts`
- Modify: `assets/atlas.css`
- Create: `assets/atlas-navigation.js`
- Modify: `test/atlas-blocks.test.ts`
- Modify: `test/assemble-atlas.test.ts`
- Modify: `test/gather-atlas.test.ts`
- Modify: `test/atlas-cli.test.ts`

**Interfaces:**
- Produces `TopicTldrBlock`, `TopicFlowBlock`, `TopicRulesBlock`, and `ImplementationReferenceBlock` as members of `AtlasBlock`.
- Produces `PageNavigation` and `TopicOpts`, plus `assembleTopic(blocks, opts)`.
- Produces `buildTopicDraft(node, resolvedSources, opts): TopicDraft`.
- `PageNavigation` carries current node, breadcrumbs, children, siblings, related pages, reading paths, and the full structured search index.

- [x] **Step 1: Write failing block-helper and renderer tests**

```ts
const blocks: AtlasBlock[] = [
  { type: "topic-tldr", id: "tldr", heading: "Context building", summary: "Builds model input.", when: "Before a model call", inputs: ["stored messages"], outputs: ["ordered context"] },
  { type: "topic-flow", id: "flow", title: "How it works", steps: [{ title: "Load", body: "Read stored state." }] },
  { type: "topic-rules", id: "rules", title: "Guarantees and failures", guarantees: ["Order is stable"], failures: [{ condition: "Budget is exceeded", behavior: "Compact older content" }] },
  { type: "implementation-reference", id: "reference", title: "Implementation reference", groups: [{ label: "Assembly", files: [{ name: "lib/context.ts", desc: "Builds the list" }] }] },
];
const html = await assembleTopic(blocks, opts);
expect(html).toContain('class="atlas-breadcrumbs"');
expect(html).toContain('class="topic-child-card"');
expect(html).toContain('<details class="implementation-reference"');
expect(html).toContain('id="atlas-search-index"');
```

The production mutation caught is removal of hierarchical navigation or accidental expansion of
the implementation index.

- [x] **Step 2: Run `npm test -- test/atlas-blocks.test.ts test/assemble-atlas.test.ts` and confirm the missing types/functions fail**

- [x] **Step 3: Add the four structured blocks and renderers**

`topic-tldr` is the lead. `topic-flow` renders ordered stages. `topic-rules` renders guarantees and
failure behavior in separate labeled groups. `implementation-reference` renders a closed
`<details>` element containing labeled file groups.

- [x] **Step 4: Add page-context rendering shared by system, domain, and topic pages**

Derive breadcrumbs, current-branch sidebar, child cards, parent/sibling footer, related links,
reading paths, and a structured JSON search index from `PageNavigation`. Escape all titles,
purposes, aliases, identifiers, and hrefs. The current branch is expanded; unrelated descendants
are absent from the sidebar.

- [x] **Step 5: Add responsive CSS and embedded search behavior**

`atlas-navigation.js` reads the embedded index, matches lower-cased structured fields, caps visible
results, and renders title, breadcrumb, and purpose. It does not index page prose and needs no
server. CSS covers narrow layouts, keyboard focus, child cards, breadcrumbs, reading paths, topic
steps/rules, and collapsed references using existing theme tokens.

- [x] **Step 6: Run focused renderer tests and confirm topic direct-entry, escaping, relative links, and search structure pass**

- [x] **Step 7: Write failing draft and CLI tests for recursive JSON/HTML output**

```ts
runCli(["--repo", repo, "--out", out]);
expect(existsSync(join(out, "domain-conversation", "context-building", "context-building.json"))).toBe(true);
expect(existsSync(join(out, "domain-conversation", "context-building", "compaction", "compaction.html"))).toBe(true);
const compaction = readFileSync(join(out, "domain-conversation", "context-building", "compaction", "compaction.html"), "utf8");
expect(compaction).toContain("Context building");
expect(compaction).toContain("../context-building.html");
```

- [x] **Step 8: Implement `buildTopicDraft`, config-driven recursive discovery, and topic rendering in full, domain, all, and blocks modes**

Full scan writes drafts only where absent unless `--force`. `--domain` regenerates the selected
domain subtree. `--all` uses the config tree when available and falls back to recursive discovery
of known document JSON. The CLI supplies derived navigation rather than storing copied
breadcrumbs/paths in authored JSON.

- [x] **Step 9: Run `npm test -- test/atlas-blocks.test.ts test/assemble-atlas.test.ts test/gather-atlas.test.ts test/atlas-cli.test.ts` and `npm run typecheck`**

- [x] **Step 10: Commit `feat: render hierarchical atlas topics`**

---

### Task 3: Per-Page Freshness, Integrity Checks, and Readability Warnings

**Files:**
- Modify: `src/atlas-tree.ts`
- Modify: `src/lint-atlas.ts`
- Modify: `assets/atlas-check.mjs`
- Modify: `test/lint-atlas.test.ts`
- Create: `test/atlas-check.test.ts`

**Interfaces:**
- Produces `lintTopic(blocks, shape)` and common `lintReadability(blocks, pageKind)`.
- Produces deterministic page fingerprint inputs: system configuration summaries, domain modules plus child summaries, and topic evidence files plus child summaries.
- The emitted checker exits nonzero for integrity problems and zero for advisory warnings alone.

- [x] **Step 1: Write failing readability tests with hand-authored strings**

```ts
expect(lintReadability([
  { type: "topic-tldr", id: "tldr", heading: "x", summary: "PR #42 replaced the old task implementation.", inputs: [], outputs: [] },
], "topic")).toEqual(expect.arrayContaining([
  expect.stringMatching(/project history/i),
]));
```

Add independent tests for a paragraph over 100 words, a child-card purpose over about 40 words,
domain visible prose over 1,200 words, topic visible prose over 2,000 words, and more than one
independent mechanism signal. Tests assert warnings, not exact complete prose.

- [x] **Step 2: Run `npm test -- test/lint-atlas.test.ts` and confirm the new exports/behaviors fail**

- [x] **Step 3: Implement visible-text extraction and advisory linting**

Count authored visible prose while excluding diagram source, code HTML, and implementation-reference
file details. Detect history terms with bounded, case-insensitive patterns that avoid matching
ordinary words. `lintDomain` becomes orientation-first when navigation has child topics: it does
not require a depth block, but still requires lead, architecture, seams, and clear child purposes.
`lintTopic` requires the lead and the structured sections appropriate to its configured shape.

- [x] **Step 4: Run focused lint tests and confirm legacy canonical pages still produce only intentional warnings**

- [x] **Step 5: Write failing black-box checker tests**

Create a temporary repository and atlas output, copy `atlas-check.mjs`, run it with plain Node, and
assert observable exit/output for:

- missing nested page;
- unresolved source group;
- duplicate configured path;
- broken generated HTML link;
- missing system/domain/topic stamps;
- independently stale topic evidence while its parent remains current;
- advisory density/history output with exit code zero;
- derived system domain count mismatch.

- [x] **Step 6: Extend the self-contained checker to walk the recursive tree**

Use the same path formulas and minimal glob behavior as `atlas-tree.ts`. Hash every resolved file in
a topic's labeled sources plus serialized child title/purpose summaries. Hash domain modules plus
child summaries. Hash the system's repo/domain/topic/read-path structure. Support `--stamp` with no
IDs (all pages) or stable page IDs, retain domain-slug compatibility when unambiguous, and write
`verifiedAgainst` into each page JSON.

- [x] **Step 7: Add integrity validation and advisory reporting**

Validate configured JSON/HTML existence, reachability, relative local href targets, source groups,
structured topic claims, derived atlas counts, grounding references, and stamps. Print integrity
problems under a failing heading and readability observations under a non-failing warning heading.

- [x] **Step 8: Run `npm test -- test/lint-atlas.test.ts test/atlas-check.test.ts test/atlas-cli.test.ts` and `npm run typecheck`**

- [x] **Step 9: Commit `feat: verify atlas pages independently`**

---

### Task 4: Authoring and Review Workflow Documentation

**Files:**
- Modify: `skills/visual-atlas/SKILL.md`
- Modify: `skills/atlas-review/SKILL.md`
- Modify: `skills/shared/atlas-components.md`
- Modify: `README.md`
- Modify: `test/skill-docs.test.ts`

**Interfaces:**
- Documents the exact configuration, block, CLI, navigation, lint, freshness, and regeneration behavior implemented in Tasks 1–3.

- [x] **Step 1: Write failing skill-behavior contract tests**

Tests require the visual-atlas skill to document recursive topics, grouped include/exclude sources,
overlap, topic shapes, current truth, child-page extraction, density warnings, and root-level topics.
Tests require atlas-review to say it may rewrite coherent current truth, must remove project history,
must review only stale page evidence, and must not preserve prose merely because individual
sentences remain accurate.

- [x] **Step 2: Run `npm test -- test/skill-docs.test.ts` and confirm the new contracts fail**

- [x] **Step 3: Rewrite visual-atlas guidance around orientation and recursive depth**

Replace the two-level/depth-required standard with system/domain/topic page ladders. Include a
complete config example, reader-question child-card guidance, topic-shape guidance, one-home-per-fact,
current-truth exclusions, source-scope semantics, clean regeneration, and the revised CLI/checker
workflow. Preserve valid tool-location and diagram guidance.

- [x] **Step 4: Rewrite atlas-review and the component catalog**

Document scoped per-page review, independent stamps, parent-summary propagation, advisory versus
hard checks, the four new blocks, hierarchical paths/navigation/search, and the Telltale-shaped
domain -> context building -> compaction example.

- [x] **Step 5: Update README user-facing summaries and commands**

Describe recursive topic pages and per-page freshness without exposing implementation history.

- [x] **Step 6: Run `npm test -- test/skill-docs.test.ts test/install-skills.test.ts` and `npm run typecheck`**

- [x] **Step 7: Commit `docs: teach hierarchical atlas authoring`**

---

### Task 5: End-to-End Validation and Telltale Pilot

**Files:**
- Modify in Telltale `misc` lane: `.visual/atlas/atlas.domains.json`
- Regenerate in Telltale `misc` lane: `.visual/atlas/atlas.json`, conversation-engine domain/topic JSON and HTML, `atlas-check.mjs`
- Create in visual-skills: `test/fixtures/atlas-hierarchy/` only if the real pilot exposes a missing deterministic fixture case

**Interfaces:**
- Consumes the shipped CLI, renderer, checker, and skills from Tasks 1–4.
- Produces benchmark evidence for the six approved conversation-context questions.

- [x] **Step 1: Verify the visual-skills branch with the focused atlas suite and typecheck**

Run:

```bash
npm test -- test/atlas-config.test.ts test/atlas-tree.test.ts test/atlas-blocks.test.ts test/assemble-atlas.test.ts test/gather-atlas.test.ts test/lint-atlas.test.ts test/atlas-check.test.ts test/atlas-cli.test.ts test/skill-docs.test.ts test/install-skills.test.ts
npm run typecheck
```

- [x] **Step 2: Establish a fresh Telltale `origin/main` pilot workspace without interfering with the occupied `misc` lane**

The named `misc` worktree was already on unrelated branch `pr-review-gate-parallel` (+1/-8). Per
Telltale's lane isolation rule, the pilot did not switch or reset that live workspace. It used a
disposable local clone at exact `origin/main` commit `2b141d4fa8d6de2e4764528bab0485a4df9fe8f8`
instead. This preserves the intent—fresh main and no interference—while leaving the occupied lane
untouched. No Telltale branch or PR was created.

- [x] **Step 3: Record the existing conversation-engine baseline**

Record visible word count, longest paragraph, history-term count, current pages, and whether the six
benchmark questions have direct destinations. Do not reuse historical prose as authority.

- [x] **Step 4: Author the fresh topic tree and source groups from current Telltale code**

At minimum author conversation-engine -> context-building -> compaction-and-summarization. Group
scattered entry-point, assembly, storage, and compaction evidence with labeled include/exclude
scopes. Add a root-level lifecycle topic only if current code supports a coherent cross-domain
reader destination.

- [x] **Step 5: Generate the replacement subtree, answer the benchmark from docs, and run the emitted checker**

The pilot passes only when answers are correct and more direct, the landing page is materially
smaller, no project-history prose remains, direct child entry works, and the checker has complete
per-page coverage. Inspect desktop/narrow layouts and light/dark theme output.

- [x] **Step 6: If the pilot reveals a generator defect, reproduce it with a failing visual-skills test before fixing it**

- [x] **Step 7: Run final visual-skills verification, inspect the complete diff, and commit any pilot-driven generator fixes**

- [x] **Step 8: Use the requesting-code-review and finishing-a-development-branch workflows, then open one visual-skills PR**

  The final independent review found no remaining blockers after regression coverage for live glob
  membership, config-owned page identity, evidence-scoped references, safe stamp paths,
  immediate-child freshness boundaries, owner-scoped reading paths, and cross-directory config
  copying. The full suite passes with 409 tests and TypeScript typechecking passes.

The Telltale lane remains a separate repository boundary. Report its exact validation state and do
not open or merge an additional Telltale PR under the instruction to open a single PR.

#### Telltale pilot record

**Baseline at `origin/main` (`2b141d4f`):** Conversation Engine was one HTML page. Its authored JSON
contained 14,562 visible prose words, a 1,433-word longest prose field, and 63 task/PR/review/
supersession references. Context construction and compaction were anchors inside the same page, so
all six reader questions loaded the entire domain.

**Regenerated subtree:** The authored tree is Conversation Engine → Context building → Compaction
and summarization. Evidence groups cover assembly/token policy, turn call sites, system-prompt
composition, summary storage, the summarizer contract, and the compaction algorithm. The landing is
225 visible words with a 19-word longest field; Context building is 580 words; Compaction and
summarization is 655 words. All three have zero history references. The landing is 98% smaller while
retaining purpose, boundary, one-turn architecture, data, seams, and a collapsed implementation
reference.

The generated docs answer the six benchmark questions from three direct destinations:

1. Context building lists system prompt, summary/transcript, core memory, ordering, and the final cap.
2. Compaction states the 8,000-token entry threshold and 3,000-token old-bucket trigger.
3. Compaction explains the append-only `InterviewSummary` parent chain and `messageCount` cursor.
4. Context building identifies opening/send/redirect call sites and the ordinary-turn fan-out.
5. Context building and Compaction state the 4,000-token failure fallback and final 16,000-token cap.
6. The domain landing and reading path place context construction inside one fenced interview turn.

Headless browser checks covered all three pages at 1440×900 light and 375×812 dark. Breadcrumb
depths were 2/3/4, child cards 1/1/0, implementation references stayed collapsed, the 14-entry
search index loaded, and no page errors occurred. The first narrow run exposed topbar overflow; a
failing assembler test reproduced it before the responsive CSS fix. The final run had no horizontal
overflow.

The emitted checker independently stamped the three reviewed page IDs. A full-atlas check has no
failure for the regenerated subtree, but remains nonzero for pre-existing out-of-scope debt: an
ungrounded `createWorkRunner` claim on Transcript Analysis, a missing system stamp, and stale source
stamps on Books and Questions, Story Synthesis, Engine Contracts, Identity and Access, and Transcript
Analysis. Advisory history/density warnings also remain on the pre-existing system and domain pages;
those results validate that the new review contract covers the earlier historical-prose problem but
do not authorize silently rewriting unrelated Telltale domains in this visual-skills PR.
