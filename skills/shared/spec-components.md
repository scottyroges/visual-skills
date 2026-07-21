# Spec-Component Catalog

Reusable layout components for a **visual spec** — a single self-contained HTML page that gets a
reader up to speed on a design spec fast, then lets them drill in to *approve* it. Sibling to the
[Diagram Catalog](diagrams.md): that catalog covers d2/mermaid diagrams the renderer compiles;
this one covers the HTML/CSS section components and the hand-authored SVG hero.

**Worked reference:** [`example/spec-season-planner/spec.html`](../../example/spec-season-planner/spec.html)
— the canonical "what good looks like" build. Every recipe below is lifted from it.

## How it assembles

A visual spec reuses the recap's **app shell** verbatim (`header.topbar` → `div.layout` with
`nav.sidebar` + `main.main`, plus the sidebar-overlay, zoom-overlay, and the sidebar/scrollspy/zoom
`<script>`). It loads two stylesheets, in order:

1. `assets/review.css` — the design system (tokens, topbar, sidebar, chips, code blocks, diagrams,
   progress rail, responsive shell). **Do not redefine these.**
2. `assets/spec.css` — the spec-specific components in this catalog.

The shipped artifact **inlines both** into one `<style>` so it stays self-contained over `file://`
(same as the recap demo). `assets/spec.css` is the source of truth; the example inlines a snapshot.

**Input vs output.** The snippets below are the **rendered HTML** each component produces — they show
you the shape and classes. You don't write this HTML by hand: you author **typed JSON blocks** in a
`spec.json`, and `assemble-spec.ts` generates the HTML. The exact JSON field shape of every block is
defined and commented in [`src/spec-blocks.ts`](../../src/spec-blocks.ts) — read it as you author.

**Page options** (the `spec.json` top level, not blocks) drive the page chrome:

    { "title": "…", "phase": "…", "status": "…", "date": "…", "complexity": "…",
      "related": [{ "kind": "Predecessor", "value": "…" }],   // sidebar Related — plain strings, no links
      "meta":    [{ "key": "Status", "value": "…" }],          // sidebar Meta — plain strings
      "blocks":  [ … ] }

`title`/`phase`/`status`/`date`/`complexity` are the topbar chips; `related` and `meta` are arrays of
plain-string pairs (NOT link objects).

## Section ladder (orientation → approval)

Author top-to-bottom in this order; it takes a cold reader from "what is this" to "I can sign off":

1. **TL;DR card** + **Big-idea panel** — the lead.
2. **Progress rail** — jump-nav across sections 1–N (reused from review.css).
3. **Info-flow hero** — the one architecture diagram: what's new vs what's preserved.
4. **Anatomy explainer** + **component card grid** — the structure, made scannable.
5. **Where-it-fits** — predecessor → this → consumer, plus the layer stack.
6. **Key decisions** — choice + *why*, with rejected alternatives on the contested ones.
7. **Scope** (in/out) → **Rollout** (phased, gated) → **Definition of done** (targets) → **Risks**.
8. **Before you approve** — the reviewer's capstone.
9. **Reference** — full depth in collapsed `<details>`.

Scale to the spec: a small spec may drop the hero, the rollout, and the approval band. Never drop
the TL;DR or the decisions.

## Color / role vocabulary

