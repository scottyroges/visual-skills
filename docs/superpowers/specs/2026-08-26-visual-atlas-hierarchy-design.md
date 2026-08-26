# Visual Atlas Hierarchy and Readability — Design

**Date:** 2026-08-26
**Status:** Approved (brainstorming)

## Goal

Make `visual-atlas` useful as both an orientation guide and a technical reference without making
every reader load an entire domain into context at once.

The atlas becomes a navigable, recursive page tree:

```text
System
└── Domain
    └── Topic
        └── Nested topic
```

System and domain pages answer, "Where am I, what lives here, and where should I go next?" Topic
pages answer a narrower technical question in enough depth to understand how that part of the
system works. A topic may be backed by one file, many files in a folder, or code spread across the
repository. The page hierarchy represents the reader's mental model, not the filesystem.

Telltale's conversation-engine domain is the required first validation subject. In particular,
context building becomes a child topic and compaction/summarization becomes a nested child of
context building. This pilot is a clean regeneration from current code, not a migration of the
existing prose.

## Why change the current atlas

The present atlas is structurally two levels: system and domain. A domain page is expected to hold
its overview, components, data, seams, flows, files, exports, and connections. That works for small
domains, but large domains become long reference dumps with no natural place to put a focused
explanation.

Three behaviors compound the problem:

1. The renderer expands nearly all detail at once instead of separating orientation from depth.
2. The review workflow favors minimal edits to existing prose, so historical explanations accrue
   rather than being rewritten into one current account.
3. Verification checks coverage and freshness more strongly than readability, information scent,
   or whether a claim is still the best description of current behavior.

Telltale exposes all three issues. Its conversation-engine page contains several independent
mechanisms and a large amount of cumulative history. A reader looking for context assembly or
compaction must search through unrelated material even though each subject supports a coherent,
smaller page.

## Design principles

1. **Orientation before depth.** A landing page should help the reader choose what to open, not
   reproduce every child page.
2. **One home per fact.** A mechanism is explained fully in one place. Parent and related pages
   summarize it and link to that home.
3. **Current truth, not project history.** Atlas prose describes how the system works now. Tasks,
   review rounds, PRs, superseded designs, and migration chronology do not belong in the standing
   architecture reference.
4. **Reader structure is not file structure.** Topics are conceptual. Their evidence can be
   scattered, overlapping, and cross-domain.
5. **Authored hierarchy, mechanical verification.** A human or agent chooses the page tree.
   Scanning suggests possible extractions and verifies evidence, but never silently reorganizes
   the docs.
6. **Progressive disclosure without dead ends.** A page is useful on direct entry, while clear
   parent, child, sibling, and related links make deeper exploration cheap.
7. **Advisory readability rules, hard integrity rules.** Broken paths and invalid evidence scopes
   fail verification. Density warnings provoke editorial judgment rather than mechanically
   splitting prose.

## Information architecture

### Page types

#### System page

The system page is the map of the whole product. It contains:

- a short statement of what the system does;
- the few concepts a newcomer must hold in mind;
- one system architecture or runtime diagram;
- domain cards with a one-line purpose and a useful next question;
- cross-cutting topics that do not have a natural domain owner;
- curated reading paths for common reader goals.

It must not contain a compressed copy of every domain's component inventory.

#### Domain page

A domain page is an orientation-first landing page that remains useful on its own. It contains:

- purpose, responsibilities, and boundaries;
- one architecture or runtime diagram;
- child-topic cards;
- data ownership and important seams with neighboring domains;
- a compact, collapsed implementation index;
- suggested reading paths through the domain.

The domain page gives each child mechanism a small blurb and a reason to open it. It does not
inline the child's full explanation.

#### Topic page

A topic page provides practical technical understanding of one mechanism, algorithm, data model,
lifecycle, or integration. It begins with a plain-language summary, then covers the parts relevant
to its shape:

- what it does and when it runs;
- inputs and outputs;
- the main flow or algorithm;
- guarantees and invariants;
- failure and fallback behavior;
- one grounded example;
- child topics, when an internal mechanism deserves independent treatment;
- a collapsed implementation reference with source pointers.

