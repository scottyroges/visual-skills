# Visual Atlas Topic Substance — Design

**Date:** 2026-08-26
**Status:** Approved for implementation

## Goal

Make recursive Atlas pages teach their subject in enough depth that opening a child feels like
entering a technical chapter, not expanding an outline. Preserve the improved conceptual hierarchy
while requiring each topic to explain the mechanism, decisions, invariants, and observable failure
behavior supported by its source.

## Baseline failure

The first Telltale hierarchy pilot split the Conversation Engine into useful reader-owned pages, but
the content did not earn those pages:

- `context-building.json` contained 72 total JSON-string words and empty inputs, outputs, flow,
  guarantees, failures, and file descriptions;
- `compaction-and-summarization.json` contained 67 total JSON-string words and the same empty draft
  fields;
- the remaining topic pages mostly repeated one lead, one short flow, one rules block, and one
  implementation index;
- only one topic had a diagram and none had a worked example;
- the empty topics rendered and received verification stamps because current checks require block
  types, not substantive block contents.

The source is not shallow. The context service alone has multiple assembly paths, four token
budgets, summary chaining, memory placement rules, reserved-output accounting, and a truncation
fallback. The failure is in authoring and acceptance, not available evidence.

## Design principles

1. **Progressive disclosure relocates detail.** Parents stay concise because child pages carry the
   explanation; extraction is not permission to discard it.
2. **Depth is shape-specific.** An algorithm earns substance through decisions and edge cases; a
   lifecycle through states and recovery; an integration through protocol and reconciliation.
3. **Teach prediction, not recognition.** A reader should be able to predict what the system will do
   in a representative new case after reading the page.
4. **Automate only objective floors.** Empty fields and untouched draft descriptions are hard
   integrity failures. Explanatory quality remains an editorial judgment supported by advisories
   and forward evaluation.
5. **Examples carry evidence.** Multi-stage runtime behavior should include a grounded worked trace
   or diagram that makes state and decisions move visibly.
6. **Stamps mean review.** The checker must refuse to stamp materially empty topics; a source hash
   cannot certify prose that was never authored.

## Page teaching brief

After the responsibility ledger assigns a topic, create a compact teaching brief before writing its
JSON. It contains:

- the reader question the page answers;
- the mental model or load-bearing idea;
- the inputs, outputs, and state transformed;
- the decisions, invariants, thresholds, or transition rules that make the behavior non-obvious;
- one representative trace or concrete scenario;
- failures, recovery, and externally visible outcomes;
- source evidence for each explanation.

The authored page should be traceable to this brief. A page is complete when its blocks answer the
brief coherently, not when every block type exists.

## Shape-specific substance contract

### Mechanism

Explain inputs, ordered transformations, outputs, state changes, important collaborators, and the
reason for the ordering. Show a grounded trace or diagram when the mechanism crosses several stages
or boundaries.

### Algorithm

Explain the objective, inputs, thresholds or priorities, decision branches, invariants, edge cases,
and fallback behavior. Include a worked example with concrete values or records that exercises at
least one meaningful branch.

### Lifecycle

Explain states or phases, entry triggers, legal transitions, guards, terminal states, cancellation,
and recovery. Include a state/sequence diagram or a trace through one normal and one abnormal path.

### Integration

Explain both sides of the boundary, request and response shape, ordering, deadlines, retry or
idempotence behavior, cancellation, and reconciliation. Include a sequence or representative
exchange.

### Data model

Explain entities, relationships, ownership, constraints, mutation paths, lifecycle, and the queries
or invariants the model exists to support. Include a representative record or state transition when
it clarifies the model.

The shapes are teaching contracts, not word-count templates. Omit a named element only when it is
genuinely inapplicable, and make the page explain the corresponding invariant or absence instead.

## Objective integrity floor

Every configured topic must contain:

- a `topic-tldr` with a non-empty summary, at least one input, and at least one output;
- a `topic-flow` with at least two non-empty steps;
- a `topic-rules` block with at least one guarantee and either a condition/behavior failure row or a
  non-empty introduction explaining why no material failure branch applies;
- an `implementation-reference` with at least one group and file, and a non-empty description for
  every referenced file.

These are hard checker problems. Stamp mode performs a second no-write preflight after reading and
grounding page documents; if any configured topic misses the floor, no page JSON is mutated.

## Editorial advisories

The renderer and emitted checker should also warn when:

- a topic has fewer than roughly 180 visible narrative words;
- a topic has four or more flow steps but neither a diagram nor a worked example;
- a topic's worked example is absent where its configured shape is `algorithm`.

These warnings do not set the exit code because short, static, or unusually visual topics can still
be legitimate. The skill instructs the author to inspect each warning and improve the page rather
than pad it mechanically.

## Skill and catalog changes

Keep the main skill under 500 lines. Add a concise `Substance gate` after page-tree selection that
requires page teaching briefs and defines the acceptance question: can the reader predict behavior
in a representative case? Put the detailed shape contracts in `skills/shared/atlas-components.md`,
which the authoring workflow already requires agents to read.

Add red flags for:

- a child page that only repeats its purpose in four empty or one-sentence blocks;
- identical topic ladders with no shape-specific evidence;
- a multi-stage mechanism with no grounded trace or diagram;
- stamping any page that was not read and enriched against its current source.

## Telltale pilot acceptance

Re-author all 12 Conversation Engine pages in the disposable Telltale snapshot, not only the two
empty topics. Keep the current hierarchy unless source review shows a real ownership conflict.

Acceptance requires:

- zero empty required topic fields or implementation descriptions;
- shape-specific explanations grounded in current source;
- worked traces or diagrams for multi-stage pages;
- detailed Context building and Compaction and summarization chapters covering their actual
  ordering, thresholds, branches, and fallback behavior;
- clean render warnings for the Conversation Engine subtree;
- successful page-specific stamps after review;
- browser review of the landing, turn lifecycle, context building, compaction, and representative
  sibling topics.

The disposable pilot may retain unrelated warnings or integrity failures in untouched Telltale
domains. No Telltale application source is changed or committed to this repository.

## Testing and verification

- Add RED linter tests reproducing an untouched topic draft and an outline-only multi-stage topic.
- Add a RED checker test proving stamp mode currently writes materially empty topics.
- Implement the minimal linter/checker behavior and observe GREEN.
- Forward-test the revised skill on a source-grounded topic task without revealing the expected
  outline or Telltale diagnosis.
- Run focused tests, the full test suite, TypeScript typecheck, repository Atlas check, and diff
  hygiene.
- Confirm only intended files are committed and the user-owned `.superpowers/` path remains
  untouched.

## Non-goals

This phase does not add semantic source analysis to the scanner, impose a minimum prose word count as
a hard error, redesign the renderer, change the recursive configuration schema, or modify Telltale
application code.
