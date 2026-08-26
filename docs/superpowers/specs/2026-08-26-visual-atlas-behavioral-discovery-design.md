# Visual Atlas Behavioral Discovery — Design

**Date:** 2026-08-26
**Status:** Approved for implementation

## Goal

Make `visual-atlas` independently discover the important behavior of a codebase before it chooses
the page tree. A generated domain must give readers a complete orientation to its significant
runtime responsibilities while moving coherent mechanisms into focused child pages.

This change strengthens the agentic authoring workflow. It does not teach the skill a known
Telltale outline, turn the scanner into a semantic analyzer, or add a persisted discovery schema.

## Problem

The hierarchy work gives the atlas good places to put depth, but the current workflow starts with
"choose the page tree" and offers only broad editorial heuristics. An author can inspect a central
file, select one conspicuous mechanism, and produce a valid but incomplete domain. Structural and
freshness checks still pass because they verify configured pages and evidence, not whether the
author overlooked a major responsibility before configuring them.

The failure is therefore upstream of rendering:

1. discovery is informal and can stop after the first coherent topic;
2. directory and module inventories are easier to see than end-to-end behavior;
3. no required artifact accounts for significant responsibilities;
4. page validation begins only after omissions have disappeared from the configured world.

## Design principles

1. **Trace behavior before naming pages.** The reader hierarchy is a result of source-grounded
   discovery, not the starting assumption.
2. **Follow journeys across boundaries.** Client preparation, routes, orchestrators, durable
   effects, asynchronous work, recovery, and termination may all belong to one reader journey even
   when they live in different folders.
3. **Account for responsibilities explicitly.** Every significant responsibility receives a
   documentation disposition before prose is written.
4. **Use generic behavioral signals.** The skill names things to look for—entrypoints, guards,
   state transitions, fan-out, convergence, writes, failures, cleanup—not repository-specific
   phases or expected page titles.
5. **Keep judgment agentic.** Static tooling inventories evidence and verifies authored claims; it
   does not silently decide the conceptual hierarchy.
6. **Validate without leaking the answer.** Forward tests expose only the repository, current
   skill, and reader task. They do not expose the suspected omission or an expected outline.

## Required discovery contract

Before editing `atlas.domains.json` or page JSON, the author must build a temporary discovery brief
from current source. The brief has three parts.

### Journey traces

Choose the smallest representative set of user or system journeys that exercises the domain's
meaningful behavior. For each journey, record:

- trigger and entrypoint;
- boundary crossings and central orchestrators;
- ordered phases and important state transitions;
- guards, leases, budgets, deadlines, or other admission controls;
- asynchronous branches and the point at which they converge;
- durable writes and externally visible effects;
- terminal signals, cleanup, cancellation, and recovery paths;
- repository-relative evidence for every claim.

A journey is incomplete if it begins after meaningful preparation or ends before externally
visible work, cleanup, or recovery. The author follows calls and data across files rather than
stopping at a directory boundary.

### Responsibility ledger

Convert the traces and source inventory into a de-duplicated ledger. Each row states:

- the responsibility in reader language;
- why it matters to understanding or operating the system;
- its source evidence;
- which journey or system invariant exposed it;
- its documentation disposition.

Allowed dispositions are:

- summarize on the domain landing page;
- explain on a dedicated topic page;
- explain on a nested topic page;
- cover in another domain or cross-cutting page, with a link;
- omit, with a concrete reason such as generated code or incidental implementation detail.

"Not selected as a topic" is not an omission reason. A responsibility can remain on a landing page
without becoming a child, but it must still be visible in the domain's orientation.

### Coverage decision

Only after the ledger is complete may the author choose the page tree. The decision must satisfy:

- the domain landing page gives a high-level end-to-end account of its primary journeys;
- every high-significance ledger row has a visible home or a link to its canonical home;
- a child page owns a coherent reader question, mechanism, algorithm, lifecycle, data model, or
  integration—not a folder name;