Topic pages are recursive. The expected readability ceiling is two topic levels beneath a domain,
which supports `domain -> context building -> compaction`. Deeper nesting is valid but warns so the
author reconsiders whether the branch is becoming a separate domain or cross-cutting topic.

#### Root-level topic

A mechanism that crosses several domains may live directly beneath the system page. For example,
"One interview turn" can explain an end-to-end lifecycle without being forced into whichever
domain owns its entry point. It uses the same topic model and may link to domain-owned details.

### Topic shapes

An optional `shape` gives the author and renderer a sensible section ladder without changing the
underlying page type:

- `mechanism` — inputs, stages, outputs, safeguards;
- `algorithm` — objective, ordered logic, thresholds, edge cases, worked example;
- `data-model` — entities, relationships, ownership, lifecycle, constraints;
- `lifecycle` — states or phases, transitions, triggers, recovery;
- `integration` — boundary, protocol, request/response flow, failure behavior.

The shape is guidance, not permission to fill irrelevant sections.

### Hierarchical paths

Output paths mirror the conceptual tree so a copied URL carries useful context:

```text
atlas.html
domain-conversation-engine/domain-conversation-engine.html
domain-conversation-engine/context-building/context-building.html
domain-conversation-engine/context-building/compaction/compaction.html
```

Slugs are stable identifiers. Moving or renaming a page is an explicit authored change; the
generator does not infer it from source movement.

## Authored configuration

`atlas.domains.json` remains the source of domain ownership and gains an explicit topic tree.
Domain module ownership and topic evidence are deliberately different concepts.

An illustrative shape is:

```jsonc
{
  "domains": [
    {
      "slug": "conversation-engine",
      "name": "Conversation Engine",
      "purpose": "Runs an interview conversation from turn intake through model response.",
      "globs": ["apps/api/src/conversation/**"],
      "topics": [
        {
          "slug": "context-building",
          "title": "Context building",
          "purpose": "How stored conversation state becomes ordered model input.",
          "shape": "mechanism",
          "aliases": ["context builder", "prompt context"],
          "sources": [
            {
              "label": "Entry point",
              "include": ["apps/api/src/**/build-context.ts"]
            },
            {
              "label": "Context assembly",
              "include": ["apps/api/src/context/**/*.ts"],
              "exclude": ["**/*.test.ts"]
            },
            {
              "label": "Stored summaries",
              "include": ["packages/db/src/**/*summary*.ts"]
            }
          ],
          "topics": [
            {
              "slug": "compaction",
              "title": "Compaction and summarization",
              "purpose": "How older conversation content is reduced and reused.",
              "shape": "algorithm",
              "sources": [
                {
                  "label": "Compaction policy",
                  "include": ["apps/api/src/context/**/*compact*.ts"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Exact field names may be refined during implementation, but the following semantics are locked:

- authors control slug, title, purpose, order, sources, and children;
- source groups have reader-facing labels plus include and optional exclude globs;
- all matching files contribute to that page's verification fingerprint;
- source scopes may overlap between pages;
- a topic does not claim ownership of its source files;
- evidence may span folders and domains;
- source scopes resolve at file granularity, not symbol granularity.

File-level fingerprints are intentionally conservative. Symbol hashing would be brittle across
languages and refactors, while a changed evidence file is a useful signal to review the page even
when only one part of the file is relevant.

## Authored content model

Each page has structured, page-specific content instead of inheriting the complete domain block
set. The content schema needs to support:

- a plain-language lead;
- structured flow, inputs, outputs, invariants, and failures;
- diagrams and grounded examples;
- concise child summaries;
- implementation references;
- related pages and reading-path membership.

Parent summaries are intentionally small and may be derived from a child's title and purpose.
Detailed claims live in the child page. Counts, source lists, paths, breadcrumbs, and page
relationships are derived wherever possible rather than copied into prose.

### Density and current-truth contract

The linter warns when content is likely to overload the reader. Initial thresholds, calibrated
against the Telltale pilot, are:

- titles, labels, and navigation use plain user-facing language;
- a child card is roughly 40 words or fewer;
- paragraphs are no more than four sentences or roughly 100 words;
- three or more parallel facts should normally be a list or structured group;
- a domain page warns around 1,200 visible prose words;
- a topic page warns around 2,000 visible prose words;
- a topic page warns when it contains multiple independently explainable mechanisms;
- references to tasks, PRs, review rounds, superseded behavior, or chronology warn.

These are editorial signals, not automatic transformations. The remedy can be to shorten,
restructure, remove history, or extract a child page. The linter must not auto-split content.
Visible-prose measurements exclude diagram source, code samples, and collapsed implementation
references where appropriate, so the signal matches the reading experience.

## Scanner responsibilities

The scanner supports authorship without becoming an information architect. It reports:

1. **Domain coverage** — new, stale, or unassigned modules relative to domain ownership.
2. **Topic evidence health** — source groups that resolve to no files and files that changed since
   their page was reviewed.
3. **Candidate extraction signals** — unusually large component counts, high visible-prose
   density, dependency clusters, or substantial algorithms that might deserve a topic.

Suggestions are nonbinding and explain their evidence. The scanner never creates a page, moves a
page, or mutates the topic tree without an authored change.

## Rendering and navigation

Every page is self-contained enough for direct entry and provides:

- breadcrumbs from system to the current page;
- a sidebar with only the current branch expanded;
- child cards phrased as reader questions or outcomes;
- parent and sibling navigation;
- curated related-topic links, including cross-domain relationships;
- a brief owner/domain context on deep-linked topic pages;
- stable relative links that work from committed `file://` output.

