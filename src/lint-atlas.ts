// Document-level completeness lint for visual-atlas — the "demo-standard floor", mirroring
// lint-spec. A bare atlas/domain page that skips the lead, the map, or the index underdelivers;
// these warnings (surfaced via onWarn) nudge the author back to the standard and tell the agent
// which scanner-drafted fields still need enriching. Heuristics, not hard errors.
import type { AtlasBlock, DomainIndexBlock, DepthBlock } from "./atlas-blocks.js";
import type { TopicShape } from "./atlas-config.js";

/** A domain with this many deep-dive components warrants an internal-architecture diagram. */
const LARGE_COMPONENTS = 4;

/** Atlas-page floor: a 'Start here' lead, the domain map, and the tile index with real purposes. */
export function lintAtlas(blocks: AtlasBlock[]): string[] {
  const warns: string[] = [];
  const has = (t: AtlasBlock["type"]) => blocks.some((b) => b.type === t);

  if (!has("atlas-tldr"))
    warns.push("no atlas-tldr — lead with a 'Start here': what the system does in one line and the few things to hold in mind");

  const mapPresent = blocks.some((b) => b.type === "domain-map" || (b.type === "diagram-section" && b.id === "map"));
  if (!mapPresent)
    warns.push("no domain map — a newcomer needs the all-domains picture (a domain-map block or a 'map' diagram-section)");

  const index = blocks.find((b): b is DomainIndexBlock => b.type === "domain-index");
  if (!index) {
    warns.push("no domain-index — the grid of domain tiles is the atlas's onboarding map and reference index");
  } else {
    const noPurpose = index.tiles.filter((t) => !t.purpose?.trim()).length;
    if (noPurpose) warns.push(`${noPurpose} domain tile(s) have no purpose — one line on what each domain is for (enrich the scanner draft)`);
  }

  return warns;
}

/** Domain-page floor: the lead, the components, an internal-arch diagram when large, and the seams. */
export function lintDomain(blocks: AtlasBlock[], opts: { hasChildren?: boolean } = {}): string[] {
  const warns: string[] = [];
  const has = (t: AtlasBlock["type"]) => blocks.some((b) => b.type === t);

  if (!has("domain-tldr"))
    warns.push("no domain-tldr — open with what this domain owns, why it exists, its responsibilities");
  if (!opts.hasChildren && !has("components"))
    warns.push("no components block — list the domain's modules/services with a one-line purpose each");

  const depth = blocks.find((b): b is DepthBlock => b.type === "depth");
  const large = (depth?.components.length ?? 0) >= LARGE_COMPONENTS;
  const archPresent = blocks.some((b) => b.type === "diagram-section");
  if (large && !archPresent)
    warns.push("no internal-arch diagram — a domain this size should show how its pieces wire up (a diagram-section)");

  if (!has("seams"))
    warns.push("no seams block — name what the domain exposes and what it depends on from neighbors");

  return warns;
}

type AtlasPageKind = "atlas" | "domain" | "topic";

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

function blockProse(block: AtlasBlock): string[] {
  switch (block.type) {
    case "atlas-tldr": return [
      block.heading,
      ...block.rows.map((row) => row.value),
      ...(block.primer ?? []).flatMap((item) => [item.h, item.p]),
    ];
    case "domain-map": return [block.title, block.intro, block.caption].filter((value): value is string => !!value);
    case "domain-index": return [block.title, block.intro, ...block.tiles.map((tile) => tile.purpose)].filter((value): value is string => !!value);
    case "domain-tldr": return [
      block.heading,
      ...block.rows.map((row) => row.value),
      block.bigIdea?.line,
      block.bigIdea?.sub,
    ].filter((value): value is string => !!value);
    case "topic-tldr": return [block.heading, block.summary, block.when, ...block.inputs, ...block.outputs]
      .filter((value): value is string => !!value);
    case "topic-flow": return [block.title, block.intro, ...block.steps.flatMap((step) => [step.title, step.body])]
      .filter((value): value is string => !!value);
    case "topic-rules": return [
      block.title,
      block.intro,
      ...block.guarantees,
      ...block.failures.flatMap((failure) => [failure.condition, failure.behavior]),
    ].filter((value): value is string => !!value);
    case "implementation-reference": return [block.title];
    case "components": return [block.title, block.intro, ...block.cards.map((card) => card.purpose)]
      .filter((value): value is string => !!value);
    case "diagram-section": return [block.title, block.intro, block.diagram.caption, block.callout]
      .filter((value): value is string => !!value);
    case "depth": return [
      block.title,
      block.intro,
      ...block.components.flatMap((component) => [
        ...component.detail,
        ...(component.files ?? []).map((file) => file.desc),
        ...(component.exports ?? []).map((item) => item.desc),
        ...(component.connections ?? []).map((connection) => connection.body),
        ...(component.diagrams ?? []).flatMap((diagram) => [diagram.caption ?? ""]),
      ]),
    ].filter((value): value is string => !!value);
    case "owns": return [block.title, block.intro, ...block.rows.map((row) => row.desc), block.note]
      .filter((value): value is string => !!value);
    case "seams": return [
      block.title,
      block.intro,
      ...block.exposes.map((item) => item.note ?? ""),
      block.note,
    ].filter((value): value is string => !!value);
    case "example": return [
      block.title,
      block.source,
      block.lesson,
      ...(block.stages ?? []).flatMap((stage) => [stage?.label ?? "", stage?.body ?? ""]),
    ].filter((value): value is string => !!value);
    default: { const exhaustive: never = block; return exhaustive; }
  }
}

