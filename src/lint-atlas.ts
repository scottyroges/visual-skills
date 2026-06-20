// Document-level completeness lint for visual-atlas — the "demo-standard floor", mirroring
// lint-spec. A bare atlas/domain page that skips the lead, the map, or the index underdelivers;
// these warnings (surfaced via onWarn) nudge the author back to the standard and tell the agent
// which scanner-drafted fields still need enriching. Heuristics, not hard errors.
import type { AtlasBlock, DomainIndexBlock, DepthBlock } from "./atlas-blocks.js";

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
export function lintDomain(blocks: AtlasBlock[]): string[] {
  const warns: string[] = [];
  const has = (t: AtlasBlock["type"]) => blocks.some((b) => b.type === t);

  if (!has("domain-tldr"))
    warns.push("no domain-tldr — open with what this domain owns, why it exists, its responsibilities");
  if (!has("components"))
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
