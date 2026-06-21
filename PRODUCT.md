# Product

## Register

product

## Users

A developer reviewing a pull request. Two reading contexts, weighted equally:
- **Author self-review** — the person who wrote the change, scanning it before merge to catch
  mistakes and confirm the story holds together.
- **Cold reviewer** — a teammate or future reader who opens the single HTML file with zero prior
  context and needs to get oriented fast.

Stack context is Prisma + tRPC TypeScript backends; the tool is solo-first but the output must
stand on its own when handed to someone else.

## Product Purpose

Turn a pull request (or any git diff) into a **single self-contained HTML review document** that
(1) surfaces the essence of the change in ~10 seconds and (2) then walks the reviewer through it as
a deliberate narrative — data → logic → API → tests — instead of a flat pile of diffs. It beats
raw diff review by adding orientation, ordering, the *why*, and diagrams, while staying a single
file that opens offline over `file://` with no server and no view-time dependencies beyond a small
inlined script.

Success = a reviewer (author or cold) understands what changed, why, and where the risk is, faster
and more confidently than reading the diff in GitHub.

## Brand Personality

A knowledgeable colleague walking you through their change at a whiteboard. Clear, guided,
craftsmanlike. Warm but precise — confident enough to tell you what matters and what to skip.
Three words: **guided, legible, considered.**

## Anti-references

- **Raw GitHub diff view** — a wall of equal-weight hunks with no narrative or priority.
- **Generic SaaS dashboard** — hero-metric cards, big-number-small-label templates, decorative
  gradients. This is a reading surface, not a KPI screen.
- **Cluttered enterprise review tools** — dense chrome, nested panels, noise that competes with
  the actual change.

## Design Principles

1. **Understanding before detail.** Lead with the essence; reveal code progressively. The reviewer
   should be able to stop early and still know what happened.
2. **Narrative over pile.** Present the change in a deliberate, meaningful order so it reads like a
   story, not a directory listing.
3. **Surface the why.** Every group and non-trivial change carries its intent, not just its lines.
4. **Self-contained and legible offline.** One file, works on `file://`, readable text and AA
   contrast, color is never the only signal (legend + labels).
5. **Show the change, don't just list it.** Diagrams and structure carry meaning the diff can't.

## Accessibility & Inclusion

- WCAG AA contrast for body and UI text (≥4.5:1; ≥3:1 for large/bold). Recently corrected the
  diagram label contrast — keep it.
- Every animation needs a `prefers-reduced-motion: reduce` alternative (crossfade or instant).
- Color is a secondary signal only: semantic diagram roles always carry a text legend; add/remove
  use markers, not hue alone.
- Keyboard-navigable; collapsible sections use native `<details>` so they work without JS.
- Must remain fully functional offline over `file://`.