Reuse the shared diagram palette (see [Color vocabulary](diagrams.md#color-vocabulary)) so the page
reads as one system. Spec pages lean on three roles plus two spec-specific tints baked into
`spec.css`:

| meaning | role / token | fill / stroke |
|---|---|---|
| new this phase (the subject) | `changed` (gold) | `#ffd43b` / `#f08c00` |
| preserved / untouched machinery | `external` → `--reused` | `#f1f3f5` / `#ced4da` |
| datastore / world state | `store` (violet) | `#e5dbff` / `#9775fa` |
| perception / process | `actor` (blue) | `#d0ebff` / `#4dabf7` |
| GM-skill-noised "perceived" layer | `--perceived` | ink `#92600a` on `#fff8e6` |

Rule of thumb: **gold = new/uncertain/judgment**, **gray = kept/factual/safe**. Mark the new
subject; leave preserved pieces neutral. Color is always a secondary signal — every component
carries a text label or legend too.

<!-- catalog-entries-start -->

### TL;DR card + Big-idea panel
- **Use when:** always — the lead. The card answers What / Why / Closes / Size in one scan; the
  big-idea panel pulls the spec's single load-bearing insight out as a headline.
- **Notes:** the card reuses review.css `.tldr-*`. The big-idea panel is the one place to be bold —
  one sentence, gold-tinted. Don't add a second.

```html
<div class="tldr-card">
  <div class="tldr-header"><span class="tldr-eyebrow">TL;DR</span>
    <h2 class="tldr-heading">One-line framing of the whole spec.</h2></div>
  <div class="tldr-rows">
    <div class="tldr-row"><span class="tldr-key">What</span><span class="tldr-val">…one line…</span></div>
    <div class="tldr-row"><span class="tldr-key">Why</span><span class="tldr-val">…the problem today…</span></div>
    <div class="tldr-row"><span class="tldr-key">Closes</span><span class="tldr-val">…the payoff…</span></div>
    <div class="tldr-row"><span class="tldr-key">Size</span><span class="tldr-val">…N components · M sites · K phases…</span></div>
  </div>
</div>
<div class="bigidea">
  <div class="bigidea-label">The big idea</div>
  <div class="bigidea-line">“The one sentence that is the whole spec.”</div>
  <p class="bigidea-sub">Two or three sentences of expansion. <strong>Bold</strong> the pivot.</p>
</div>
```

### Info-flow hero (architecture SVG)
- **Use when:** the spec adds a layer/component to an existing system — lead with *what's new vs
  what stays*. Hand-authored inline `<svg class="diagram-svg flow-svg">` inside the standard
  `.diagram-box` (so it inherits enlarge + zoom). A skeleton, not d2 — adapt the layout per spec.
- **Avoid when:** a d2/mermaid catalog diagram fits (then use the renderer instead).
- **Recipe:** lay nodes out left→right by pipeline stage; mark the new node `changed`-gold, keep
  preserved layers gray, datastores violet, process/perception blue. Reuse the role fills above.
  Always follow with a `.legend`. Set `font-family` via the `.flow-svg text` rule (in spec.css).

```html
<div class="diagram-box">
  <button class="diagram-enlarge" type="button" aria-label="Enlarge diagram">⤢ Enlarge</button>
  <svg class="diagram-svg flow-svg" viewBox="0 0 1180 600" role="img" aria-label="…describe the flow…">
    <defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
      <path d="M0 0 L7 3 L0 6 z" fill="#868e96"/></marker></defs>
    <!-- a preserved node (gray) -->
    <rect x="24" y="232" width="150" height="96" rx="8" fill="#e5dbff" stroke="#9775fa"/>
    <text x="99" y="268" text-anchor="middle" font-size="15" font-weight="700" fill="#1b1b1b">World state</text>
    <!-- THE NEW node (gold, bold stroke) -->
    <rect x="430" y="120" width="320" height="320" rx="10" fill="#ffd43b" stroke="#f08c00" stroke-width="2"/>
    <text x="446" y="151" font-size="18" font-weight="800" fill="#1b1b1b">NewThing</text>
    <rect x="636" y="134" width="98" height="21" rx="10" fill="#e8590c"/>
    <text x="685" y="149" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">NEW LAYER</text>
    <!-- arrow -->
    <line x1="174" y1="280" x2="426" y2="280" stroke="#868e96" stroke-width="1.6" marker-end="url(#ah)"/>
  </svg>
</div>
<div class="legend" aria-label="Diagram legend">
  <span class="legend-item"><span class="legend-swatch" style="background:#ffd43b;border-color:#f08c00;"></span>New this phase</span>
  <span class="legend-item"><span class="legend-swatch" style="background:#f1f3f5;border-color:#ced4da;"></span>Preserved · untouched</span>
</div>
```

### Anatomy explainer (two-layer duality)
- **Use when:** the spec has a recurring two-part shape worth teaching once before the cards —
  e.g. factual-core vs perceived-layer, server vs client, sync vs async. Three-cell grid:
  left panel, a center connector, right panel. Collapses to one column on mobile.
- **Avoid when:** there's no recurring duality; go straight to the cards.

```html
<div class="anatomy">
  <div class="anatomy-panel anatomy-factual">
    <div class="anatomy-h"><span>■</span> Factual core</div>
    <div class="anatomy-desc">Computed from world state. <strong>Same for everyone.</strong></div>
    <div class="anatomy-eg">field · field</div>
  </div>
  <div class="anatomy-mid"><div class="anatomy-arrow" aria-hidden="true">→</div>
    <div class="anatomy-fn">transform(truth, skill)</div></div>
  <div class="anatomy-panel anatomy-perceived">
    <div class="anatomy-h"><span>■</span> Perceived layer</div>
    <div class="anatomy-desc">Skill-noised judgment. <strong>Where it differs.</strong></div>
    <div class="anatomy-eg">field · field</div>
  </div>
</div>
<p class="anatomy-caption">One line tying the duality to the reader's mental model.</p>
```

### Component card grid
- **Use when:** the spec introduces a set of peer pieces (modules, boards, services, states).
  Auto-fit grid; each card carries a name, a one-line purpose, role/skill chips, an optional
  two-tone `.split-badge`, and a key-field list split by the duality (`field-fact` / `field-perc`).
- **Avoid when:** there's only one piece (describe it in prose) or more than ~8 (group them).

```html
<div class="board-grid">
  <div class="board-card">
    <div class="board-name">ComponentName</div>
    <div class="board-purpose">One line: what it answers.</div>
    <div class="board-row"><span class="board-row-label">skill</span>
      <span class="skill-chip">primarySkill</span><span class="skill-chip is-deputy">modulator</span></div>
    <span class="split-badge"><span class="sb-fact">factual half</span><span class="sb-perc">perceived half</span></span>
    <div class="board-fields">
      <div class="field-line field-fact"><span class="field-tag">F</span><span class="field-names">factualA, factualB</span></div>
      <div class="field-line field-perc"><span class="field-tag">P</span><span class="field-names">perceivedA, perceivedB</span></div>
    </div>
  </div>
  <!-- repeat per component -->
</div>
```

### Where-it-fits (chain + layer stack)
- **Use when:** the reader needs to place the work in a sequence (predecessor → this → consumer)
  and/or a layer stack (new on top of preserved). The `.is-this` node is gold; preserved layers
  use `.is-reused`. Both collapse to a vertical stack on mobile.

```html
<div class="fits-chain">
  <div class="fits-node"><div class="fits-role">Predecessor</div><div class="fits-title">Prior work</div>
    <div class="fits-desc">decides <em>how</em></div></div>
  <div class="fits-arrow" aria-hidden="true"><span>→</span></div>
  <div class="fits-node is-this"><div class="fits-role">This phase</div><div class="fits-title">This spec</div>
    <div class="fits-desc">decides <em>which</em> &amp; <em>when</em></div></div>
  <div class="fits-arrow" aria-hidden="true"><span>→</span></div>
  <div class="fits-node"><div class="fits-role">Consumer</div><div class="fits-title">Downstream</div>
    <div class="fits-desc">decides <em>what number</em></div></div>
</div>
<div class="layer-stack">
  <div class="layer is-new"><span class="layer-tag">New</span><span class="layer-label">NewLayer</span>
    <span class="layer-note">the new top layer</span></div>
  <div class="layer is-reused"><span class="layer-tag">Kept</span><span class="layer-label">ExistingLayer</span>
    <span class="layer-note">consumes derived fields; machinery unchanged</span></div>
</div>
```

### Decision cards (choice + why + rejected)
- **Use when:** the spec records locked design decisions — the highest-value content for an
  approver. Every card shows the question and the choice. Add `.decision-why` to **all** cards.
  Add `.decision-alt` (the red **Rejected** tag + the path not taken) to **only the 2–3 most
  contested** decisions — the asymmetry itself signals which forks were real.
- **Avoid when:** there were no genuine alternatives (then it's a fact, not a decision).

```html
<div class="decision-grid">
  <div class="decision-card"><span class="decision-num">1</span><div>
    <div class="decision-q">The axis being decided</div>
    <div class="decision-a">The choice made</div>
    <div class="decision-why">the positive reason it won.</div>
    <div class="decision-alt"><span class="decision-alt-tag">Rejected</span>the alternative — why it lost.</div>
  </div></div>
  <!-- cards without .decision-alt for the uncontested ones -->
</div>
```

### Scope (in / out)
- **Use when:** always for a non-trivial spec — boundaries are approval-critical. Two columns;
  anti-goals on the right with `→ Phase X` deferral pointers. Collapses to one column on mobile.

```html
<div class="scope-cols">
  <div class="scope-col scope-in">
    <div class="scope-head">In scope <span class="scope-count">· N goals</span></div>
    <ul class="scope-list"><li><span class="scope-marker">✓</span><span>…goal…</span></li></ul>
  </div>
  <div class="scope-col scope-out">
    <div class="scope-head">Out of scope <span class="scope-count">· anti-goals</span></div>
    <ul class="scope-list"><li><span class="scope-marker">×</span><span>…not this… <span class="defer">→ Phase X</span></span></li></ul>
  </div>
</div>
```

### Rollout phases (scope + gate)
- **Use when:** the spec ships in sub-phases. One `.phase` per phase; each pairs a scope blurb
  with its **acceptance gate** (the exit criteria). Body is two columns, collapsing on mobile.
- **Avoid when:** single-shot delivery (state that plainly instead).

```html
<div class="phases">
  <div class="phase">
    <div class="phase-head"><span class="phase-tag">P.A</span><span class="phase-title">Phase name</span></div>
    <div class="phase-body">
      <div class="phase-scope"><div class="phase-sub">Scope</div><p>…what this phase builds…</p></div>
      <div class="phase-gate"><div class="phase-sub">Acceptance gate</div>
        <ul class="gate-list"><li><span class="gate-check">✓</span>…measurable exit criterion…</li></ul></div>
    </div>
  </div>
</div>
```

### Definition of done (movers + targets table)
- **Use when:** "done" is measurable. Lead with `.movers` for the 2–3 headline metrics that
  *change* (before → after, the old value struck through), then a `.spec-table` for the rest.
  Mark a passing/target value `.good` (already contrast-safe). Add a `.tbl-note` for methodology.

```html
<div class="movers">
  <div class="mover"><div class="mover-name">metric_name</div>
    <div class="mover-vals"><span class="mover-now">now <s>old</s></span><span class="mover-arrow">→</span><span class="mover-target">target</span></div>
    <div class="mover-label">what it proves</div></div>
</div>
<table class="spec-table"><thead><tr><th>Signal</th><th>Target</th><th>Why it validates</th></tr></thead>
  <tbody><tr><td>…</td><td class="num good">…</td><td>…</td></tr></tbody></table>
<p class="tbl-note">Validation methodology…</p>
```

### Risk cards (risk → mitigation)
- **Use when:** the spec has a risk register. Each card: the risk (red header) over its mitigation.
  Bold the mitigating mechanism with `<b>`.

```html
<div class="risk-grid">
  <div class="risk-card">
    <div class="risk-r"><span class="risk-icon">⚠</span><span>The risk, stated plainly.</span></div>
    <div class="risk-m"><b>Mitigation:</b> how it's bounded.</div>
  </div>
</div>
```

### Before you approve (reviewer capstone)
- **Use when:** the spec is meant to be approved from the page. Three cards: **commit** (what
  sign-off greenlights — emphasize staging/reversibility), **scrutinize** (the single riskiest
  thing, linked to its reference drawer via `href="#ref-…"`), **open** (non-blocking questions,
  surfaced out of the drawer).
- **Avoid when:** the page is pure orientation, not a sign-off surface.

```html
<div class="approve-grid">
  <div class="approve-card commit"><div class="approve-head"><span aria-hidden="true">▢</span> What you're approving</div>
    <div class="approve-body">A <strong>staged rollout</strong> — sign-off greenlights phase A first, behind a hard gate…</div></div>
  <div class="approve-card scrutinize"><div class="approve-head"><span aria-hidden="true">⚠</span> Scrutinize hardest</div>
    <div class="approve-body">The riskiest seam… <a href="#ref-sites">See the detail ›</a></div></div>
  <div class="approve-card open"><div class="approve-head"><span aria-hidden="true">◯</span> Still open — non-blocking</div>
    <div class="approve-body"><ol class="approve-q"><li>open question…</li></ol></div></div>
</div>
```

### Reference drill-down
- **Use when:** there's depth a careful reader wants but orientation doesn't need — full type
  defs, algorithms, lifecycle tables, decision-site maps. Native `<details class="ref">` so it
  works without JS; give each a stable `id` so the approval band and cross-links can target it.
  Code uses review.css token spans (`.kw` `.ty` `.fn` `.str` `.cm`); tables use `.spec-table`.

```html
<details class="ref" id="ref-types">
  <summary><svg class="ref-chev" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Section name<span class="ref-tally">count</span></summary>
  <div class="ref-body">
    <div class="code-block"><pre><span class="kw">interface</span> <span class="ty">Name</span> { … }</pre></div>
  </div>
</details>
```
