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
  if (pageKind === "topic" && total > 2000)
    warnings.push(`topic page has more than 2,000 visible prose words (${total}) — extract an independently useful child topic`);
  return warnings;
}

export function lintTopic(blocks: AtlasBlock[], shape?: TopicShape): string[] {
  const warnings: string[] = [];
  const has = (type: AtlasBlock["type"]) => blocks.some((block) => block.type === type);
  if (!has("topic-tldr")) warnings.push("no topic-tldr — start with what this mechanism does and when it runs");
  if (!has("topic-flow")) warnings.push(`no topic-flow — a ${shape ?? "technical"} topic needs an ordered explanation`);
  if (!has("topic-rules")) warnings.push("no topic-rules — name guarantees and failure behavior explicitly");
  if (blocks.filter((block) => block.type === "topic-flow").length > 1)
    warnings.push("topic contains multiple independent mechanisms — consider extracting a child page");
  return [...warnings, ...lintReadability(blocks, "topic")];
}
