import type { Block, GroupBlock } from "../blocks.js";

/** Wrap maximal runs of top-level `diff` blocks into synthetic `group` chapters so the
 *  walkthrough renders them. Real groups and all other blocks pass through unchanged.
 *  (The mechanical gather emits flat diffs; an enriching agent may instead author groups.) */
export function groupLooseDiffs(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let bucket: Block[] = [];
  let n = 0;
  const flush = () => {
    if (!bucket.length) return;
    const group: GroupBlock = {
      type: "group",
      id: `walkthrough-changes-${n++}`,
      title: "Changes",
      blocks: bucket,
    };
    out.push(group);
    bucket = [];
  };
  for (const b of blocks) {
    if (b.type === "diff") bucket.push(b);
    else { flush(); out.push(b); }
  }
  flush();
  return out;
}
