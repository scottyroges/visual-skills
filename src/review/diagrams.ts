import type { Block, DiagramBlock, SchemaBlock } from "../blocks.js";
import { isDiagramBlock } from "../blocks.js";
import { renderAll, type DiagramResult, type RenderOpts } from "../render-diagram.js";

export function assertUniqueIds(blocks: Block[], seen = new Set<string>()): void {
  for (const b of blocks) {
    if (seen.has(b.id)) throw new Error(`duplicate block id "${b.id}" — ids must be unique`);
    seen.add(b.id);
    if (b.type === "group") assertUniqueIds(b.blocks, seen);
    else if (b.type === "tabs") assertUniqueIds(b.tabs.map((t) => t.block), seen);
    else if (b.type === "diff" && b.diagram) assertUniqueIds([b.diagram], seen);
    else if (b.type === "overview" && b.diagram) assertUniqueIds([b.diagram], seen);
  }
}

export function collectDiagrams(bs: Block[]): (DiagramBlock | SchemaBlock)[] {
  const out: (DiagramBlock | SchemaBlock)[] = [];
  for (const b of bs) {
    if (isDiagramBlock(b)) out.push(b);
    else if (b.type === "group") out.push(...collectDiagrams(b.blocks));
    else if (b.type === "tabs") out.push(...collectDiagrams(b.tabs.map((t) => t.block)));
    else if (b.type === "diff" && b.diagram) out.push(...collectDiagrams([b.diagram]));
    else if (b.type === "overview" && b.diagram) out.push(...collectDiagrams([b.diagram]));
  }
  return out;
}

export async function renderAllDiagrams(
  blocks: Block[], opts: RenderOpts,
): Promise<Map<string, DiagramResult>> {
  const rendered = await renderAll(collectDiagrams(blocks), opts);
  const map = new Map<string, DiagramResult>();
  for (const r of rendered) map.set(r.id, r);
  return map;
}
