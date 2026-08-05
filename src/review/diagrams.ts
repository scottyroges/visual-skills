import type { Block, DiagramBlock, SchemaBlock } from "../blocks.js";
import { isDiagramBlock, walkBlocks } from "../blocks.js";
import { renderAll, type DiagramResult, type RenderOpts } from "../render-diagram.js";

// Both traversals below run on walkBlocks — blocks.ts owns the list of container paths.
export function assertUniqueIds(blocks: Block[], seen = new Set<string>()): void {
  walkBlocks(blocks, (b) => {
    if (seen.has(b.id)) throw new Error(`duplicate block id "${b.id}" — ids must be unique`);
    seen.add(b.id);
  });
}

export function collectDiagrams(bs: Block[]): (DiagramBlock | SchemaBlock)[] {
  const out: (DiagramBlock | SchemaBlock)[] = [];
  walkBlocks(bs, (b) => { if (isDiagramBlock(b)) out.push(b); });
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