The entire hierarchy should not be expanded in the sidebar. A reader sees their current branch and
nearby choices, preserving location without reproducing the atlas tree on every page.

### Search

The generated atlas includes a compact embedded search index so it works without a server. The
index contains structured discovery fields:

- page titles and purposes;
- aliases and key identifiers;
- source paths;
- breadcrumb labels.

A result shows its breadcrumb and purpose. Search does not index every prose token; it is a route
finder, not a replacement for reading or repository search.

### Reading paths

Authors can curate short paths such as "Understand one interview turn" or "Debug context size."
Each path is an ordered list of existing pages. Reading paths are visible on the system or domain
landing page and link into the same canonical topic pages rather than duplicating content.

## Freshness and verification

Freshness is tracked per page instead of treating a generated domain subtree as one unit.

- The system page depends on configuration, domain titles/purposes, links, and the page tree.
- A domain page defaults to domain-owned modules plus the title/purpose summaries of its children.
- A topic page depends on its explicit source scopes plus the title/purpose summaries of its
  children.
- A nested topic is independently reviewable and independently stamped.

The checker has two classes of result.

### Hard integrity failures

- duplicate or invalid paths/slugs;
- missing, orphaned, or unreachable configured pages;
- broken parent, child, sibling, related, reading-path, or search links;
- source globs that resolve to no files;
- missing required structured claims for the page shape;
- stale or contradictory derived metadata;
- missing system, domain, or topic freshness coverage.

### Advisory warnings

- density and long-paragraph thresholds;
- historical or superseded language;
- topic depth beyond the expected ceiling;
- possible extraction candidates;
- unclear titles, purposes, or child-card information scent.

The checker derives counts, paths, breadcrumbs, navigation, and source matches itself. Generated
metadata should not be hand-maintained when it can be computed from configuration and current
content.

## Atlas review behavior

Review is allowed to rewrite a page into one coherent current explanation. It should not preserve
accurate sentences merely because they already exist if the page as a whole is confusing.

For a scoped review:

1. identify pages whose evidence changed;
2. read the current implementation and verify the page's claims;
3. rewrite for current truth, removing historical accumulation;
4. update parent summaries only when the child's purpose or relationship changed;
5. re-render and stamp only the pages actually reviewed;
6. report remaining stale pages separately.

This replaces a "minimal textual edit" bias with a "smallest coherent current-truth update" bias.

## Telltale validation pilot

The first real validation is a fresh conversation-engine subtree generated from Telltale's
current `origin/main`. The work must use Telltale's `misc` lane so it does not interfere with other
work.

The pilot does not migrate or mechanically convert the existing domain page. Existing prose may
be used as a lead to inspect, but every retained fact must be verified against current code. The
new subtree atomically replaces the old conversation-engine output for the pilot PR.