const HISTORY_PATTERNS = [
  /\bPR\s*#?\d+\b/i,
  /\btask(?:s)?\s*(?:#?\d+|implementation)\b/i,
  /\breview\s+round\b/i,
  /\bsupersed(?:e|es|ed|ing)\b/i,
  /\b(?:previous|old)\s+(?:version|implementation|behavior|design)\b/i,
];

export function lintReadability(
  blocks: AtlasBlock[],
  pageKind: AtlasPageKind,
  opts: { cardPurposes?: string[] } = {},
): string[] {
  const warnings: string[] = [];
  const prose = blocks.flatMap(blockProse);
  const history = prose.find((text) => HISTORY_PATTERNS.some((pattern) => pattern.test(text)));
  if (history) warnings.push("project history appears in standing atlas prose — rewrite as one coherent description of current behavior");

  const longParagraph = prose.find((text) => words(text) > 100);
  if (longParagraph) warnings.push(`paragraph exceeds roughly 100 words (${words(longParagraph)}) — shorten, structure, or extract it`);

  const cardPurposes = [
    ...opts.cardPurposes ?? [],
    ...blocks.flatMap((block) => block.type === "domain-index"
      ? block.tiles.map((tile) => tile.purpose)
      : block.type === "components" ? block.cards.map((card) => card.purpose) : []),
  ];
  const longCard = cardPurposes.find((purpose) => words(purpose) > 40);
  if (longCard) warnings.push(`card purpose exceeds roughly 40 words (${words(longCard)}) — keep the card focused on why to open the page`);

  const total = prose.reduce((sum, text) => sum + words(text), 0);
  if (pageKind === "domain" && total > 1200)
    warnings.push(`domain page has more than 1,200 visible prose words (${total}) — shorten or extract focused topics`);
  if (pageKind === "topic" && total < 180)
    warnings.push(`topic page has fewer than roughly 180 visible narrative words (${total}) — it may still be an outline rather than an explanation`);
  if (pageKind === "topic" && total > 2000)
    warnings.push(`topic page has more than 2,000 visible prose words (${total}) — extract an independently useful child topic`);
  return warnings;
}

export function lintTopic(blocks: AtlasBlock[], shape?: TopicShape): string[] {
  const warnings: string[] = [];
  const has = (type: AtlasBlock["type"]) => blocks.some((block) => block.type === type);
  const lead = blocks.find((block) => block.type === "topic-tldr");
  const flow = blocks.find((block) => block.type === "topic-flow");
  const rules = blocks.find((block) => block.type === "topic-rules");
  const reference = blocks.find((block) => block.type === "implementation-reference");
  const nonEmpty = (value: string | undefined): boolean => !!value?.trim();

  if (!lead || lead.type !== "topic-tldr") {
    warnings.push("no topic-tldr — start with what this mechanism does and when it runs");
  } else {
    if (!nonEmpty(lead.summary)) warnings.push("topic-tldr summary is empty — explain what the topic does");
    if (!lead.inputs.some(nonEmpty)) warnings.push("topic-tldr has no input — name what enters the mechanism");
    if (!lead.outputs.some(nonEmpty)) warnings.push("topic-tldr has no output — name what the mechanism produces or changes");
  }

  if (!flow || flow.type !== "topic-flow") {
    warnings.push(`no topic-flow — a ${shape ?? "technical"} topic needs an ordered explanation`);
  } else {
    const completeSteps = flow.steps.filter((step) => nonEmpty(step.title) && nonEmpty(step.body));
    if (completeSteps.length < 2)
      warnings.push("topic-flow needs at least two non-empty steps — explain meaningful movement, not a placeholder");
    if (flow.steps.some((step) => !nonEmpty(step.title) || !nonEmpty(step.body)))
      warnings.push("topic-flow has a flow step with a blank title or body — finish or remove the partial step");
  }

  if (!rules || rules.type !== "topic-rules") {
    warnings.push("no topic-rules — name guarantees and failure behavior explicitly");
  } else {
    if (!rules.guarantees.some(nonEmpty)) warnings.push("topic-rules has no guarantee — name the invariant the mechanism preserves");
    const completeFailures = rules.failures.filter((failure) =>
      nonEmpty(failure.condition) && nonEmpty(failure.behavior));
    if (!completeFailures.length && !nonEmpty(rules.intro))
      warnings.push("topic-rules needs a condition/behavior failure or an introduction explaining why no material failure branch applies");
  }

  if (!reference || reference.type !== "implementation-reference") {
    warnings.push("no implementation-reference — connect the explanation to its source evidence");
  } else {
    const files = reference.groups.flatMap((group) => group.files);
    if (!reference.groups.length || !files.length)
      warnings.push("implementation-reference has no source files — include the evidence used to author the page");
    if (files.some((file) => !nonEmpty(file.desc)))
      warnings.push("implementation-reference file description is empty — explain what each source contributes");
  }

  const hasTrace = has("diagram-section") || has("example");
  if (flow?.type === "topic-flow" && flow.steps.length >= 4 && !hasTrace)
    warnings.push("multi-stage topic has no diagram or worked example — show one grounded path through the mechanism");
  if (shape === "algorithm" && !has("example"))
    warnings.push("algorithm topic has no worked example — exercise a meaningful decision with concrete values or records");
  if (blocks.filter((block) => block.type === "topic-flow").length > 1)
    warnings.push("topic contains multiple independent mechanisms — consider extracting a child page");
  return [...warnings, ...lintReadability(blocks, "topic")];
}