- a parent summarizes each child without copying its full explanation;
- source groups cover the evidence actually used to explain the page;
- related and reading-path links preserve important cross-domain journeys.

The discovery brief is a working artifact for the author and final handoff, not a new committed
atlas file in this iteration. The durable products remain the configured tree, page JSON, rendered
HTML, and per-page evidence stamps.

## Exploration method

The skill should prescribe a compact, adaptable exploration loop rather than one language-specific
command sequence:

1. Inventory runtime entrypoints, user-facing adapters, routes, jobs, and central orchestrators.
2. Use imports, calls, shared state, and persisted effects to choose representative journeys.
3. Read complete orchestration functions and their material callees; do not infer behavior from
   filenames alone.
4. Mark sequence, branching, convergence, state mutation, failure, cancellation, and cleanup.
5. Search for companion entrypoints and variants that change the journey.
6. Build and challenge the responsibility ledger: ask what important behavior remains unaccounted
   for before designing pages.

Repository size controls sampling depth, not whether the contract applies. Small repositories may
need one trace; large domains may need several. High-centrality files are leads, not automatic page
boundaries.

## Completion and red flags

The existing definition of done gains a pre-authoring coverage gate. The atlas is not ready to
render when any of these conditions is true:

- the proposed hierarchy was derived mainly from directories or filenames;
- a primary journey starts at an internal service despite earlier user-facing preparation;
- a central orchestrator contains meaningful phases absent from the ledger;
- parallel branches are collapsed into "calls services" with no purpose or convergence point;
- durable effects, terminal signaling, cleanup, cancellation, or recovery are unaccounted for;
- a large domain has one narrowly selected child but no explanation of its other major behavior;
- a responsibility has no disposition or an unsupported omission reason;
- page evidence covers the selected prose but not the source used during discovery.

These are authoring failures. They are not new hard checker errors because the checker cannot prove
semantic completeness from configuration alone.

## Blind validation

Skill behavior follows RED-GREEN-REFACTOR:

1. Run a fresh-context, read-only agent against the current skill and an untouched subject-repo
   snapshot. Ask for a domain hierarchy and detailed source-grounded outline.
2. Exclude existing generated atlas files, project plans, specs, and git history from the agent's
   evidence. Do not mention suspected omissions or expected pages.
3. Preserve the raw baseline output and score whether it traces representative journeys, exposes
   orchestration semantics, accounts for significant responsibilities, and maps them to a
   conceptual hierarchy.
4. Add the smallest positive discovery recipe and required output shape that addresses observed
   baseline omissions.
5. Run the same task with a separate fresh-context agent using the revised skill.
6. If the second agent finds a new loophole, refine the contract and repeat without adding
   subject-specific answers.

Telltale's Conversation Engine is the first subject because its implementation crosses client,
route, service, context, model, persistence, and lifecycle boundaries. Passing requires a useful
end-to-end orientation and justified deeper pages grounded in current code. It does not require
matching one predetermined vocabulary or exact page tree.

## Implementation scope

This iteration changes:

- `skills/visual-atlas/SKILL.md`, adding the discovery contract before page-tree authorship;
- focused skill-documentation tests that make the required output slots and ordering explicit;
- the Telltale pilot output, regenerated only after blind validation from independent source
  analysis.

This iteration does not change:

- scanner topic inference;
- atlas configuration or block schemas;
- renderer layout or navigation;
- freshness fingerprint semantics;
- Telltale application source;
- the existing readability, current-truth, hierarchy, and historical-prose requirements.

## Verification

- Capture the blind baseline before modifying the skill.
- Add and observe a focused failing documentation test.
- Run that test after the minimal skill revision.
- Run a fresh blind forward evaluation and compare it with the baseline using the generic rubric.
- Regenerate the Conversation Engine pilot without copying the user's example into the skill or
  agent prompt.
- Run the relevant atlas tests, full test suite, and TypeScript typecheck.
- Run the generated atlas checker against repository-owned atlas artifacts and the Telltale pilot.
- Confirm the branch contains no Telltale application changes and no user-owned `.superpowers/`
  files.
