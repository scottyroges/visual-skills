import type { DiagramBlock, DiagramKind } from "./blocks.js";

/** A hand-authored legend row (color is a secondary signal; the label carries meaning). */
export interface LegendItem { label: string; fill: string; stroke: string; }

/** A rendered d2/mermaid diagram inside a section. No title is shown above it — the section
 *  header gives context (unlike the recap's renderDiagramCard which prints a title). */
export interface AtlasDiagram {
  id: string; kind: DiagramKind; d2: string; mermaid?: string;
  legend?: LegendItem[]; caption?: string;     // caption is inline markdown
}

// ---------- atlas-page blocks ----------
export interface AtlasTldrBlock {
  type: "atlas-tldr"; id: string;              // "tldr"
  eyebrow?: string;                            // default "Start here"
  heading: string;                             // inline md
  rows: { key: string; value: string }[];      // value inline md
  primer?: { h: string; p: string }[];         // the numbered "things to hold in your head"
}
export interface DomainMapBlock {
  type: "domain-map"; id: string;              // "map"
  title?: string; badge?: string; intro?: string;
  svg: string;                                 // raw trusted hand-authored SVG
  legend?: LegendItem[]; caption?: string;
}
export interface DomainTile {
  name: string; path: string;
  layer: "foundation" | "engine" | "intelligence" | "narrative" | "surface" | "harness";
  layerLabel: string;                          // "Intelligence"
  purpose: string;                             // inline md
  meta?: { key?: string; value: string }[];    // size / key types — value inline md
  deps?: string[];
  href?: string;                               // present → linked tile; absent → "Page pending"
}
export interface DomainIndexBlock {
  type: "domain-index"; id: string;            // "domains"
  title: string; badge?: string; intro?: string;
  tiles: DomainTile[];
}

// ---------- domain-page blocks ----------
export interface DomainTldrBlock {
  type: "domain-tldr"; id: string;             // "tldr"
  eyebrow?: string;                            // default "Domain"
  heading: string; rows: { key: string; value: string }[];
  bigIdea?: { label?: string; line: string; sub?: string };
}
export interface ComponentCard {
  name: string; purpose: string;               // purpose inline md
  exports?: { name: string; deputy?: boolean }[];
  exportsLabel?: string;                        // default "exports" (or "covers")
  href: string;                                 // "#c-gm"
}
export interface ComponentsBlock {
  type: "components"; id: string;              // "components"
  title: string; badge?: string; intro?: string;
  cards: ComponentCard[];
}
export interface ConnItem { dir: string; body: string; }   // body inline md
export interface KV { name: string; desc: string; }        // name mono; desc inline md
export interface ComponentDeep {
  id: string;                                  // "c-gm" (anchor for its card)
  name: string; path: string;
  detail: string[];                            // paragraphs (block markdown)
  diagrams?: AtlasDiagram[];                    // 0..n
  codeHtml?: string;                           // raw trusted code block (review.css token spans)
  files?: KV[];                                // "Key files"
  exports?: KV[];                              // "Key exports"
  connections?: ConnItem[];
}
export interface DepthBlock {
  type: "depth"; id: string;                   // "depth"
  title: string; badge?: string; intro?: string;
  components: ComponentDeep[];
}
export interface OwnsBlock {
  type: "owns"; id: string;                    // "data"
  title: string; intro?: string; rows: KV[]; note?: string;   // note inline md
}
export interface SeamsBlock {
  type: "seams"; id: string;                   // "seams"
  title: string; intro?: string;
  exposes: { api: string; note?: string }[];
  depends: { name: string; path: string; href?: string }[];   // href absent → flat (no page)
  note?: string;                               // note inline md
}
/** A standalone rendered-diagram section: the atlas "spine" and a domain page's internal-arch. */
export interface DiagramSectionBlock {
  type: "diagram-section"; id: string;
  title?: string; badge?: string; intro?: string;
  diagram: AtlasDiagram;
  callout?: string;                            // optional callout below (inline md)
}

export type AtlasBlock =
  | AtlasTldrBlock | DomainMapBlock | DomainIndexBlock
  | DomainTldrBlock | ComponentsBlock | DepthBlock | OwnsBlock | SeamsBlock
  | DiagramSectionBlock;

/** layer → "fill;stroke" for the small dots used in tiles + the nested sidebar. */
export const LAYER_DOTS: Record<DomainTile["layer"], string> = {
  foundation:   "#e5dbff;#9775fa",
  engine:       "#d0ebff;#4dabf7",
  intelligence: "#ffd43b;#f08c00",
  narrative:    "#d3f9d8;#37b24d",
  surface:      "#eff4ff;#2563eb",
  harness:      "#f1f3f5;#adb5bd",
};

export function atlasDiagramToBlock(d: AtlasDiagram): DiagramBlock {
  return { type: "diagram", id: d.id, title: "", kind: d.kind, d2: d.d2, mermaid: d.mermaid };
}

/** Every rendered diagram across the page, in document order (diagram-section first, then
 *  each depth component's diagrams). domain-map is NOT here — it's a raw hand-authored SVG. */
export function collectAtlasDiagrams(blocks: AtlasBlock[]): DiagramBlock[] {
  const out: DiagramBlock[] = [];
  for (const b of blocks) {
    if (b.type === "diagram-section") out.push(atlasDiagramToBlock(b.diagram));
    if (b.type === "depth")
      for (const c of b.components)
        for (const d of c.diagrams ?? [])
          out.push(atlasDiagramToBlock(d));
  }
  return out;
}

export function assertUniqueAtlasIds(blocks: AtlasBlock[]): void {
  const seen = new Set<string>();
  const add = (id: string) => {
    if (seen.has(id)) throw new Error(`duplicate id "${id}" — block, component, and diagram ids must be unique`);
    seen.add(id);
  };
  for (const b of blocks) {
    add(b.id);
    if (b.type === "diagram-section") add(b.diagram.id);
    if (b.type === "depth")
      for (const c of b.components) {
        add(c.id);
        for (const d of c.diagrams ?? []) add(d.id);
      }
  }
}

/** tldr blocks are the lead; everything else is a numbered chapter. */
export function isAtlasChapter(b: AtlasBlock): boolean {
  return b.type !== "atlas-tldr" && b.type !== "domain-tldr";
}
export function atlasChapterLabel(b: AtlasBlock): string {
  switch (b.type) {
    case "domain-map": return b.title ?? "Domain map";
    case "domain-index": return b.title;
    case "diagram-section": return b.title ?? "Diagram";
    case "components": return b.title;
    case "depth": return b.title;
    case "owns": return b.title;
    case "seams": return b.title;
    case "atlas-tldr":
    case "domain-tldr": return b.id;
    default: { const _exhaustive: never = b; return (_exhaustive as AtlasBlock).id; }
  }
}