The target branch includes at least:

```text
Conversation Engine
└── Context building
    └── Compaction and summarization
```

Additional conversation topics are authored only when current code and the reader benchmark show
they provide a coherent destination. The goal is not to maximize page count.

### Reader benchmark

A cold reader should answer these questions from the generated docs without searching the code:

1. What enters model context, and in what order?
2. When does compaction happen?
3. Where are summaries stored, and how are they reused?
4. What invokes context building?
5. What happens when the context budget is exceeded?
6. How does context building fit into one interview turn?

Before and after the pilot, record:

- correctness of answers;
- pages opened and whether the reader chose the right child page;
- irrelevant prose encountered;
- visible word count and longest paragraph on the domain landing;
- historical/process references remaining;
- navigation and direct-entry success;
- source and freshness verification coverage.

The pilot passes only if the benchmark answers become more direct and the conversation-engine
landing page becomes materially smaller without losing essential orientation.

### Visual and interaction checks

Manually inspect:

- desktop and narrow viewport layouts;
- light and dark themes;
- direct entry on context building and compaction pages;
- breadcrumb, back, sibling, child, related, reading-path, and search navigation;
- collapsed implementation references.

## Automated test coverage

Implementation must add focused tests for:

- recursive topic configuration and depth warnings;
- grouped, overlapping include/exclude source scopes;
- hierarchical output paths and stable relative links;
- derived breadcrumbs, branch-expanded sidebar, child cards, and sibling navigation;
- related pages, reading paths, and embedded search results;
- per-page fingerprints and review stamps;
- system/domain freshness and derived metadata;
- hard integrity failures versus advisory readability warnings;
- a canonical nested fixture equivalent to domain -> context building -> compaction.

Relevant tests and a typecheck run after each code-changing task. The docs-only design task does
not alter runtime code.

## Clean regeneration, not migration

Backward compatibility with the current flat domain JSON or HTML is not a design goal. There is no
automatic migration layer and no requirement to preserve the old page structure. The important
artifact is a clearer, accurate atlas generated from current code.

Regeneration should be atomic at the selected subtree boundary: build and verify the replacement,
then replace the old subtree as one scoped change. This avoids a mixed state in which a parent
links partly to old pages and partly to new pages.

## Delivery sequence

Each item below is a separate task and PR. A PR is reviewed and explicitly merged before the next
task starts, following the repository workflow.

1. **Recursive content and configuration model** — add the authored topic tree, flexible source
   groups, path derivation, and canonical nested fixture.
2. **Hierarchical rendering and navigation** — render topic pages, breadcrumbs, branch-local
   sidebar, child/sibling/related links, collapsed implementation references, reading paths, and
   embedded search.
3. **Scanning, freshness, and readability verification** — implement page fingerprints, evidence
   checks, extraction suggestions, integrity failures, and advisory density/current-truth rules.
4. **Skill and review workflow update** — revise `visual-atlas`, `atlas-review`, and shared
   guidance to author hierarchies and maintain coherent current truth.
5. **Telltale conversation-engine pilot** — from fresh Telltale `origin/main`, use the `misc` lane
   to regenerate and benchmark the conversation-engine subtree.

An approved design or implementation plan does not authorize any of these implementation tasks.
Each task starts only after the user's explicit instruction.

## Success criteria

The design succeeds when:

- large domains can expose deep explanations without making their landing pages dense;
- readers can choose the right child page from plain, outcome-oriented summaries;
- a topic can faithfully cover code spread across files, folders, and domains;
- current-truth and density regressions are visible during review;
- every page has valid navigation and independently verifiable evidence;
- direct-linked pages make sense without first reading their parent;
- Telltale readers answer the context-building benchmark more quickly and directly;
- the resulting atlas is materially more useful than a complete regeneration of the current flat
  format.

## Non-goals

- automatically deriving the conceptual page tree from the filesystem;
- preserving or migrating the current flat atlas schema;
- documenting project history, implementation tasks, or PR chronology;
- making every source file belong to exactly one topic;
- using symbol-level fingerprints across languages;
- forcing every domain to have child pages;
- maximizing depth or page count;
- replacing source-code search with atlas search.
